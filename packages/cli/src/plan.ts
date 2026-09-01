import {
  type ApprovedSkill,
  releaseOf,
  type InventoryItem,
  type SkillFile,
  type SkillState,
} from "@hubskillz/shared";

type PlanAction =
  "install" | "update" | "keep" | "skip" | "inherited" | "remove";

export interface LocalSkill {
  readonly name: string;
  readonly files: readonly SkillFile[];
}

export interface SkillPlan {
  readonly name: string;
  readonly action: PlanAction;
  readonly state: SkillState;
  readonly version: number;
  /** What the skill calls itself, "2.0.1". Null when SKILL.md declares nothing. */
  readonly release: string | null;
  readonly added: readonly string[];
  readonly changed: readonly string[];
  readonly removed: readonly string[];
}

export interface PlanInput {
  readonly items: readonly InventoryItem[];
  readonly approved: readonly ApprovedSkill[];
  readonly local: readonly LocalSkill[];
  readonly force: boolean;
}

/**
 * What sync would do, from the inventory response, the approved payload and
 * what is on disk. Pure: no filesystem, no network.
 *
 * Skills on disk that no team requires or recommends are left alone and never
 * appear in the plan.
 */
export function computePlan(input: PlanInput): readonly SkillPlan[] {
  const plans: SkillPlan[] = [];

  for (const skill of input.approved) {
    const local = input.local.find((entry) => entry.name === skill.name);
    const item = input.items.find((entry) => entry.name === skill.name);
    const state: SkillState =
      item?.state ?? (local === undefined ? "missing" : "customized");

    const localFiles = new Map(
      (local?.files ?? []).map((file) => [file.path, file.content]),
    );
    const wanted = new Map(
      skill.files.map((file) => [file.path, file.content]),
    );

    const added: string[] = [];
    const changed: string[] = [];
    for (const [path, content] of wanted) {
      const current = localFiles.get(path);
      if (current === undefined) added.push(path);
      else if (current !== content) changed.push(path);
    }
    const removed = [...localFiles.keys()].filter((path) => !wanted.has(path));

    plans.push({
      name: skill.name,
      state,
      version: skill.version,
      release: releaseOf(skill.files),
      action: actionFor(
        state,
        local !== undefined,
        added.length + changed.length + removed.length,
        input.force,
      ),
      added: added.sort(),
      changed: changed.sort(),
      removed: removed.sort(),
    });
  }

  return plans.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** The label a version wears on screen: the skill's own release, else our vN. */
export function versionLabel(plan: {
  readonly version: number;
  readonly release: string | null;
}): string {
  return plan.release ?? `v${plan.version}`;
}

function actionFor(
  state: SkillState,
  installed: boolean,
  diffCount: number,
  force: boolean,
): PlanAction {
  // The machine's global root already holds it: nothing to write here, and an
  // unmodified or late local copy is a redundant shadow that gets removed.
  // A customized copy never reads as inherited, so it is never removed.
  if (state === "inherited") return installed ? "remove" : "inherited";
  if (state === "customized" && !force) return "skip";
  if (!installed) return "install";
  return diffCount === 0 ? "keep" : "update";
}

export function planHasWrites(plans: readonly SkillPlan[]): boolean {
  return plans.some(
    (plan) =>
      plan.action === "install" ||
      plan.action === "update" ||
      plan.action === "remove",
  );
}
