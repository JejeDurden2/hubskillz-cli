import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanSurface } from "../scan";
import type { ScannedSkill, Surface } from "../scan";
import {
  brokenFindings,
  duplicateFindings,
  scatteredFindings,
  skillFindings,
} from "./doctor";

function skill(name: string, hash: string): ScannedSkill {
  return { name, dir: `/x/${name}`, files: [], contentHash: hash, link: false };
}

function surface(
  path: string,
  scope: "global" | "project",
  skills: readonly ScannedSkill[],
): Surface {
  return {
    descriptor: {
      kind: "claude-code-local",
      label: path,
      machineId: "m",
      path,
      scope,
    },
    skills,
  };
}

describe("skillFindings", () => {
  it("calls a folder without SKILL.md an error", () => {
    const found = skillFindings(
      {
        ...skill("alpha", "h"),
        files: [{ path: "ref.md", content: "x", hash: "h", size: 1 }],
      },
      "~/.claude/skills",
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.level).toBe("error");
  });

  it("warns on a SKILL.md with no description", () => {
    const found = skillFindings(
      {
        ...skill("alpha", "h"),
        files: [
          {
            path: "SKILL.md",
            content: "---\nname: alpha\n---\n\nbody\n",
            hash: "h",
            size: 1,
          },
        ],
      },
      "~/.claude/skills",
    );

    expect(found.map((finding) => finding.level)).toEqual(["warn"]);
    expect(found[0]?.problem).toContain("without a description");
  });

  it("says nothing about a complete skill", () => {
    const found = skillFindings(
      {
        ...skill("alpha", "h"),
        files: [
          {
            path: "SKILL.md",
            content:
              "---\nname: alpha\ndescription: When to use it.\n---\n\nbody\n",
            hash: "h",
            size: 1,
          },
        ],
      },
      "~/.claude/skills",
    );

    expect(found).toEqual([]);
  });
});

describe("duplicateFindings", () => {
  it("calls an identical project copy dead weight", () => {
    const found = duplicateFindings([
      surface("/h/.claude/skills", "global", [skill("alpha", "same")]),
      surface("/p/.claude/skills", "project", [skill("alpha", "same")]),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]?.problem).toContain("safe to delete");
  });

  it("says a different project copy wins over the global one", () => {
    const found = duplicateFindings([
      surface("/h/.claude/skills", "global", [skill("alpha", "one")]),
      surface("/p/.claude/skills", "project", [skill("alpha", "two")]),
    ]);

    expect(found[0]?.problem).toContain("wins over it");
  });
});

describe("scatteredFindings", () => {
  it("points the same copy in two projects at the global root", () => {
    const found = scatteredFindings([
      surface("/h/.claude/skills", "global", []),
      surface("/a/.claude/skills", "project", [skill("alpha", "same")]),
      surface("/b/.claude/skills", "project", [skill("alpha", "same")]),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]?.problem).toContain("move alpha global");
  });

  it("leaves it alone once the global root has the skill", () => {
    // duplicateFindings already reports each project copy: one voice per problem.
    const found = scatteredFindings([
      surface("/h/.claude/skills", "global", [skill("alpha", "same")]),
      surface("/a/.claude/skills", "project", [skill("alpha", "same")]),
      surface("/b/.claude/skills", "project", [skill("alpha", "same")]),
    ]);

    expect(found).toEqual([]);
  });

  it("leaves two copies that drifted apart alone", () => {
    const found = scatteredFindings([
      surface("/a/.claude/skills", "project", [skill("alpha", "one")]),
      surface("/b/.claude/skills", "project", [skill("alpha", "two")]),
    ]);

    expect(found).toEqual([]);
  });
});

describe("brokenFindings", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hubskillz-doctor-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reports a dead symlink and an empty folder", async () => {
    await mkdir(join(root, "empty"), { recursive: true });
    await symlink(join(root, "gone"), join(root, "dangling"));
    await mkdir(join(root, "good"), { recursive: true });
    await writeFile(join(root, "good", "SKILL.md"), "# good\n", "utf8");

    const found = await brokenFindings(root, "global");

    expect(found.map((finding) => finding.skill).sort()).toEqual([
      "dangling",
      "empty",
    ]);
    expect(found.every((finding) => finding.level === "error")).toBe(true);
  });

  it("says nothing about a healthy root", async () => {
    await mkdir(join(root, "good"), { recursive: true });
    await writeFile(join(root, "good", "SKILL.md"), "# good\n", "utf8");

    expect(await brokenFindings(root, "global")).toEqual([]);
    // The scan agrees: one skill, no surprise left behind.
    expect((await scanSurface(root, "l", "m", "global")).skills).toHaveLength(
      1,
    );
  });
});
