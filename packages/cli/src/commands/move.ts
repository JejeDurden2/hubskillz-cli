import { existsSync } from "node:fs";
import { cp, lstat, mkdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Result } from "@hubskillz/shared";
import { CliError } from "../errors";
import { dim, shortPath } from "../output";
import { globalSkillsRoot, projectSkillsRoot, scanSkillDir } from "../scan";

export interface MoveOptions {
  readonly name: string;
  /** "global", or a project directory. */
  readonly to: string | undefined;
  /** Where to take it from when the name sits in more than one root. */
  readonly from: string | undefined;
  readonly path: string | undefined;
  readonly force: boolean;
}

/** "global" is the machine root, anything else is a project directory. */
export function skillsRootOf(target: string): string {
  return target === "global" ? globalSkillsRoot() : projectSkillsRoot(target);
}

/**
 * The roots a bare `move` looks in: the project of the working directory,
 * then the machine root. Inside the home directory both are the same path.
 */
export function searchRoots(
  path: string | undefined,
  from: string | undefined,
): readonly string[] {
  if (from !== undefined) return [skillsRootOf(from)];
  return [
    ...new Set([projectSkillsRoot(path ?? process.cwd()), globalSkillsRoot()]),
  ];
}

/**
 * The root holding the skill, once the destination is out of the running.
 * Two candidates left means the name exists twice and only the user knows
 * which copy to move.
 */
export function pickSource(
  name: string,
  roots: readonly string[],
  destRoot: string,
  holds: (root: string) => boolean,
): Result<string> {
  const found = roots.filter((root) => root !== destRoot && holds(root));
  const [first, second] = found;
  if (first !== undefined && second === undefined) return Result.ok(first);
  if (first === undefined) {
    return Result.fail(
      new CliError(
        "SKILL_NOT_FOUND",
        `No skill named ${name} in ${roots.map(shortPath).join(" or ")}.`,
      ),
    );
  }
  return Result.fail(
    new CliError(
      "AMBIGUOUS_SOURCE",
      `${name} exists in ${found.map(shortPath).join(" and ")}. Pass --from to say which one to move.`,
    ),
  );
}

/**
 * Moves one skill directory between two skills roots. `rename` keeps a
 * symlinked skill a symlink; across filesystems it fails with EXDEV and the
 * copy takes over, links included.
 */
export async function moveSkill(
  source: string,
  dest: string,
  force: boolean,
): Promise<Result<void>> {
  if ((await lstat(source).catch(() => null)) === null) {
    return Result.fail(new CliError("SKILL_NOT_FOUND", `${source} is gone.`));
  }
  if (existsSync(dest) || (await lstat(dest).catch(() => null)) !== null) {
    if (!force) {
      return Result.fail(
        new CliError(
          "DESTINATION_EXISTS",
          `${shortPath(dest)} already exists. Pass --force to replace it.`,
        ),
      );
    }
    // rm never follows a symlinked skill dir: the link goes, its target stays.
    await rm(dest, { recursive: true, force: true });
  }

  await mkdir(resolve(dest, ".."), { recursive: true });
  try {
    await rename(source, dest);
  } catch (cause) {
    // Another filesystem, the only failure a copy can still recover from.
    const code = cause instanceof Error && "code" in cause ? cause.code : null;
    if (code !== "EXDEV") {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return Result.fail(new CliError("MOVE_FAILED", detail));
    }
    await cp(source, dest, { recursive: true, verbatimSymlinks: true });
    await rm(source, { recursive: true, force: true });
  }
  return Result.ok(undefined);
}

/** Two skill folders holding the same files. A missing one is never equal. */
async function sameContent(left: string, right: string): Promise<boolean> {
  const [one, two] = await Promise.all([
    scanSkillDir(left),
    scanSkillDir(right),
  ]);
  return one !== null && two !== null && one.contentHash === two.contentHash;
}

/** `hubskillz move <skill> <global|DIR>`: the same skill, another root. */
export async function move(options: MoveOptions): Promise<Result<void>> {
  if (options.to === undefined) {
    return Result.fail(
      new CliError(
        "USAGE",
        "hubskillz move needs a destination: `global` or a project directory. Run `hubskillz help move`.",
      ),
    );
  }
  const destRoot = skillsRootOf(options.to);
  const roots = searchRoots(options.path, options.from);
  const source = pickSource(options.name, roots, destRoot, (root) =>
    existsSync(join(root, options.name)),
  );
  if (source.isFailure) return Result.fail(source.error);

  const dest = join(destRoot, options.name);
  const origin = join(source.value, options.name);

  // Already there, byte for byte: the move is the removal of the spare copy.
  if (!options.force && (await sameContent(origin, dest))) {
    await rm(origin, { recursive: true, force: true });
    process.stdout.write(
      `${shortPath(dest)} already holds this exact skill\n` +
        `removed the copy in ${shortPath(origin)}\n`,
    );
    return Result.ok(undefined);
  }

  const moved = await moveSkill(origin, dest, options.force);
  if (moved.isFailure) return moved;

  process.stdout.write(
    `moved ${options.name}\n` +
      `  ${shortPath(origin)}\n` +
      `  ${shortPath(dest)}\n` +
      `${dim("run npx hubskillz status to report the new layout")}\n`,
  );
  return Result.ok(undefined);
}
