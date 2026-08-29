import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { InventoryUpstream } from "@hubskillz/shared";

/**
 * One skills.sh lock entry, both formats at once: the global lock (v3) carries
 * `skillFolderHash`, the project lock (v1) carries `computedHash`.
 */
const entrySchema = z.object({
  source: z.string().min(1),
  sourceType: z.string(),
  skillPath: z.string().min(1).optional(),
  skillFolderHash: z.string().min(1).optional(),
  computedHash: z.string().min(1).optional(),
});

const lockSchema = z.object({ skills: z.record(z.string(), z.unknown()) });

export type LockMap = ReadonlyMap<string, InventoryUpstream>;

/** `~/.agents/.skill-lock.json`, written by `npx skills add`. */
export function globalLockPath(): string {
  return join(homedir(), ".agents", ".skill-lock.json");
}

/** `<project>/skills-lock.json`, meant to be committed. */
export function projectLockPath(projectDir: string): string {
  return join(resolve(projectDir), "skills-lock.json");
}

/**
 * Skill name -> upstream ref. A missing or corrupt file, or a corrupt entry,
 * reads as nothing: the scan still runs, the skill is just not linked.
 *
 * Only `github` entries with a `skillPath` are kept. Other source types
 * (git, local, node_modules) are a documented cut in docs/UPSTREAM.md.
 */
export async function readLock(path: string): Promise<LockMap> {
  const map = new Map<string, InventoryUpstream>();
  const raw = await readFile(path, "utf8").catch(() => null);
  if (raw === null) return map;

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return map;
  }
  const lock = lockSchema.safeParse(json);
  if (!lock.success) return map;

  for (const [name, value] of Object.entries(lock.data.skills)) {
    const entry = entrySchema.safeParse(value);
    if (!entry.success) continue;
    const { source, sourceType, skillPath } = entry.data;
    const hash = entry.data.skillFolderHash ?? entry.data.computedHash;
    if (sourceType !== "github" || skillPath === undefined) continue;
    if (hash === undefined) continue;
    map.set(name, { source, skillPath, hash });
  }
  return map;
}
