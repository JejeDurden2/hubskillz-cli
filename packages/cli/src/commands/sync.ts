import {
  Result,
  adoptResponseSchema,
  appliedResponseSchema,
  pendingResponseSchema,
} from "@hubskillz/shared";
import type { InventoryResponse } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Session } from "../api";
import { readConfig, resolveBaseUrl, writeConfig } from "../config";
import { dim, plural } from "../output";
import type { Surface } from "../scan";
import { localSurfaces } from "../surfaces";
import { discoverAndRegister } from "./projects";
import { postInventory, printSurface } from "./status";

export interface SyncOptions {
  readonly baseUrl: string | undefined;
  readonly path: string | undefined;
  readonly all: boolean;
  readonly yes: boolean;
}

/**
 * Uploads the skills as they sit on disk, like a git push: the directory
 * mirrors the machine. Sync never writes a local file. Moving skills between
 * roots is `hubskillz move`, updating them is `hubskillz upgrade`.
 */
export async function sync(options: SyncOptions): Promise<Result<void>> {
  const config = await readConfig();
  if (config.isFailure) return Result.fail(config.error);
  const session: Session = {
    baseUrl: resolveBaseUrl(options.baseUrl, config.value.baseUrl),
    token: config.value.token,
  };

  const projects =
    options.all && config.value.projects.length === 0
      ? await discoverAndRegister(config.value, options.yes)
      : config.value.projects;
  const surfaces = await localSurfaces(
    options.path,
    options.all,
    config.value.machineId,
    projects,
  );
  for (const surface of surfaces) {
    const result = await syncSurface(session, surface);
    if (result.isFailure) return result;
  }
  // The quickstart stops showing once one real sync went through. With an
  // env token there may be no file, and none gets created.
  if (
    config.value.firstSyncAt === undefined &&
    process.env["HUBSKILLZ_TOKEN"] === undefined
  ) {
    const stored = await readConfig();
    if (stored.isSuccess && stored.value.firstSyncAt === undefined) {
      await writeConfig({
        ...stored.value,
        projects: [...projects],
        firstSyncAt: new Date().toISOString(),
      });
    }
  }
  return Result.ok(undefined);
}

async function syncSurface(
  session: Session,
  surface: Surface,
): Promise<Result<void>> {
  const first = await postInventory(session, surface);
  if (first.isFailure) return Result.fail(first.error);

  const inventory = await adoptImportable(session, surface, first.value);
  if (inventory.isFailure) return Result.fail(inventory.error);

  printSurface(surface, inventory.value, session.baseUrl);

  // The upload answers the sync the browser asked for: drain the requests,
  // or the surface keeps a pending badge for ever.
  return clearPending(session, first.value.surfaceId);
}

/**
 * What sits on disk and is not in the directory yet becomes part of it, the
 * way a git push carries every new file. Returns the inventory to report,
 * fresh when something was adopted. A member of a team org cannot adopt:
 * the directory keeps only what its maintainers put there.
 */
async function adoptImportable(
  session: Session,
  surface: Surface,
  inventory: InventoryResponse,
): Promise<Result<InventoryResponse>> {
  const importable = inventory.items.filter((item) => item.importable);
  if (importable.length === 0) return Result.ok(inventory);

  process.stdout.write(
    dim(
      `adding ${plural(importable.length, "skill")} to your directory, this can take a minute...\n`,
    ),
  );
  const adopted = await apiRequest({
    session,
    method: "POST",
    path: "/api/cli/adopt",
    schema: adoptResponseSchema,
    body: { surfaceId: inventory.surfaceId },
  });
  if (adopted.isFailure && adopted.error.code === "FORBIDDEN") {
    process.stdout.write(
      `${dim("not added: ask a maintainer to adopt these skills")}\n`,
    );
    return Result.ok(inventory);
  }
  if (adopted.isFailure) return Result.fail(adopted.error);

  for (const skip of adopted.value.skipped) {
    process.stdout.write(dim(`skipped ${skip.name} (${skip.code})\n`));
  }
  if (adopted.value.adopted.length === 0) return Result.ok(inventory);
  process.stdout.write(
    `added ${plural(adopted.value.adopted.length, "skill")} to your directory: ${adopted.value.adopted.join(", ")}\n`,
  );
  // Same disk, new directory: repost so the report shows the adopted states.
  return postInventory(session, surface);
}

async function clearPending(
  session: Session,
  surfaceId: string,
): Promise<Result<void>> {
  const pending = await apiRequest({
    session,
    method: "GET",
    path: `/api/cli/pending?surfaceId=${encodeURIComponent(surfaceId)}`,
    schema: pendingResponseSchema,
  });
  if (pending.isFailure) return Result.fail(pending.error);

  for (const request of pending.value.requests) {
    const marked = await apiRequest({
      session,
      method: "POST",
      path: `/api/cli/pending/${encodeURIComponent(request.id)}/applied`,
      schema: appliedResponseSchema,
    });
    if (marked.isFailure) return Result.fail(marked.error);
  }
  return Result.ok(undefined);
}
