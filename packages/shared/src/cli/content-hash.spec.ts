import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contentHash } from "./content-hash";

describe("contentHash", () => {
  it("hashes files sorted by path, path and content NUL separated", () => {
    const expected = createHash("sha256")
      .update("SKILL.md\0# a\0")
      .update("ref/b.md\0b\0")
      .digest("hex");
    expect(
      contentHash([
        { path: "ref/b.md", content: "b" },
        { path: "SKILL.md", content: "# a" },
      ]),
    ).toBe(expected);
  });

  it("does not depend on the input order", () => {
    const files = [
      { path: "a", content: "1" },
      { path: "b", content: "2" },
    ];
    expect(contentHash(files)).toBe(contentHash([...files].reverse()));
  });

  it("separates path from content so a rename changes the hash", () => {
    expect(contentHash([{ path: "ab", content: "c" }])).not.toBe(
      contentHash([{ path: "a", content: "bc" }]),
    );
  });

  it("hashes an empty skill to the empty sha256", () => {
    expect(contentHash([])).toBe(createHash("sha256").digest("hex"));
  });
});
