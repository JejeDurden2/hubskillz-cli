import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentHash } from "@hubskillz/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inventoryRequestOf, scanSkills, scanSurface } from "./scan";

let base = "";

async function write(path: string, content: string): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "hubskillz-scan-"));
  const root = join(base, "skills");

  await write(join(root, "alpha", "SKILL.md"), "# alpha\n");
  await write(join(root, "alpha", "ref", "nested.md"), "nested\n");
  await write(join(root, "alpha", ".env"), "SECRET=1\n");
  await write(join(root, "alpha", "node_modules", "dep.js"), "noise\n");
  await write(join(root, "alpha", ".git", "HEAD"), "ref: main\n");
  await write(join(root, ".hidden", "SKILL.md"), "# hidden\n");
  await write(join(base, "elsewhere", "gamma", "SKILL.md"), "# gamma\n");

  await mkdir(root, { recursive: true });
  await symlink(join(base, "elsewhere", "gamma"), join(root, "beta"), "dir");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("scanSkills", () => {
  it("reads each skill dir recursively, skipping noise", async () => {
    const skills = await scanSkills(join(base, "skills"));

    expect(skills.map((skill) => skill.name)).toEqual(["alpha", "beta"]);
    expect(skills[0]?.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "ref/nested.md",
    ]);
  });

  it("follows symlinked skill dirs and flags them", async () => {
    const skills = await scanSkills(join(base, "skills"));

    expect(skills[0]?.link).toBe(false);
    expect(skills[1]?.link).toBe(true);
    expect(skills[1]?.files[0]?.content).toBe("# gamma\n");
  });

  it("hashes a skill with the shared content hash", async () => {
    const skills = await scanSkills(join(base, "skills"));

    expect(skills[0]?.contentHash).toBe(
      contentHash([
        { path: "SKILL.md", content: "# alpha\n" },
        { path: "ref/nested.md", content: "nested\n" },
      ]),
    );
  });

  it("returns no skill for a root that does not exist", async () => {
    expect(await scanSkills(join(base, "nope"))).toEqual([]);
  });
});

describe("inventoryRequestOf", () => {
  it("sends hashes and sizes, plus content for private skills", async () => {
    const surface = await scanSurface(
      join(base, "skills"),
      "laptop:demo",
      "machine-1",
    );
    const request = inventoryRequestOf(surface);

    expect(request.surface).toEqual({
      kind: "claude-code-local",
      label: "laptop:demo",
      machineId: "machine-1",
      path: join(base, "skills"),
    });
    expect(request.skills[0]?.files[0]).toEqual({
      path: "SKILL.md",
      hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      size: 8,
      content: "# alpha\n",
    });
  });
});

describe("scanSurface upstream", () => {
  it("attaches the lock entry of a symlinked skill by its canonical name", async () => {
    const project = join(base, "project");
    const canonical = join(base, ".agents", "skills", "find-skills");
    await write(join(canonical, "SKILL.md"), "# find\n");
    await mkdir(join(project, ".claude", "skills"), { recursive: true });
    await symlink(
      canonical,
      join(project, ".claude", "skills", "renamed"),
      "dir",
    );
    await write(
      join(project, "skills-lock.json"),
      JSON.stringify({
        skills: {
          "find-skills": {
            source: "vercel-labs/skills",
            sourceType: "github",
            skillPath: "skills/find-skills/SKILL.md",
            computedHash: "h1",
          },
        },
      }),
    );

    const surface = await scanSurface(
      join(project, ".claude", "skills"),
      "laptop:project",
      "machine-1",
    );

    expect(surface.skills[0]?.upstream).toEqual({
      source: "vercel-labs/skills",
      skillPath: "skills/find-skills/SKILL.md",
      hash: "h1",
    });
    const request = inventoryRequestOf(surface);
    expect(request.skills[0]?.upstream?.source).toBe("vercel-labs/skills");
    // Upstream skills are re-fetched from the source: no content travels.
    expect(JSON.stringify(request)).not.toContain("# find");
  });
});
