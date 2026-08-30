import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  Result,
  adoptResponseSchema,
  appliedResponseSchema,
  approvedResponseSchema,
  pendingResponseSchema,
} from "@hubskillz/shared";
import type { ApprovedSkill, InventoryResponse } from "@hubskillz/shared";
import { apiRequest } from "../api";
import type { Session } from "../api";
import { applySkill } from "../apply";
import { readConfig, resolveBaseUrl, writeConfig } from "../config";
import { CliError } from "../errors";
import { accent, dim, plural, table } from "../output";
import { computePlan, planHasWrites } from "../plan";
import type { SkillPlan } from "../plan";
import { confirm } from "../prompt";
import { exists, globalSkillsRoot, scanSurface } from "../scan";
import type { Surface } from "../scan";
import { localSurfaces } from "../surfaces";
import { discoverAndRegister } from "./projects";
import { originOf, postInventory, printHeader, printNotes } from "./status";

export interface SyncOptions {
  readonly baseUrl: string | undefined;
  readonly path: string | undefined;
  readonly all: boolean;
  readonly adopt: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly force: boolean;
}

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
    const result = await syncSurface(session, surface, options);
    if (result.isFailure) return result;
  }
  // The quickstart stops showing once one real sync went through. With an
  // env token there may be no file, and none gets created.
  if (
    !options.dryRun &&
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
  options: SyncOptions,
): Promise<Result<void>> {
  const first = await postInventory(session, surface);
  if (first.isFailure) return Result.fail(first.error);
  const surfaceId = first.value.surfaceId;

  const inventory = await maybeAdopt(session, surface, first.value, options);
  if (inventory.isFailure) return Result.fail(inventory.error);

  const approved = await apiRequest({
    session,
    method: "GET",
    path: `/api/cli/approved?surfaceId=${encodeURIComponent(surfaceId)}`,
    schema: approvedResponseSchema,
  });
  if (approved.isFailure) return Result.fail(approved.error);

  // A blocked version ships no files: it never enters the plan, only the log.
  const blocked = approved.value.skills.filter((skill) => skill.blocked);
  const plans = computePlan({
    items: inventory.value.items,
    approved: approved.value.skills.filter((skill) => !skill.blocked),
    local: surface.skills,
    force: options.force,
  });

  printHeader(surface);
  printPlan(plans, blocked, surface);
  printNotes(surface, inventory.value.items, session.baseUrl);

  if (options.dryRun) return Result.ok(undefined);
  // A run with nothing to write still answers the sync the browser asked for:
  // drain the requests, or the surface keeps a pending badge for ever.
  if (!planHasWrites(plans)) return clearPending(session, surfaceId);
  if (!options.yes && !(await confirm("Apply?"))) {
    process.stdout.write("Nothing applied.\n");
    return Result.ok(undefined);
  }

  const applied = await applyPlan(surface, plans, approved.value.skills);
  if (applied.isFailure) return applied;

  const rescanned = await scanSurface(
    surface.descriptor.path,
    surface.descriptor.label,
    surface.descriptor.machineId,
    surface.descriptor.scope,
  );
  const reposted = await postInventory(session, rescanned);
  if (reposted.isFailure) return Result.fail(reposted.error);

  return clearPending(session, surfaceId);
}

/**
 * First contact: what sits on disk and is not in the directory yet becomes
 * approved, so the plan below reads the adopted set. Returns the inventory
 * to plan against, fresh when something was adopted.
 */
async function maybeAdopt(
  session: Session,
  surface: Surface,
  inventory: InventoryResponse,
  options: SyncOptions,
): Promise<Result<InventoryResponse>> {
  const importable = inventory.items.filter((item) => item.importable);
  if (importable.length === 0 || options.dryRun) return Result.ok(inventory);

  const wanted =
    options.adopt ||
    (!options.yes &&
      (await confirm(
        `Adopt ${plural(importable.length, "skill")} found here as approved in your directory?`,
      )));
  if (!wanted) return Result.ok(inventory);

  process.stdout.write(
    dim(
      `adopting ${plural(importable.length, "skill")}, this can take a minute...\n`,
    ),
  );
  const adopted = await apiRequest({
    session,
    method: "POST",
    path: "/api/cli/adopt",
    schema: adoptResponseSchema,
    body: { surfaceId: inventory.surfaceId },
  });
  // Adopting is maintainer-only; a member keeps syncing what is approved.
  if (adopted.isFailure && adopted.error.code === "FORBIDDEN") {
    process.stdout.write(
      `${dim("not adopted: ask a maintainer to adopt these skills")}\n`,
    );
    return Result.ok(inventory);
  }
  if (adopted.isFailure) return Result.fail(adopted.error);

  const names = adopted.value.adopted;
  process.stdout.write(
    names.length === 0
      ? `${dim("nothing adopted")}\n`
      : `adopted ${plural(names.length, "skill")} as approved: ${names.join(", ")}\n`,
  );
  for (const skip of adopted.value.skipped) {
    process.stdout.write(dim(`skipped ${skip.name} (${skip.code})\n`));
  }
  if (adopted.value.adopted.length === 0) return Result.ok(inventory);
  return postInventory(session, surface);
}

async function applyPlan(
  surface: Surface,
  plans: readonly SkillPlan[],
  approved: readonly ApprovedSkill[],
): Promise<Result<void>> {
  for (const plan of plans) {
    if (plan.action === "remove") {
      // The server saw the copy as inherited; trust only what the global root
      // holds right now before deleting anything from the project.
      if (!exists(join(globalSkillsRoot(), plan.name))) {
        process.stdout.write(
          `${plan.name}: no longer in ~/.claude/skills, keeping the copy here\n`,
        );
        continue;
      }
      // rm never follows a symlinked skill dir: the link goes, the canonical
      // copy under ~/.agents/skills stays.
      await rm(join(surface.descriptor.path, plan.name), {
        recursive: true,
        force: true,
      });
      process.stdout.write(
        `removed ${plan.name} (inherited from ~/.claude/skills)\n`,
      );
      continue;
    }
    if (plan.action !== "install" && plan.action !== "update") continue;
    const skill = approved.find((entry) => entry.name === plan.name);
    if (skill === undefined) continue;
    const dir = await writeTarget(surface.descriptor.path, plan.name);
    if (dir.isFailure) return Result.fail(dir.error);
    if (await containsSymlink(dir.value)) {
      process.stdout.write(
        `${plan.name}: contains a symlink, refusing to write\n`,
      );
      continue;
    }
    const written = await applySkill({
      dir: dir.value,
      files: skill.files,
      remove: plan.removed,
    });
    if (written.isFailure) return written;
    process.stdout.write(
      `${plan.action === "install" ? "installed" : "updated"} ${plan.name} v${plan.version}\n`,
    );
  }
  return Result.ok(undefined);
}

/**
 * Where a skill gets written. A symlinked skill dir (skills.sh canonical copy
 * under `~/.agents/skills`) is written through: the target gets the files and
 * the link stays, so every agent on the machine sees the approved version.
 * A link that leaves the home dir or loops back into the skill root is refused.
 */
async function writeTarget(
  root: string,
  name: string,
): Promise<Result<string>> {
  const dir = join(root, name);
  const stats = await lstat(dir).catch(() => null);
  if (stats === null || !stats.isSymbolicLink()) return Result.ok(dir);

  const target = await realpath(dir).catch(() => null);
  const home = await realpath(homedir()).catch(() => homedir());
  if (
    target === null ||
    !isInside(target, home) ||
    isInside(target, await realpath(root).catch(() => resolve(root)))
  ) {
    return Result.fail(
      new CliError(
        "UNSAFE_LINK",
        `Refusing to write through ${dir}: it points to ${target ?? "nowhere"}.`,
      ),
    );
  }
  return Result.ok(target);
}

/** A symlink nested in the skill dir would be written through: refuse it. */
async function containsSymlink(dir: string): Promise<boolean> {
  const entries = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);
  return entries.some((entry) => entry.isSymbolicLink());
}

function isInside(path: string, dir: string): boolean {
  return path.startsWith(dir + sep);
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

function printPlan(
  plans: readonly SkillPlan[],
  blocked: readonly ApprovedSkill[],
  surface: Surface,
): void {
  // Inherited skills sit in the machine's global root: nothing to write here,
  // one count line instead of one row each.
  const listed = plans.filter((plan) => plan.action !== "inherited");
  const rows = [
    ...listed.map((plan) => [
      plan.action,
      plan.name,
      originOf(surface, plan.name),
      `v${plan.version}`,
      detailOf(plan),
    ]),
    ...blocked.map((skill) => [
      accent("blocked"),
      skill.name,
      originOf(surface, skill.name),
      `v${skill.version}`,
      `org policy: ${skill.blockedReason ?? "no reason given"}`,
    ]),
  ];
  const inherited = plans.length - listed.length;
  if (rows.length === 0) {
    const note =
      inherited > 0
        ? `nothing to sync, ${inherited} inherited from ~/.claude/skills`
        : "nothing to sync";
    process.stdout.write(`${dim(note)}\n\n`);
    return;
  }
  process.stdout.write(
    `${table(["ACTION", "SKILL", "ORIGIN", "VERSION", "FILES"], rows)}\n`,
  );
  for (const plan of plans) {
    if (plan.action !== "update") continue;
    for (const [marker, paths] of [
      ["+", plan.added],
      ["~", plan.changed],
      ["-", plan.removed],
    ] as const) {
      for (const path of paths) {
        process.stdout.write(dim(`  ${marker} ${plan.name}/${path}\n`));
      }
    }
  }

  const counts: readonly (readonly [number, string])[] = [
    [plans.filter((plan) => plan.action === "install").length, "to install"],
    [plans.filter((plan) => plan.action === "update").length, "to update"],
    [plans.filter((plan) => plan.action === "keep").length, "up to date"],
    [plans.filter((plan) => plan.action === "remove").length, "to remove"],
    [
      plans.filter((plan) => plan.action === "inherited").length,
      "inherited from ~/.claude/skills",
    ],
    [plans.filter((plan) => plan.action === "skip").length, "skipped"],
    [blocked.length, "blocked"],
  ];
  process.stdout.write(
    `${counts
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${n} ${label}`)
      .join(", ")}\n\n`,
  );
}

function detailOf(plan: SkillPlan): string {
  if (plan.action === "keep") return dim("up to date");
  if (plan.action === "skip") {
    return `${accent("customized locally")}, use --force to overwrite`;
  }
  if (plan.action === "remove") {
    return "duplicate of ~/.claude/skills, Claude Code loads it from there";
  }
  if (plan.action === "install") return `+${plan.added.length}`;
  return `+${plan.added.length} ~${plan.changed.length} -${plan.removed.length}`;
}
