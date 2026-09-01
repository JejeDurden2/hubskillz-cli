#!/usr/bin/env node
import { parseArgs } from "node:util";
import { Result } from "@hubskillz/shared";
import { doctor } from "./commands/doctor";
import { login } from "./commands/login";
import { logout } from "./commands/logout";
import { move } from "./commands/move";
import { projects } from "./commands/projects";
import { publish } from "./commands/publish";
import { push } from "./commands/push";
import { status } from "./commands/status";
import { sync } from "./commands/sync";
import { upgrade } from "./commands/upgrade";
import { readConfig } from "./config";
import { CliError, toCliError } from "./errors";
import { bold, dim } from "./output";
import { quickstart, quickstartPending } from "./quickstart";

declare const __VERSION__: string; // inlined by esbuild --define

interface Flag {
  readonly spec: string;
  readonly help: string;
}

interface Command {
  readonly name: string;
  readonly usage: string;
  readonly summary: string;
  readonly flags: readonly Flag[];
}

const GLOBAL_FLAGS: readonly Flag[] = [
  {
    spec: "--base-url URL",
    help: "Server to talk to (default: config file, then https://api.hubskillz.com)",
  },
  { spec: "-h, --help", help: "Show help" },
  { spec: "-v, --version", help: "Show the version" },
];

const COMMANDS: readonly Command[] = [
  {
    name: "login",
    usage: "hubskillz login [--token TOKEN] [--base-url URL]",
    summary: "Sign in with a device token",
    flags: [
      { spec: "--token TOKEN", help: "Device token, instead of the prompt" },
    ],
  },
  {
    name: "logout",
    usage: "hubskillz logout",
    summary: "Forget the device token on this machine",
    flags: [],
  },
  {
    name: "status",
    usage: "hubskillz status [--path DIR] [--yes]",
    summary: "Report the state of every installed skill",
    flags: [
      {
        spec: "--path DIR",
        help: "Project directory (default: current directory)",
      },
      {
        spec: "-y, --yes",
        help: "Register every discovered project without asking",
      },
    ],
  },
  {
    name: "sync",
    usage:
      "hubskillz sync [--path DIR] [--all] [--adopt] [--yes] [--dry-run] [--force]",
    summary: "Install and update skills to the approved versions",
    flags: [
      {
        spec: "--path DIR",
        help: "Project directory (default: current directory)",
      },
      {
        spec: "--all",
        help: "Global root, this project and every registered project",
      },
      {
        spec: "--adopt",
        help: "Add importable skills to the directory as approved (maintainers)",
      },
      { spec: "-y, --yes", help: "Apply without asking" },
      { spec: "--dry-run", help: "Print the plan and stop" },
      { spec: "--force", help: "Overwrite skills you customized locally" },
    ],
  },
  {
    name: "upgrade",
    usage: "hubskillz upgrade [SKILL...] [--path DIR] [--all] [--yes]",
    summary: "Update skills.sh skills to their latest upstream",
    flags: [
      {
        spec: "--path DIR",
        help: "Project directory (default: current directory)",
      },
      { spec: "--all", help: "Global root and every registered project" },
      { spec: "-y, --yes", help: "Skip the skills.sh prompts" },
    ],
  },
  {
    name: "doctor",
    usage: "hubskillz doctor [--path DIR]",
    summary: "Check every local skills root for problems",
    flags: [
      {
        spec: "--path DIR",
        help: "Project directory (default: current directory)",
      },
    ],
  },
  {
    name: "move",
    usage: "hubskillz move <skill> <global|DIR> [--from global|DIR] [--force]",
    summary: "Move a skill between the global root and a project",
    flags: [
      {
        spec: "--from ROOT",
        help: "Which copy to move when the name exists twice",
      },
      { spec: "--force", help: "Replace a skill of the same name over there" },
    ],
  },
  {
    name: "publish",
    usage: "hubskillz publish <skill>",
    summary: "List the skill on your public page",
    flags: [],
  },
  {
    name: "unpublish",
    usage: "hubskillz unpublish <skill>",
    summary: "Take the skill off your public page",
    flags: [],
  },
  {
    name: "push",
    usage: "hubskillz push <skill-dir> [-m MESSAGE]",
    summary: "Upload a skill directory as a draft for review",
    flags: [{ spec: "-m, --message TEXT", help: "Note attached to the draft" }],
  },
  {
    name: "projects",
    usage: "hubskillz projects [add|remove [DIR] | discover [--yes] | list]",
    summary: "Repos that `sync --all` and `status` cover",
    flags: [{ spec: "-y, --yes", help: "discover: register everything found" }],
  },
];

function flagLines(flags: readonly Flag[]): string {
  const width = Math.max(...flags.map((flag) => flag.spec.length));
  return flags
    .map((flag) => `  ${flag.spec.padEnd(width)}  ${dim(flag.help)}\n`)
    .join("");
}

function usage(): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  return (
    `${bold("hubskillz")} ${dim(`v${__VERSION__}`)}  keep your agent skills in sync\n\n` +
    `${bold("Usage")}\n  hubskillz <command> [flags]\n\n` +
    `${bold("Commands")}\n` +
    COMMANDS.map(
      (command) => `  ${command.name.padEnd(width)}  ${dim(command.summary)}\n`,
    ).join("") +
    `\n${bold("Flags")}\n${flagLines(GLOBAL_FLAGS)}` +
    `\n${dim("Environment: HUBSKILLZ_TOKEN, HUBSKILLZ_BASE_URL, NO_COLOR. Docs: https://hubskillz.com/docs/cli")}\n`
  );
}

function commandHelp(command: Command): string {
  const flags = [...command.flags, ...GLOBAL_FLAGS];
  return (
    `${bold("Usage")}\n  ${command.usage}\n\n${command.summary}.\n\n` +
    `${bold("Flags")}\n${flagLines(flags)}`
  );
}

function help(name: string | undefined): Result<void> {
  if (name === undefined) {
    process.stdout.write(usage());
    return Result.ok(undefined);
  }
  const command = COMMANDS.find((entry) => entry.name === name);
  if (command === undefined) {
    return Result.fail(
      new CliError(
        "USAGE",
        `Unknown command "${name}". Run \`hubskillz help\`.`,
      ),
    );
  }
  process.stdout.write(commandHelp(command));
  return Result.ok(undefined);
}

/** Bare `hubskillz`: the quickstart until the first sync, the usage after. */
async function home(): Promise<Result<void>> {
  const config = await readConfig();
  process.stdout.write(
    quickstartPending(config) ? `${usage()}\n${quickstart(config)}` : usage(),
  );
  return Result.ok(undefined);
}

async function run(): Promise<Result<void>> {
  let values;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        "base-url": { type: "string" },
        token: { type: "string" },
        path: { type: "string" },
        all: { type: "boolean", default: false },
        adopt: { type: "boolean", default: false },
        yes: { type: "boolean", short: "y", default: false },
        "dry-run": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        message: { type: "string", short: "m" },
        from: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    }));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return Result.fail(
      new CliError("USAGE", `${detail}\nRun \`hubskillz help\` for usage.`),
    );
  }

  if (values.version === true) {
    process.stdout.write(`${__VERSION__}\n`);
    return Result.ok(undefined);
  }

  const command = positionals[0];
  if (command === undefined)
    return values.help === true ? help(undefined) : home();
  if (values.help === true || command === "help") {
    return help(command === "help" ? positionals[1] : command);
  }

  switch (command) {
    case "login":
      return login({ baseUrl: values["base-url"], token: values.token });
    case "logout":
      return logout();
    case "status":
      return status({
        baseUrl: values["base-url"],
        path: values.path,
        yes: values.yes === true,
      });
    case "sync":
      return sync({
        baseUrl: values["base-url"],
        path: values.path,
        all: values.all === true,
        adopt: values.adopt === true,
        yes: values.yes === true,
        dryRun: values["dry-run"] === true,
        force: values.force === true,
      });
    case "upgrade":
      return upgrade({
        names: positionals.slice(1),
        path: values.path,
        all: values.all === true,
        yes: values.yes === true,
      });
    case "doctor":
      return doctor({ path: values.path });
    case "move": {
      const name = positionals[1];
      if (name === undefined) {
        return Result.fail(
          new CliError(
            "USAGE",
            "hubskillz move needs a skill name. Run `hubskillz help move`.",
          ),
        );
      }
      return move({
        name,
        to: positionals[2],
        from: values.from,
        path: values.path,
        force: values.force === true,
      });
    }
    case "publish":
    case "unpublish": {
      const name = positionals[1];
      if (name === undefined) {
        return Result.fail(
          new CliError(
            "USAGE",
            `hubskillz ${command} needs a skill name. Run \`hubskillz help ${command}\`.`,
          ),
        );
      }
      return publish({
        baseUrl: values["base-url"],
        name,
        published: command === "publish",
      });
    }
    case "projects":
      return projects({
        action: positionals[1],
        dir: positionals[2],
        yes: values.yes === true,
      });
    case "push": {
      const dir = positionals[1];
      if (dir === undefined) {
        return Result.fail(
          new CliError(
            "USAGE",
            "hubskillz push needs a skill directory. Run `hubskillz help push`.",
          ),
        );
      }
      return push({
        baseUrl: values["base-url"],
        dir,
        message: values.message,
      });
    }
    default:
      return Result.fail(
        new CliError(
          "USAGE",
          `Unknown command "${command}". Run \`hubskillz help\`.`,
        ),
      );
  }
}

run()
  .catch((cause: unknown) => Result.fail(toCliError(cause)))
  .then((result) => {
    if (result.isFailure) {
      process.stderr.write(`hubskillz: ${result.error.message}\n`);
      process.exitCode = 1;
    }
  });
