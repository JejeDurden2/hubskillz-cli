import { describe, expect, it } from "vitest";
import { computeState } from "./compute-state";
import type { SkillVersionRef } from "./compute-state";

const v1: SkillVersionRef = {
  id: "v1",
  number: 1,
  contentHash: "hash-1",
  state: "deprecated",
};
const v2: SkillVersionRef = {
  id: "v2",
  number: 2,
  contentHash: "hash-2",
  state: "approved",
};
const draft: SkillVersionRef = {
  id: "v3",
  number: 3,
  contentHash: "hash-3",
  state: "draft",
};
const versions = [v1, v2, draft];

describe("computeState", () => {
  it("is synced when the installed hash is the approved version", () => {
    expect(
      computeState({
        installedHash: "hash-2",
        versions,
        approvedVersionId: "v2",
        requiredOrRecommended: true,
      }),
    ).toBe("synced");
  });

  it("is drifted when the installed hash is an older approved version", () => {
    expect(
      computeState({
        installedHash: "hash-1",
        versions,
        approvedVersionId: "v2",
        requiredOrRecommended: true,
      }),
    ).toBe("drifted");
  });

  it("is drifted when the installed hash is a known non-approved version", () => {
    expect(
      computeState({
        installedHash: "hash-3",
        versions,
        approvedVersionId: "v2",
        requiredOrRecommended: true,
      }),
    ).toBe("drifted");
  });

  it("is customized when the installed hash matches no version", () => {
    expect(
      computeState({
        installedHash: "edited-locally",
        versions,
        approvedVersionId: "v2",
        requiredOrRecommended: true,
      }),
    ).toBe("customized");
  });

  it("is missing when not installed and a team wants it", () => {
    expect(
      computeState({
        installedHash: null,
        versions,
        approvedVersionId: "v2",
        requiredOrRecommended: true,
      }),
    ).toBe("missing");
  });

  it("is unmanaged when installed and the name is not in the directory", () => {
    expect(
      computeState({
        installedHash: "hash-1",
        versions: [],
        approvedVersionId: null,
        requiredOrRecommended: false,
      }),
    ).toBe("unmanaged");
  });

  it("reports nothing when not installed and no team wants it", () => {
    expect(
      computeState({
        installedHash: null,
        versions,
        approvedVersionId: "v2",
        requiredOrRecommended: false,
      }),
    ).toBeNull();
  });

  it("reports nothing when absent from both the disk and the directory", () => {
    expect(
      computeState({
        installedHash: null,
        versions: [],
        approvedVersionId: null,
        requiredOrRecommended: false,
      }),
    ).toBeNull();
  });

  it("is customized when the skill has no approved version yet", () => {
    expect(
      computeState({
        installedHash: "something-else",
        versions: [draft],
        approvedVersionId: null,
        requiredOrRecommended: false,
      }),
    ).toBe("customized");
  });

  it("is synced through content, not through the version id", () => {
    const reissued: SkillVersionRef = {
      id: "v4",
      number: 4,
      contentHash: "hash-2",
      state: "approved",
    };
    expect(
      computeState({
        installedHash: "hash-2",
        versions: [v2, reissued],
        approvedVersionId: "v4",
        requiredOrRecommended: true,
      }),
    ).toBe("synced");
  });
});
