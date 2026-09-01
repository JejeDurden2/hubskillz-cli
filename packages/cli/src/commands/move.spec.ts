import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { moveSkill, pickSource } from "./move";

let base = "";
let from = "";
let to = "";

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "hubskillz-move-"));
  from = join(base, "project", ".claude", "skills");
  to = join(base, "home", ".claude", "skills");
  await mkdir(join(from, "alpha"), { recursive: true });
  await mkdir(to, { recursive: true });
  await writeFile(join(from, "alpha", "SKILL.md"), "# alpha\n", "utf8");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("moveSkill", () => {
  it("moves the folder and leaves nothing behind", async () => {
    const result = await moveSkill(
      join(from, "alpha"),
      join(to, "alpha"),
      false,
    );

    expect(result.isSuccess).toBe(true);
    expect(await readFile(join(to, "alpha", "SKILL.md"), "utf8")).toBe(
      "# alpha\n",
    );
    expect(await lstat(join(from, "alpha")).catch(() => null)).toBeNull();
  });

  it("refuses to overwrite the destination without --force", async () => {
    await mkdir(join(to, "alpha"), { recursive: true });
    await writeFile(join(to, "alpha", "SKILL.md"), "# theirs\n", "utf8");

    const result = await moveSkill(
      join(from, "alpha"),
      join(to, "alpha"),
      false,
    );

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("DESTINATION_EXISTS");
    expect(await readFile(join(to, "alpha", "SKILL.md"), "utf8")).toBe(
      "# theirs\n",
    );
  });

  it("replaces the destination with --force", async () => {
    await mkdir(join(to, "alpha"), { recursive: true });
    await writeFile(join(to, "alpha", "SKILL.md"), "# theirs\n", "utf8");

    const result = await moveSkill(
      join(from, "alpha"),
      join(to, "alpha"),
      true,
    );

    expect(result.isSuccess).toBe(true);
    expect(await readFile(join(to, "alpha", "SKILL.md"), "utf8")).toBe(
      "# alpha\n",
    );
  });

  it("moves a symlinked skill as a link, so its target stays put", async () => {
    const canonical = join(base, "agents", "beta");
    await mkdir(canonical, { recursive: true });
    await writeFile(join(canonical, "SKILL.md"), "# beta\n", "utf8");
    await symlink(canonical, join(from, "beta"));

    const result = await moveSkill(join(from, "beta"), join(to, "beta"), false);

    expect(result.isSuccess).toBe(true);
    expect((await lstat(join(to, "beta"))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(canonical, "SKILL.md"), "utf8")).toBe(
      "# beta\n",
    );
  });

  it("reports a source that is not there", async () => {
    const result = await moveSkill(join(from, "nope"), join(to, "nope"), false);

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("SKILL_NOT_FOUND");
  });
});

describe("pickSource", () => {
  const roots = ["/p/.claude/skills", "/h/.claude/skills"];

  it("takes the one root holding the skill", () => {
    const picked = pickSource(
      "alpha",
      roots,
      "/h/.claude/skills",
      (root) => root === "/p/.claude/skills",
    );

    expect(picked.value).toBe("/p/.claude/skills");
  });

  it("ignores the destination, so a duplicate still moves", () => {
    // alpha sits in both: the copy to move is the one that is not the target.
    const picked = pickSource("alpha", roots, "/h/.claude/skills", () => true);

    expect(picked.value).toBe("/p/.claude/skills");
  });

  it("asks for --from when two other roots hold the name", () => {
    const picked = pickSource(
      "alpha",
      roots,
      "/other/.claude/skills",
      () => true,
    );

    expect(picked.isFailure).toBe(true);
    expect(picked.error.code).toBe("AMBIGUOUS_SOURCE");
  });

  it("reports a name no root holds", () => {
    const picked = pickSource("alpha", roots, "/h/.claude/skills", () => false);

    expect(picked.isFailure).toBe(true);
    expect(picked.error.code).toBe("SKILL_NOT_FOUND");
  });
});
