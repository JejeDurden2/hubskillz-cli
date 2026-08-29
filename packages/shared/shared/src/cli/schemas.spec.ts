import { describe, expect, it } from "vitest";
import { skillFilePathSchema, skillNameSchema } from "./schemas";

describe("skillNameSchema", () => {
  it("accepts kebab-case and rejects everything else", () => {
    for (const ok of ["code-review", "i18n", "a1-b2-c3"]) {
      expect(skillNameSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of [
      "a",
      "Code-Review",
      "code_review",
      "-lead",
      "trail-",
      "a--b",
      "x".repeat(61),
    ]) {
      expect(skillNameSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("skillFilePathSchema", () => {
  it("accepts relative POSIX paths and rejects escapes", () => {
    for (const ok of ["SKILL.md", "references/a.md", "a.b/c-d.txt"]) {
      expect(skillFilePathSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of [
      "/etc/passwd",
      "../x.md",
      "a/../b.md",
      "a\\b.md",
      "a\0b",
      "",
      "x".repeat(201),
    ]) {
      expect(skillFilePathSchema.safeParse(bad).success).toBe(false);
    }
  });
});
