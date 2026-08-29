import type { Result } from "@hubskillz/shared";
import type { Config } from "./config";
import { bold, dim } from "./output";

/**
 * Three steps to the first sync. Shown by the bare `hubskillz` command and
 * after `login` and `status`, until `firstSyncAt` is written by `sync`.
 */
export function quickstart(config: Result<Config>): string {
  const signedIn = config.isSuccess;
  const synced = signedIn && config.value.firstSyncAt !== undefined;
  const step = (done: boolean, text: string, command: string): string =>
    `  ${done ? dim("[x]") : "[ ]"} ${done ? dim(text) : text}\n      ${dim("$")} ${done ? dim(command) : bold(command)}\n`;

  return (
    `${bold("Quickstart")}\n` +
    step(
      signedIn,
      "Sign in with a device token (create one under Settings, Device tokens)",
      "hubskillz login",
    ) +
    step(
      synced,
      "See what is installed on this machine and how it compares to the directory",
      "hubskillz status",
    ) +
    step(
      synced,
      "Install the approved set everywhere, adopt what the directory lacks",
      "hubskillz sync --all",
    ) +
    `\n${dim("Run `hubskillz help` for every command, `hubskillz help <command>` for its flags.")}\n`
  );
}

export function quickstartPending(config: Result<Config>): boolean {
  return config.isFailure || config.value.firstSyncAt === undefined;
}
