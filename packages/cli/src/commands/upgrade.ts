import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Result } from "@hubskillz/shared";
import { readConfig } from "../config";
import { CliError } from "../errors";
import { globalLockPath, projectLockPath, readLock } from "../lock";
import { bold, dim, plural, shortPath } from "../output";
import { exists, projectSkillsRoot } from "../scan";
import { projectDirs } from "../surfaces";

export interface UpgradeOptions {
  /** Skill names to update. Empty means every skill of the root. */
  readonly names: readonly string[];
  readonly path: string | undefined;
  readonly all: boolean;
  readonly yes: boolean;
}

export interface UpgradeRoot {
  readonly label: string;
  /** Where `npx skills` runs: the repo for a project, the home dir for global. */
  readonly cwd: string;
  readonly scope: "-g" | "-p";
  readonly lockPath: string;
}

function globalRoot(): UpgradeRoot {
  return {
    label: "global",
    cwd: homedir(),
    scope: "-g",
    lockPath: globalLockPath(),
  };
}

function projectRoot(dir: string): UpgradeRoot {
  return {
    label: shortPath(resolve(dir)),
    cwd: resolve(dir),
    scope: "-p",
    lockPath: projectLockPath(dir),
  };
}

/**
 * The roots to upgrade, on the same rule as `status` and `sync`: `--all` takes
 * the machine root plus every project, otherwise the project of the working
 * directory wins when it has skills and the machine root is the fallback.
 */
export function upgradeRoots(
  path: string | undefined,
  all: boolean,
  registered: readonly string[],
): readonly UpgradeRoot[] {
  const dir = resolve(path ?? process.cwd());
  const hasProject = exists(projectSkillsRoot(dir));
  if (!all) return [hasProject ? projectRoot(dir) : globalRoot()];
  return [
    globalRoot(),
    ...projectDirs(
      hasProject || path !== undefined ? dir : undefined,
      registered,
    ).map(projectRoot),
  ];
}

/**
 * `npx skills update`, inheriting the terminal so its own prompts and output
 * reach the user. A non-zero exit stops the run: the roots left are untouched
 * and the user sees which one failed.
 */
function runSkills(
  root: UpgradeRoot,
  names: readonly string[],
  yes: boolean,
): Promise<Result<void>> {
  const args = ["--yes", "skills", "update", ...names, root.scope];
  if (yes) args.push("-y");
  return new Promise((settle) => {
    const child = spawn("npx", args, { cwd: root.cwd, stdio: "inherit" });
    child.on("error", (cause: Error) => {
      settle(
        Result.fail(
          new CliError(
            "NO_NPX",
            `Cannot run npx: ${cause.message}. The skills.sh CLI applies the update, install Node's npx and retry.`,
          ),
        ),
      );
    });
    child.on("close", (code) => {
      settle(
        code === 0 || code === null
          ? Result.ok(undefined)
          : Result.fail(
              new CliError(
                "SKILLS_FAILED",
                `npx skills update exited with ${code} in ${root.cwd}.`,
              ),
            ),
      );
    });
  });
}

/**
 * `hubskillz upgrade`: every skills.sh skill on the machine, brought to its
 * latest upstream. The skills.sh CLI does the fetching and keeps its own lock
 * honest; what hubskillz adds is the list of roots to run it in, since
 * `skills update` covers one scope at a time.
 */
export async function upgrade(options: UpgradeOptions): Promise<Result<void>> {
  // No account needed: this never talks to the directory. A config file only
  // adds the registered projects to the run.
  const config = await readConfig();
  const registered = config.isSuccess ? config.value.projects : [];
  // A named skill is upgraded wherever it sits, the way `move` finds its
  // source. Only a bare run follows the project-then-global rule.
  const named = options.names.length > 0;
  const roots = upgradeRoots(options.path, options.all || named, registered);

  let ran = 0;
  const found = new Set<string>();
  for (const root of roots) {
    const lock = await readLock(root.lockPath);
    const names = options.names.filter((name) => lock.has(name));
    if (named && names.length === 0) continue;
    if (!named && lock.size === 0) {
      process.stdout.write(
        dim(`${root.label}: no skills.sh lock here, nothing to upgrade\n`),
      );
      continue;
    }
    for (const name of names) found.add(name);
    process.stdout.write(
      `\n${bold(root.label)}  ${dim(named ? names.join(", ") : plural(lock.size, "skill"))}\n`,
    );
    const result = await runSkills(root, names, options.yes);
    if (result.isFailure) return result;
    ran += 1;
  }

  const missing = options.names.filter((name) => !found.has(name));
  if (missing.length > 0) {
    return Result.fail(
      new CliError(
        "NOT_FROM_SKILLS_SH",
        `No skills.sh lock lists ${missing.join(", ")}. \`npx hubskillz doctor\` lists what is installed where.`,
      ),
    );
  }
  if (ran === 0) {
    process.stdout.write(
      dim("Nothing installed by `npx skills add` in these roots.\n"),
    );
    return Result.ok(undefined);
  }
  // The directory pins a version per skill; upstream head is a different one.
  process.stdout.write(
    dim(
      "\nUpstream content now sits on disk. Run `npx hubskillz status` to see it against your approved versions, `npx hubskillz sync` to go back to them.\n",
    ),
  );
  return Result.ok(undefined);
}
