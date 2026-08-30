import { Result, inventoryResponseSchema } from "@hubskillz/shared";
import type { InventoryItem, InventoryResponse } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Session } from "../api";
import { readConfig, resolveBaseUrl } from "../config";
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
    printSurface(surface, inventory.value);
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
  let merged: InventoryResponse | undefined;
  for (const body of chunks) {
    const posted = await apiRequest({
      session,
      method: "POST",
      path: "/api/cli/inventory",
      schema: inventoryResponseSchema,
      body,
    });
    if (posted.isFailure) return posted;
    merged =
      merged === undefined
        ? posted.value
        : { ...merged, items: [...merged.items, ...posted.value.items] };
  }
  return Result.ok(merged ?? { surfaceId: "", items: [] });
}

/** `skills.sh owner/repo` from the lock, `private` otherwise, `-` when absent. */
export function originOf(surface: Surface, name: string): string {
  const skill = surface.skills.find((entry) => entry.name === name);
  if (skill === undefined) return "-";
  return skill.upstream === undefined
    ? "private"
    : `skills.sh ${skill.upstream.source}`;
}

/** What the directory has to say about this surface, one line per topic. Read only. */
export function printNotes(
  surface: Surface,
  items: readonly InventoryItem[],
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
  }
}

export function printHeader(surface: Surface): void {
  process.stdout.write(
    `\n${bold(surface.descriptor.label)}  ${dim(surface.descriptor.path)}\n`,
  );
}

function printSurface(surface: Surface, inventory: InventoryResponse): void {
  const rows = inventory.items.map((item) => [
    item.name,
    originOf(surface, item.name),
    item.required ? `${item.state} ${dim("(required)")}` : item.state,
    shortHash(item.installedHash),
    item.approvedVersion === undefined ? "-" : `v${item.approvedVersion}`,
  ]);

  printHeader(surface);
  if (rows.length === 0) {
    process.stdout.write(`${dim("no skills")}\n`);
    return;
  }
  process.stdout.write(
    `${table(["SKILL", "ORIGIN", "STATE", "LOCAL", "APPROVED"], rows)}\n\n`,
  );
  printNotes(surface, inventory.items);
}
