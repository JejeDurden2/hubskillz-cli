import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLock } from "./lock";

let base = "";

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "hubskillz-lock-"));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function lock(name: string, body: string): Promise<string> {
  const path = join(base, name);
  await writeFile(path, body, "utf8");
  return path;
}

describe("readLock", () => {
  it("reads the global v3 format", async () => {
    const path = await lock(
      ".skill-lock.json",
      JSON.stringify({
        version: 3,
        skills: {
          "find-skills": {
            source: "vercel-labs/skills",
            sourceType: "github",
            sourceUrl: "https://github.com/vercel-labs/skills",
            skillPath: "skills/find-skills/SKILL.md",
            skillFolderHash: "tree-sha",
            installedAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
          },
        },
      }),
    );

    expect([...(await readLock(path))]).toEqual([
      [
        "find-skills",
        {
          source: "vercel-labs/skills",
          skillPath: "skills/find-skills/SKILL.md",
          hash: "tree-sha",
        },
      ],
    ]);
  });

  it("reads the project v1 format", async () => {
    const path = await lock(
      "skills-lock.json",
      JSON.stringify({
        version: 1,
        skills: {
          alpha: {
            source: "acme/skills",
            sourceType: "github",
            ref: "main",
            skillPath: "skills/alpha/SKILL.md",
            computedHash: "sha256-x",
          },
        },
      }),
    );

    expect((await readLock(path)).get("alpha")).toEqual({
      source: "acme/skills",
      skillPath: "skills/alpha/SKILL.md",
      hash: "sha256-x",
    });
  });

  it("reads a missing file as empty", async () => {
    expect((await readLock(join(base, "nope.json"))).size).toBe(0);
  });

  it("reads a corrupt file as empty", async () => {
    const path = await lock("bad.json", "{ not json");
    expect((await readLock(path)).size).toBe(0);
  });

  it("ignores entries that are not github with a skillPath", async () => {
    const path = await lock(
      "skills-lock.json",
      JSON.stringify({
        skills: {
          local: {
            source: "./skills",
            sourceType: "local",
            skillPath: "skills/local/SKILL.md",
            computedHash: "h",
          },
          nopath: { source: "a/b", sourceType: "github", computedHash: "h" },
          broken: 42,
        },
      }),
    );

    expect((await readLock(path)).size).toBe(0);
  });
});
