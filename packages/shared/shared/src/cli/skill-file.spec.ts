import { describe, expect, it } from "vitest";
import { isSkillFile } from "./skill-file";

describe("isSkillFile", () => {
  it("keeps text under the skill, drops dotfiles, binaries and vendored dirs", () => {
    expect(isSkillFile("SKILL.md")).toBe(true);
    expect(isSkillFile("references/a.md")).toBe(true);
    expect(isSkillFile(".gitignore")).toBe(false);
    expect(isSkillFile("scripts/.env.example")).toBe(false);
    expect(isSkillFile("logo.png")).toBe(false);
    expect(isSkillFile("node_modules/x/index.js")).toBe(false);
  });
});
