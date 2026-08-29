import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverProjects } from "./discover";
import { parseSelection } from "./prompt";

describe("discoverProjects", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "hubskillz-discover-"));
    for (const dir of [
      "a/.claude/skills",
      "b/node_modules/c/.claude/skills",
      "d/deep/deeper/deepest/.claude/skills",
      ".claude/skills",
    ]) {
      await mkdir(join(root, dir), { recursive: true });
    }
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("finds only projects within depth, skipping node_modules and the root", async () => {
    expect(await discoverProjects([root])).toEqual([join(root, "a")]);
  });
});

describe("parseSelection", () => {
  it("maps answers to indexes", () => {
    expect(parseSelection("", 3)).toEqual([0, 1, 2]);
    expect(parseSelection("all", 2)).toEqual([0, 1]);
    expect(parseSelection("none", 2)).toEqual([]);
    expect(parseSelection("3, 1 x 9", 3)).toEqual([0, 2]);
  });
});
