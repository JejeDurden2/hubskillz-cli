import { describe, expect, it } from "vitest";
import { describeSkillMd, parseSkillMd } from "./skill-md";

describe("parseSkillMd", () => {
  it("reads the frontmatter block and returns the rest as body", () => {
    const parsed = parseSkillMd(
      "---\nname: code-review\ndescription: Review a diff.\n---\n\n# Title\n",
    );
    expect(parsed.frontmatter).toEqual([
      { key: "name", value: "code-review" },
      { key: "description", value: "Review a diff." },
    ]);
    expect(parsed.body).toBe("# Title\n");
  });

  it("keeps a value that holds a colon", () => {
    const parsed = parseSkillMd("---\nuse: when: ready\n---\nbody");
    expect(parsed.frontmatter).toEqual([{ key: "use", value: "when: ready" }]);
  });

  it("returns the whole source when there is no frontmatter", () => {
    expect(parseSkillMd("# Title").frontmatter).toEqual([]);
    expect(parseSkillMd("# Title").body).toBe("# Title");
  });
});

describe("describeSkillMd", () => {
  it("prefers the frontmatter description", () => {
    const source = "---\nname: x\ndescription: From the header\n---\n\nBody.";
    expect(describeSkillMd(source, "x")).toBe("From the header");
  });

  it("strips YAML quotes and keeps the first sentence", () => {
    const source =
      '---\nname: x\ndescription: "Use for e.g. AI SEO on interfaces.dev/x. Also when asked."\n---\n';
    expect(describeSkillMd(source, "x")).toBe(
      "Use for e.g. AI SEO on interfaces.dev/x.",
    );
  });

  it("falls back to the first paragraph, skipping headings", () => {
    const source =
      "---\nname: x\n---\n\n# Title\n\nFirst line\nsecond line.\n\nMore.";
    expect(describeSkillMd(source, "x")).toBe("First line second line.");
  });

  it("truncates a long paragraph to 200 characters", () => {
    expect(describeSkillMd("a".repeat(500), "x")).toHaveLength(200);
  });

  it("falls back to the skill name", () => {
    expect(describeSkillMd("---\nname: x\n---\n", "x")).toBe("x");
  });
});
