import { describe, expect, it } from "vitest";
import { forkFieldsFrom, githubTreeUrl, isUpdateAvailable } from "./upstream";

describe("isUpdateAvailable", () => {
  it("is true only for a pinned skills.sh skill whose head moved", () => {
    expect(
      isUpdateAvailable({
        origin: "SKILLS_SH",
        upstreamHeadHash: "b",
        approvedBaseHash: "a",
      }),
    ).toBe(true);
    expect(
      isUpdateAvailable({
        origin: "SKILLS_SH",
        upstreamHeadHash: "a",
        approvedBaseHash: "a",
      }),
    ).toBe(false);
    expect(
      isUpdateAvailable({
        origin: "SKILLS_SH",
        upstreamHeadHash: "b",
        approvedBaseHash: null,
      }),
    ).toBe(false);
    expect(
      isUpdateAvailable({
        origin: "INTERNAL",
        upstreamHeadHash: "b",
        approvedBaseHash: "a",
      }),
    ).toBe(false);
  });
});

describe("githubTreeUrl", () => {
  it("points at the skill dir at one commit", () => {
    expect(githubTreeUrl("o/r", "abc", "skills/x/SKILL.md")).toBe(
      "https://github.com/o/r/tree/abc/skills/x",
    );
  });
});

describe("forkFieldsFrom", () => {
  it("pins the approved version first", () => {
    expect(
      forkFieldsFrom([
        { state: "DRAFT", upstreamCommit: "c2", upstreamBaseHash: "h2" },
        { state: "APPROVED", upstreamCommit: "c1", upstreamBaseHash: "h1" },
      ]),
    ).toEqual({ kind: "FORK", upstreamCommit: "c1", upstreamBaseHash: "h1" });
  });

  it("falls back to the newest version carrying a pin, else nulls", () => {
    expect(
      forkFieldsFrom([
        { state: "DRAFT", upstreamCommit: null, upstreamBaseHash: null },
        { state: "REJECTED", upstreamCommit: "c2", upstreamBaseHash: "h2" },
      ]),
    ).toEqual({ kind: "FORK", upstreamCommit: "c2", upstreamBaseHash: "h2" });
    expect(forkFieldsFrom([])).toEqual({
      kind: "FORK",
      upstreamCommit: null,
      upstreamBaseHash: null,
    });
  });
});
