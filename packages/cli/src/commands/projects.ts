import { resolve } from "node:path";
import { Result } from "@hubskillz/shared";
import { readConfig, writeConfig } from "../config";
import type { Config } from "../config";
import { discoverProjects } from "../discover";
import { CliError } from "../errors";
import { dim, plural } from "../output";
import { selectMany } from "../prompt";
import { exists, projectSkillsRoot } from "../scan";

export interface ProjectsOptions {
  readonly action: string | undefined;
  readonly dir: string | undefined;
  readonly yes: boolean;
}

/**
 * Scans the home directory for repos with `.claude/skills`, lets the user pick
 * the new ones (all of them with `yes` or without a TTY) and registers them.
 * Returns the registered list after the change.
 */
export async function discoverAndRegister(
  config: Config,
  yes: boolean,
): Promise<readonly string[]> {
  const known = new Set(config.projects);
  const found = (await discoverProjects()).filter((dir) => !known.has(dir));
  if (found.length === 0) {
    process.stdout.write(dim("No new project with .claude/skills found.\n"));
    return config.projects;
  }
  const chosen = yes
    ? found
    : await selectMany("Projects with skills found. Register:", found);
  if (chosen.length === 0) return config.projects;
  const projects = [...config.projects, ...chosen];
  await writeConfig({ ...config, projects });
  process.stdout.write(
    `Registered ${plural(chosen.length, "project")}. They are now part of \`hubskillz sync --all\`.\n`,
  );
  return projects;
}

/** `hubskillz projects [add|remove [DIR] | discover | list]`: repos that `--all` includes. */
export async function projects(
  options: ProjectsOptions,
): Promise<Result<void>> {
  const config = await readConfig();
  if (config.isFailure) return Result.fail(config.error);
  const current = config.value.projects;
  const dir = resolve(options.dir ?? process.cwd());

  switch (options.action ?? "list") {
    case "list": {
      if (current.length === 0) {
        process.stdout.write(
          dim(
            "No registered projects. Run `hubskillz projects add` inside a repo.\n",
          ),
        );
        return Result.ok(undefined);
      }
      for (const project of current) process.stdout.write(`${project}\n`);
      return Result.ok(undefined);
    }
    case "add": {
      if (!exists(projectSkillsRoot(dir))) {
        return Result.fail(
          new CliError(
            "NO_SKILLS_ROOT",
            `${dir} has no .claude/skills directory.`,
          ),
        );
      }
      if (current.includes(dir)) {
        process.stdout.write(dim(`${dir} is already registered.\n`));
        return Result.ok(undefined);
      }
      await writeConfig({ ...config.value, projects: [...current, dir] });
      process.stdout.write(
        `Registered ${dir}. It is now part of \`hubskillz sync --all\`.\n`,
      );
      return Result.ok(undefined);
    }
    case "discover": {
      await discoverAndRegister(config.value, options.yes);
      return Result.ok(undefined);
    }
    case "remove": {
      if (!current.includes(dir)) {
        return Result.fail(
          new CliError("NOT_REGISTERED", `${dir} is not registered.`),
        );
      }
      await writeConfig({
        ...config.value,
        projects: current.filter((project) => project !== dir),
      });
      process.stdout.write(`Forgot ${dir}.\n`);
      return Result.ok(undefined);
    }
    default:
      return Result.fail(
        new CliError(
          "USAGE",
          `hubskillz projects: unknown action "${options.action}". Use add, remove, discover or list.`,
        ),
      );
  }
}
