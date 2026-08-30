import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  MAX_FILE_CONTENT_CHARS,
  MAX_INVENTORY_CHUNK_BYTES,
  MAX_SKILLS_PER_REQUEST,
  MAX_SNAPSHOT_CHARS,
  contentHash,
  isSkillFile,
} from "@hubskillz/shared";
import type {
  InventoryFile,
  InventoryRequest,
  InventoryUpstream,
  SurfaceDescriptor,
} from "@hubskillz/shared";
import { globalLockPath, projectLockPath, readLock } from "./lock";
import type { LockMap } from "./lock";

export interface ScannedFile {
  readonly path: string;
  readonly content: string;
  readonly hash: string;
  readonly size: number;
}

export interface ScannedSkill {
  readonly name: string;
  readonly dir: string;
  readonly files: readonly ScannedFile[];
  readonly contentHash: string;
  /** True when the skill dir, or a dir inside it, is a symlink we followed. */
  readonly link: boolean;
  /** Set when the skills.sh lock next to this surface knows the skill. */
  readonly upstream?: InventoryUpstream;
}

export interface Surface {
  readonly descriptor: SurfaceDescriptor;
  readonly skills: readonly ScannedSkill[];
}

export function globalSkillsRoot(): string {
  return join(homedir(), ".claude", "skills");
}

export function projectSkillsRoot(dir: string): string {
  return join(resolve(dir), ".claude", "skills");
}

export function globalSurfaceLabel(): string {
  return hostname();
}

export function projectSurfaceLabel(dir: string): string {
  // Project first: every surface of one machine shares the host name, so the
  // project is what tells them apart in a list.
  return `${basename(resolve(dir))} (${hostname()})`;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * The skills.sh lock that covers a root: the global one for `~/.claude/skills`,
 * `<project>/skills-lock.json` for a project root (project = parent of `.claude`).
 */
export function lockPathFor(root: string): string {
  const resolved = resolve(root);
  if (resolved === globalSkillsRoot()) return globalLockPath();
  return projectLockPath(dirname(dirname(resolved)));
}

/**
 * One scanned root is one surface. Missing roots scan to zero skills so the
 * surface is still reported.
 */
export async function scanSurface(
  root: string,
  label: string,
  machine: string,
  scope: "global" | "project" = "project",
): Promise<Surface> {
  const lock = await readLock(lockPathFor(root));
  const skills = await scanSkills(root);
  return {
    descriptor: {
      kind: "claude-code-local",
      label,
      machineId: machine,
      path: resolve(root),
      scope,
    },
    skills: await Promise.all(skills.map((skill) => withUpstream(skill, lock))),
  };
}

/**
 * Lock entries are keyed by skill name. A symlinked skill (skills.sh default)
 * may be renamed on the agent side, so the canonical dir name is tried too.
 */
async function withUpstream(
  skill: ScannedSkill,
  lock: LockMap,
): Promise<ScannedSkill> {
  if (lock.size === 0) return skill;
  const names = [skill.name];
  if (skill.link) {
    const real = await realpath(skill.dir).catch(() => skill.dir);
    names.push(basename(real));
  }
  const upstream = names.map((name) => lock.get(name)).find(Boolean);
  return upstream === undefined ? skill : { ...skill, upstream };
}

export async function scanSkills(root: string): Promise<ScannedSkill[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: ScannedSkill[] = [];
  for (const entry of entries) {
    if (!isSkillFile(entry.name)) continue;
    const dir = join(root, entry.name);
    const symlink = entry.isSymbolicLink();
    if (!entry.isDirectory() && !(symlink && (await isDir(dir)))) continue;

    const skill = await scanSkillDir(dir);
    if (skill === null) continue;
    skills.push(symlink ? { ...skill, link: true } : skill);
  }
  return skills.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** One skill directory read whole. Null when it holds no readable file. */
export async function scanSkillDir(dir: string): Promise<ScannedSkill | null> {
  const resolved = resolve(dir);
  const walked = await walk(resolved, "", new Set());
  if (walked.files.length === 0) return null;
  return {
    name: basename(resolved),
    dir: resolved,
    files: walked.files,
    contentHash: contentHash(walked.files),
    link: walked.link,
  };
}

interface Walked {
  readonly files: ScannedFile[];
  readonly link: boolean;
}

async function walk(
  dir: string,
  prefix: string,
  visited: Set<string>,
): Promise<Walked> {
  const real = await realpath(dir).catch(() => dir);
  if (visited.has(real)) return { files: [], link: false };
  visited.add(real);

  const files: ScannedFile[] = [];
  let link = false;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const full = join(dir, entry.name);
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    // Same predicate as the directory side, so hashes match after adoption.
    if (!isSkillFile(relative)) continue;
    const symlink = entry.isSymbolicLink();

    if (entry.isDirectory() || (symlink && (await isDir(full)))) {
      const nested = await walk(full, relative, visited);
      files.push(...nested.files);
      link = link || symlink || nested.link;
      continue;
    }
    if (!entry.isFile() && !symlink) continue;

    const content = await readFile(full, "utf8").catch(() => null);
    if (
      content === null ||
      content.includes("\0") ||
      content.length > MAX_FILE_CONTENT_CHARS
    ) {
      continue;
    }
    files.push({
      path: relative,
      content,
      hash: createHash("sha256").update(content).digest("hex"),
      size: Buffer.byteLength(content, "utf8"),
    });
  }

  return { files: files.sort((a, b) => (a.path < b.path ? -1 : 1)), link };
}

async function isDir(path: string): Promise<boolean> {
  return stat(path)
    .then((stats) => stats.isDirectory())
    .catch(() => false);
}

/**
 * Private skills (no upstream) ship their content so the web app can add them
 * to the directory. Skills over the budget travel as hashes only.
 */
export function inventoryRequestOf(surface: Surface): InventoryRequest {
  return {
    surface: surface.descriptor,
    skills: surface.skills.map(inventorySkillOf),
  };
}

/**
 * The same inventory split so every request fits under the API body limit.
 * Chunk 0 replaces the surface, the others append; a single skill can never
 * exceed the budget on its own (MAX_SNAPSHOT_CHARS is far below it).
 */
export function inventoryChunksOf(surface: Surface): InventoryRequest[] {
  const groups: InventoryRequest["skills"][] = [];
  let group: InventoryRequest["skills"] = [];
  let bytes = 0;
  for (const skill of surface.skills) {
    const item = inventorySkillOf(skill);
    const size = Buffer.byteLength(JSON.stringify(item), "utf8");
    if (
      group.length > 0 &&
      (bytes + size > MAX_INVENTORY_CHUNK_BYTES ||
        group.length >= MAX_SKILLS_PER_REQUEST)
    ) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(item);
    bytes += size;
  }
  groups.push(group);
  if (groups.length === 1) return [inventoryRequestOf(surface)];
  return groups.map((skills, index) => ({
    surface: surface.descriptor,
    skills,
    chunk: { index, total: groups.length },
  }));
}

function inventorySkillOf(
  skill: ScannedSkill,
): InventoryRequest["skills"][number] {
  const snapshot =
    skill.upstream === undefined &&
    skill.files.reduce((sum, file) => sum + file.content.length, 0) <=
      MAX_SNAPSHOT_CHARS;
  const item: InventoryRequest["skills"][number] = {
    name: skill.name,
    contentHash: skill.contentHash,
    files: skill.files.map((file) => {
      const entry: InventoryFile = {
        path: file.path,
        hash: file.hash,
        size: file.size,
      };
      if (snapshot) entry.content = file.content;
      return entry;
    }),
  };
  if (skill.upstream !== undefined) item.upstream = skill.upstream;
  return item;
}
