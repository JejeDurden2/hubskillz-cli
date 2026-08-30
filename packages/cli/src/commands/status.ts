import { Result, inventoryResponseSchema } from "@hubskillz/shared";
import type { InventoryItem, InventoryResponse } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Session } from "../api";
import { DEFAULT_BASE_URL, readConfig, resolveBaseUrl } from "../config";
import { bold, dim, shortHash, table } from "../output";
import { quickstart, quickstartPending } from "../quickstart";
import { inventoryChunksOf } from "../scan";
import type { Surface } from "../scan";
import { localSurfaces } from "../surfaces";
import { discoverAndRegister } from "./projects";

export interface StatusOptions {
  readonly baseUrl: string | undefined;
  readonly path: string | undefined;
  readonly yes: boolean;
}

export async function status(options: StatusOptions): Promise<Result<void>> {
  const config = await readConfig();
  if (config.isFailure) return Result.fail(config.error);
  const session: Session = {
    baseUrl: resolveBaseUrl(options.baseUrl, config.value.baseUrl),
    token: config.value.token,
  };

  // status always covers every surface, so it discovers projects like sync --all.
  const projects =
    config.value.projects.length === 0
      ? await discoverAndRegister(config.value, options.yes)
      : config.value.projects;
  const surfaces = await localSurfaces(
    options.path,
    true,
    config.value.machineId,
    projects,
  );
  for (const surface of surfaces) {
    const inventory = await postInventory(session, surface);
    if (inventory.isFailure) return Result.fail(inventory.error);
    printSurface(surface, inventory.value, session.baseUrl);
  }
  if (quickstartPending(config)) {
    process.stdout.write(`\n${quickstart(config)}`);
  }
  return Result.ok(undefined);
}

export async function postInventory(
  session: Session,
  surface: Surface,
): Promise<Result<InventoryResponse>> {
  const chunks = inventoryChunksOf(surface);
  let surfaceId: string | undefined;
  const items: InventoryItem[] = [];
  for (const body of chunks) {
    const posted = await apiRequest({
      session,
      method: "POST",
      path: "/api/cli/inventory",
      schema: inventoryResponseSchema,
      body,
    });
    if (posted.isFailure) return posted;
    surfaceId ??= posted.value.surfaceId;
    items.push(...posted.value.items);
  }
  if (surfaceId === undefined) return Result.ok({ surfaceId: "", items: [] });
  return Result.ok({ surfaceId, items: mergeItems(items) });
}

/**
 * One item per skill across the chunks of one inventory. Every chunk is
 * answered against the whole directory, so a chunk that did not carry the
 * skill still reports on it with no installed hash. The chunk that holds it
 * on disk is the one telling the truth, and it decides the state: without
 * this, a skill landing in a later chunk would be planned from the earlier
 * chunk's guess and a local copy could be removed or overwritten.
 */
export function mergeItems(items: readonly InventoryItem[]): InventoryItem[] {
  const byName = new Map<string, InventoryItem>();
  for (const item of items) {
    const seen = byName.get(item.name);
    const better =
      seen === undefined ||
      (seen.installedHash === undefined && item.installedHash !== undefined);
    if (better) byName.set(item.name, item);
  }
  return [...byName.values()];
}

/** `skills.sh owner/repo` from the lock, `private` otherwise, `-` when absent. */
export function originOf(surface: Surface, name: string): string {
  const skill = surface.skills.find((entry) => entry.name === name);
  if (skill === undefined) return "-";
  return skill.upstream === undefined
    ? "private"
    : `skills.sh ${skill.upstream.source}`;
}

/** The web app behind an API base: the hosted API answers on the api. subdomain. */
export function reviewUrl(baseUrl: string): string {
  const web = baseUrl === DEFAULT_BASE_URL ? "https://hubskillz.com" : baseUrl;
  return `${web}/app`;
}

/** What the directory has to say about this surface, one line per topic. Read only. */
export function printNotes(
  surface: Surface,
  items: readonly InventoryItem[],
  baseUrl: string,
): void {
  const importable = items
    .filter((item) => item.importable)
    .map((item) => item.name);
  if (importable.length > 0) {
    process.stdout.write(
      `${dim(`${importable.length} not in the directory yet, run npx hubskillz sync to adopt them:`)} ${importable.join(", ")}\n`,
    );
  }
  const ahead = items
    .filter((item) => item.upstreamAhead === true)
    .map((item) => `${item.name} (${originOf(surface, item.name)})`);
  if (ahead.length > 0) {
    process.stdout.write(
      `${dim("upstream ahead of approved version, waiting for review:")} ${ahead.join(", ")}\n`,
    );
    process.stdout.write(
      `${dim(`review and approve at ${reviewUrl(baseUrl)}`)}\n`,
    );
  }
}

export function printHeader(surface: Surface): void {
  process.stdout.write(
    `\n${bold(surface.descriptor.label)}  ${dim(surface.descriptor.path)}\n`,
  );
}

function printSurface(
  surface: Surface,
  inventory: InventoryResponse,
  baseUrl: string,
): void {
  // Inherited skills sit in the machine's global root: Claude Code loads them
  // here anyway, so they fold into one note instead of one row each.
  const inherited = inventory.items.filter(
    (item) => item.state === "inherited",
  ).length;
  const rows = inventory.items
    .filter((item) => item.state !== "inherited")
    .map((item) => [
      item.name,
      originOf(surface, item.name),
      item.required ? `${item.state} ${dim("(required)")}` : item.state,
      shortHash(item.installedHash),
      item.approvedVersion === undefined ? "-" : `v${item.approvedVersion}`,
    ]);

  printHeader(surface);
  if (inherited > 0) {
    process.stdout.write(
      `${dim(`${inherited} skill${inherited === 1 ? "" : "s"} inherited from ~/.claude/skills`)}\n`,
    );
  }
  // An inherited item with a hash is a redundant local copy: sync removes it.
  const duplicates = inventory.items.filter(
    (item) => item.state === "inherited" && item.installedHash !== undefined,
  ).length;
  if (duplicates > 0) {
    process.stdout.write(
      `${dim(`${duplicates} duplicate cop${duplicates === 1 ? "y" : "ies"} here: run npx hubskillz sync to remove ${duplicates === 1 ? "it" : "them"}`)}\n`,
    );
  }
  if (rows.length === 0) {
    if (inherited === 0) process.stdout.write(`${dim("no skills")}\n`);
    return;
  }
  process.stdout.write(
    `${table(["SKILL", "ORIGIN", "STATE", "LOCAL", "APPROVED"], rows)}\n\n`,
  );
  printNotes(surface, inventory.items, baseUrl);
  const behind = inventory.items.filter(
    (item) => item.state === "drifted" || item.state === "missing",
  ).length;
  if (behind > 0) {
    process.stdout.write(
      `${dim(`${behind} skill${behind === 1 ? "" : "s"} to install or update: run npx hubskillz sync`)}\n`,
    );
  }
}
