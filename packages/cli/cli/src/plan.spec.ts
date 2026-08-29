import type { ApprovedSkill, InventoryItem } from "@hubskillz/shared";
import { describe, expect, it } from "vitest";
import { computePlan, planHasWrites } from "./plan";
import type { LocalSkill, PlanInput } from "./plan";

const approvedAlpha: ApprovedSkill = {
  name: "alpha",
  versionId: "v2",
  version: 2,
  contentHash: "hash-2",
  files: [
    { path: "SKILL.md", content: "# alpha v2\n" },
    { path: "ref/new.md", content: "new\n" },
  ],
};

function item(name: string, state: InventoryItem["state"]): InventoryItem {
  return { name, state, required: true };
}

function plan(overrides: Partial<PlanInput>): ReturnType<typeof computePlan> {
  return computePlan({
    items: [],
    approved: [approvedAlpha],
    local: [],
    force: false,
    ...overrides,
  });
}

const drifted: LocalSkill = {
  name: "alpha",
  files: [
    { path: "SKILL.md", content: "# alpha v1\n" },
    { path: "ref/old.md", content: "old\n" },
  ],
};

describe("computePlan", () => {
  it("installs a missing skill with every file added", () => {
    const [entry] = plan({ items: [item("alpha", "missing")] });

    expect(entry?.action).toBe("install");
    expect(entry?.added).toEqual(["SKILL.md", "ref/new.md"]);
    expect(entry?.removed).toEqual([]);
  });

  it("updates a drifted skill and lists the file level diff", () => {
    const [entry] = plan({
      items: [item("alpha", "drifted")],
      local: [drifted],
    });

    expect(entry?.action).toBe("update");
    expect(entry?.added).toEqual(["ref/new.md"]);
    expect(entry?.changed).toEqual(["SKILL.md"]);
    expect(entry?.removed).toEqual(["ref/old.md"]);
  });

  it("keeps a skill already identical to the approved version", () => {
    const plans = plan({
      items: [item("alpha", "synced")],
      local: [{ name: "alpha", files: approvedAlpha.files }],
    });

    expect(plans[0]?.action).toBe("keep");
    expect(planHasWrites(plans)).toBe(false);
  });

  it("never overwrites a customized skill", () => {
    const [entry] = plan({
      items: [item("alpha", "customized")],
      local: [drifted],
    });

    expect(entry?.action).toBe("skip");
  });

  it("overwrites a customized skill with force", () => {
    const [entry] = plan({
      items: [item("alpha", "customized")],
      local: [drifted],
      force: true,
    });

    expect(entry?.action).toBe("update");
  });

  it("leaves unmanaged local skills out of the plan", () => {
    const plans = plan({
      items: [item("alpha", "synced"), item("scratch", "unmanaged")],
      local: [
        { name: "alpha", files: approvedAlpha.files },
        { name: "scratch", files: [{ path: "SKILL.md", content: "mine\n" }] },
      ],
    });

    expect(plans.map((entry) => entry.name)).toEqual(["alpha"]);
  });

  it("trusts the disk when the inventory has no item for a skill", () => {
    const [entry] = plan({ items: [], local: [] });

    expect(entry?.state).toBe("missing");
    expect(entry?.action).toBe("install");
  });

  it("orders the plan by skill name", () => {
    const beta: ApprovedSkill = { ...approvedAlpha, name: "beta" };
    const plans = plan({ approved: [beta, approvedAlpha] });

    expect(plans.map((entry) => entry.name)).toEqual(["alpha", "beta"]);
  });
});
