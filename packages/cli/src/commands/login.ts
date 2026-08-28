import { Result, meResponseSchema } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Config } from "../config";
import {
  configPath,
  machineId,
  readConfig,
  resolveBaseUrl,
  writeConfig,
} from "../config";
import { CliError } from "../errors";
import { dim } from "../output";
import { promptSecret } from "../prompt";
import { quickstart } from "../quickstart";

export interface LoginOptions {
  readonly baseUrl: string | undefined;
  /** Token given on the command line. Skips the prompt. */
  readonly token: string | undefined;
}

export async function login(options: LoginOptions): Promise<Result<void>> {
  const existing = await readConfig();
  const baseUrl = resolveBaseUrl(
    options.baseUrl,
    existing.isSuccess ? existing.value.baseUrl : undefined,
  );

  process.stdout.write(
    `${dim(`Signing in to ${baseUrl}`)}\n` +
      `${dim(`Create a device token at ${baseUrl}/app/settings/tokens`)}\n`,
  );
  const token = options.token ?? (await promptSecret("Device token: "));
  if (token === "") {
    return Result.fail(new CliError("EMPTY_TOKEN", "No device token given."));
  }

  const me = await apiRequest({
    session: { baseUrl, token },
    method: "GET",
    path: "/api/cli/me",
    schema: meResponseSchema,
  });
  if (me.isFailure) return Result.fail(me.error);

  const config: Config = {
    baseUrl,
    token,
    machineId: await machineId(),
    projects: existing.isSuccess ? existing.value.projects : [],
  };
  if (existing.isSuccess && existing.value.firstSyncAt !== undefined) {
    config.firstSyncAt = existing.value.firstSyncAt;
  }
  await writeConfig(config);
  process.stdout.write(
    `Signed in as ${me.value.user.email} on ${me.value.org.name}.\n` +
      `${dim(`Token written to ${configPath()}`)}\n\n`,
  );
  if (config.firstSyncAt === undefined) {
    process.stdout.write(quickstart(Result.ok(config)));
  }
  return Result.ok(undefined);
}
