import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
import { Result, SKILL_MD, isSkillFile, parseSkillMd } from "@hubskillz/shared";
import { readConfig } from "../config";
import { accent, bold, dim, plural, shortPath, table } from "../output";
import { exists, projectSkillsRoot, scanSkillDir } from "../scan";
import type { ScannedSkill, Surface } from "../scan";
import { localSurfaces } from "../surfaces";

export interface DoctorOptions {
  readonly path: string | undefined;
}

export interface Finding {
  /** `error`: the skill cannot load. `warn`: it loads, but something is off. */
  readonly level: "error" | "warn";
  readonly skill: string;
  readonly where: string;
  readonly problem: string;
}

/**
 * How a root reads in the table: `global`, or the repo folder name. The full
 * paths are printed once above, so the rows stay narrow enough to read.
 */
export function whereOf(surface: Surface): string {
  return surface.descriptor.scope === "global"
    ? "global"
    : basename(dirname(dirname(surface.descriptor.path)));
}

function frontmatterOf(skill: ScannedSkill): readonly string[] | null {
  const md = skill.files.find((file) => file.path === SKILL_MD);
  if (md === undefined) return null;
  return parseSkillMd(md.content).frontmatter.map((entry) => entry.key);
}

/** What one scanned skill gets wrong on its own. */
export function skillFindings(
  skill: ScannedSkill,
  where: string,
): readonly Finding[] {
  const keys = frontmatterOf(skill);
  if (keys === null) {
    return [
      {
        level: "error",
        skill: skill.name,
        where,
        problem: `no ${SKILL_MD}, nothing for an agent to load`,
      },
    ];
  }
  const findings: Finding[] = [];
  if (!keys.includes("name")) {
    findings.push({
      level: "warn",
      skill: skill.name,
      where,
      problem: `${SKILL_MD} without a name in its frontmatter`,
    });
  }
  if (!keys.includes("description")) {
    findings.push({
      level: "warn",
      skill: skill.name,
      where,
      problem: `${SKILL_MD} without a description, nothing says when to load it`,
    });
  }
  return findings;
}

/**
 * The same name on the machine root and in a project. Claude Code loads the
 * machine root everywhere, so an identical copy is dead weight and a
 * different one silently wins over the shared version.
 */
export function duplicateFindings(
  surfaces: readonly Surface[],
): readonly Finding[] {
  const global = surfaces.find(
    (surface) => surface.descriptor.scope === "global",
  );
  if (global === undefined) return [];

  const findings: Finding[] = [];
  for (const surface of surfaces) {
    if (surface === global) continue;
    for (const skill of surface.skills) {
      const twin = global.skills.find((entry) => entry.name === skill.name);
      if (twin === undefined) continue;
      findings.push({
        level: "warn",
        skill: skill.name,
        where: whereOf(surface),
        problem:
          twin.contentHash === skill.contentHash
            ? "same content as ~/.claude/skills, safe to delete this copy"
            : "differs from ~/.claude/skills and wins over it here",
      });
    }
  }
  return findings;
}

/**
 * The same skill, byte for byte, in several projects and in no machine root:
 * one `hubskillz move <name> global` covers every project at once.
 */
export function scatteredFindings(
  surfaces: readonly Surface[],
): readonly Finding[] {
  const projects = surfaces.filter(
    (surface) => surface.descriptor.scope !== "global",
  );
  const global = surfaces.find(
    (surface) => surface.descriptor.scope === "global",
  );
  const counts = new Map<string, Set<string>>();
  for (const surface of projects) {
    for (const skill of surface.skills) {
      const key = `${skill.name}\0${skill.contentHash}`;
      const seen = counts.get(key) ?? new Set<string>();
      seen.add(surface.descriptor.path);
      counts.set(key, seen);
    }
  }

  const findings: Finding[] = [];
  for (const [key, paths] of counts) {
    const name = key.split("\0")[0] ?? "";
    if (paths.size < 2) continue;
    if (global?.skills.some((entry) => entry.name === name) === true) continue;
    findings.push({
      level: "warn",
      skill: name,
      where: `${paths.size} projects`,
      problem: `identical in every one, \`hubskillz move ${name} global\` covers them all`,
    });
  }
  return findings;
}

/**
 * What the scan drops without a word: a dead symlink, and a folder holding no
 * readable file. Both look like an installed skill and load as nothing.
 */
export async function brokenFindings(
  root: string,
  where: string,
): Promise<Finding[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const findings: Finding[] = [];
  for (const entry of entries) {
    if (!isSkillFile(entry.name)) continue;
    const dir = join(root, entry.name);
    if (entry.isSymbolicLink() && !existsSync(dir)) {
      findings.push({
        level: "error",
        skill: entry.name,
        where,
        problem: "broken symlink, the target is gone",
      });
      continue;
    }
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if ((await scanSkillDir(dir)) === null) {
      findings.push({
        level: "error",
        skill: entry.name,
        where,
        problem: "empty folder, no readable file inside",
      });
    }
  }
  return findings;
}

/** Registered repos that lost their skills root. `sync --all` skips them. */
export function staleFindings(
  registered: readonly string[],
): readonly Finding[] {
  return registered
    .filter((dir) => !exists(projectSkillsRoot(dir)))
    .map((dir) => ({
      level: "warn" as const,
      skill: "-",
      where: shortPath(dir),
      problem:
        "registered without .claude/skills, `hubskillz projects remove` it",
    }));
}

/** `hubskillz doctor`: every local skills root, read only, no account needed. */
export async function doctor(options: DoctorOptions): Promise<Result<void>> {
  const config = await readConfig();
  // Signing in only adds the registered projects: a broken skill is worth
  // finding before the first login, so a missing config is not a failure.
  const machine = config.isSuccess ? config.value.machineId : hostname();
  const registered = config.isSuccess ? config.value.projects : [];
  const live = registered.filter((dir) => exists(projectSkillsRoot(dir)));
  const surfaces = await localSurfaces(options.path, true, machine, live);

  const findings: Finding[] = [...staleFindings(registered)];
  for (const surface of surfaces) {
    const where = whereOf(surface);
    findings.push(...(await brokenFindings(surface.descriptor.path, where)));
    for (const skill of surface.skills) {
      findings.push(...skillFindings(skill, where));
    }
  }
  findings.push(...duplicateFindings(surfaces), ...scatteredFindings(surfaces));

  printSurfaces(surfaces);
  printFindings(findings);
  return Result.ok(undefined);
}

function printSurfaces(surfaces: readonly Surface[]): void {
  for (const surface of surfaces) {
    process.stdout.write(
      `${bold(surface.descriptor.label)}  ${dim(
        `${shortPath(surface.descriptor.path)}, ${plural(surface.skills.length, "skill")}`,
      )}\n`,
    );
  }
}

/**
 * One row per problem, per place. A machine that lost track of its skills has
 * hundreds of the same finding, and one row each is a wall nobody reads: the
 * rows collapse to a count and the names follow the table.
 */
function group(findings: readonly Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = `${finding.level}\0${finding.where}\0${finding.problem}`;
    const found = groups.get(key) ?? [];
    found.push(finding);
    groups.set(key, found);
  }
  return groups;
}

function printFindings(findings: readonly Finding[]): void {
  if (findings.length === 0) {
    process.stdout.write(`\n${dim("nothing to fix")}\n`);
    return;
  }
  // Errors first: they are the ones no agent loads at all.
  const groups = [...group(findings).values()].sort((left, right) =>
    left[0]?.level === right[0]?.level
      ? 0
      : left[0]?.level === "error"
        ? -1
        : 1,
  );

  process.stdout.write(
    `\n${table(
      ["LEVEL", "SKILL", "WHERE", "PROBLEM"],
      groups.map(([first, ...rest]) => [
        first?.level === "error" ? accent("error") : dim("warn"),
        rest.length === 0
          ? (first?.skill ?? "-")
          : plural(rest.length + 1, "skill"),
        first?.where ?? "-",
        first?.problem ?? "",
      ]),
    )}\n`,
  );
  for (const found of groups) {
    if (found.length < 2) continue;
    const first = found[0];
    if (first === undefined) continue;
    process.stdout.write(
      `\n${dim(`${first.where}, ${first.problem}`)}\n  ${found
        .map((finding) => finding.skill)
        .join(", ")}\n`,
    );
  }

  const errors = findings.filter((finding) => finding.level === "error").length;
  process.stdout.write(
    `\n${plural(findings.length, "problem")}, ${errors} to fix by hand\n`,
  );
}
