import { mkdir, mkdtemp, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { Result } from "@hubskillz/shared";
import type { SkillFile } from "@hubskillz/shared";
import { CliError } from "./errors";

export interface ApplyInput {
  /** Absolute path of the skill directory, created when missing. */
  readonly dir: string;
  readonly files: readonly SkillFile[];
  /** Relative paths present on disk that the version no longer has. */
  readonly remove: readonly string[];
}

/**
 * Writes a skill version to disk. Every file is written to a staging dir on
 * the same filesystem and renamed into place, so a reader never sees a half
 * written file.
 */
export async function applySkill(input: ApplyInput): Promise<Result<void>> {
  for (const path of [...input.files.map((f) => f.path), ...input.remove]) {
    if (!isSafeRelativePath(path)) {
      return Result.fail(
        new CliError(
          "UNSAFE_PATH",
          `Refusing to write outside the skill: ${path}`,
        ),
      );
    }
  }

  await mkdir(input.dir, { recursive: true });
  const staging = await mkdtemp(join(dirname(input.dir), ".hubskillz-"));
  try {
    for (const file of input.files) {
      const staged = join(staging, ...file.path.split("/"));
      await mkdir(dirname(staged), { recursive: true });
      await writeFile(staged, file.content, "utf8");
    }
    for (const file of input.files) {
      const target = join(input.dir, ...file.path.split("/"));
      await mkdir(dirname(target), { recursive: true });
      await rename(join(staging, ...file.path.split("/")), target);
    }
    for (const path of input.remove) {
      const target = join(input.dir, ...path.split("/"));
      await rm(target, { force: true });
      await pruneEmptyDirs(dirname(target), input.dir);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  return Result.ok(undefined);
}

function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || /^[a-zA-Z]:/u.test(path)) {
    return false;
  }
  return !path.split(/[/\\]/u).includes("..");
}

async function pruneEmptyDirs(from: string, stopAt: string): Promise<void> {
  let current = from;
  while (current.startsWith(stopAt + sep)) {
    try {
      await rmdir(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
}
