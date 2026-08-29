import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySkill } from "./apply";

let root = "";
let dir = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "hubskillz-apply-"));
  dir = join(root, "alpha");
  await mkdir(join(dir, "ref"), { recursive: true });
  await writeFile(join(dir, "SKILL.md"), "# v1\n", "utf8");
  await writeFile(join(dir, "ref", "old.md"), "old\n", "utf8");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("applySkill", () => {
  it("writes the version, drops what it no longer holds", async () => {
    const result = await applySkill({
      dir,
      files: [
        { path: "SKILL.md", content: "# v2\n" },
        { path: "ref/new.md", content: "new\n" },
      ],
      remove: ["ref/old.md"],
    });

    expect(result.isSuccess).toBe(true);
    expect(await readFile(join(dir, "SKILL.md"), "utf8")).toBe("# v2\n");
    expect(await readFile(join(dir, "ref", "new.md"), "utf8")).toBe("new\n");
    await expect(
      readFile(join(dir, "ref", "old.md"), "utf8"),
    ).rejects.toThrow();
  });

  it("creates a skill dir that does not exist yet", async () => {
    const fresh = join(root, "beta");
    await applySkill({
      dir: fresh,
      files: [{ path: "a/b/SKILL.md", content: "deep\n" }],
      remove: [],
    });

    expect(await readFile(join(fresh, "a", "b", "SKILL.md"), "utf8")).toBe(
      "deep\n",
    );
  });

  it("leaves no staging directory behind", async () => {
    await applySkill({
      dir,
      files: [{ path: "SKILL.md", content: "# v2\n" }],
      remove: [],
    });

    expect(await readdir(root)).toEqual(["alpha"]);
  });

  it("prunes a directory emptied by a removal", async () => {
    await applySkill({
      dir,
      files: [{ path: "SKILL.md", content: "# v2\n" }],
      remove: ["ref/old.md"],
    });

    expect(await readdir(dir)).toEqual(["SKILL.md"]);
  });

  it("refuses to write outside the skill directory", async () => {
    const result = await applySkill({
      dir,
      files: [{ path: "../escape.md", content: "nope\n" }],
      remove: [],
    });

    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe("UNSAFE_PATH");
    await expect(readFile(join(root, "escape.md"), "utf8")).rejects.toThrow();
  });

  it("refuses an absolute path", async () => {
    const result = await applySkill({
      dir,
      files: [{ path: "/etc/nope", content: "nope\n" }],
      remove: [],
    });

    expect(result.isFailure).toBe(true);
  });
});
