import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { Result } from "@hubskillz/shared";
import { z } from "zod";
import { CliError } from "./errors";

export const DEFAULT_BASE_URL = "https://hubskillz.com";

const configSchema = z.object({
  baseUrl: z.string().min(1),
  token: z.string().min(1),
  machineId: z.string().min(1),
  /** Absolute repo paths that `--all` includes next to the global root. */
  projects: z.array(z.string()).default([]),
  /** ISO date of the first completed `sync`. Absent until then: the quickstart shows. */
  firstSyncAt: z.string().optional(),
});
export type Config = z.infer<typeof configSchema>;

export function configDir(): string {
  return join(homedir(), ".hubskillz");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

/**
 * The config file, with `HUBSKILLZ_TOKEN` taking precedence over the stored
 * token. With the env var alone (CI, containers) no file is needed: the
 * machine id is then the hostname.
 */
export async function readConfig(): Promise<Result<Config>> {
  const envToken = process.env["HUBSKILLZ_TOKEN"];
  let raw: string;
  try {
    raw = await readFile(configPath(), "utf8");
  } catch {
    if (envToken !== undefined && envToken !== "") {
      return Result.ok({
        baseUrl: resolveBaseUrl(undefined),
        token: envToken,
        machineId: hostname(),
        projects: [],
      });
    }
    return Result.fail(
      new CliError("NOT_SIGNED_IN", "Not signed in. Run `hubskillz login`."),
    );
  }
  // A corrupt file reads as BAD_CONFIG, JSON.parse never throws past here.
  let parsed: ReturnType<typeof configSchema.safeParse> | null = null;
  try {
    parsed = configSchema.safeParse(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (parsed === null || !parsed.success) {
    return Result.fail(
      new CliError(
        "BAD_CONFIG",
        `${configPath()} is unreadable. Run \`hubskillz login\`.`,
      ),
    );
  }
  return Result.ok(
    envToken === undefined || envToken === ""
      ? parsed.data
      : { ...parsed.data, token: envToken },
  );
}

/** Removes the config file. Registered projects go with it. */
export async function deleteConfig(): Promise<boolean> {
  try {
    await rm(configPath());
    return true;
  } catch {
    return false;
  }
}

export async function writeConfig(config: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  await writeFile(configPath(), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
}

/** Stable per machine, minted on first login and kept across sign-ins. */
export async function machineId(): Promise<string> {
  const existing = await readConfig();
  return existing.isSuccess ? existing.value.machineId : randomUUID();
}

export function resolveBaseUrl(
  flag: string | undefined,
  fromConfig?: string,
): string {
  const env = process.env["HUBSKILLZ_BASE_URL"];
  const chosen = flag ?? env ?? fromConfig ?? DEFAULT_BASE_URL;
  return chosen.replace(/\/+$/u, "");
}
