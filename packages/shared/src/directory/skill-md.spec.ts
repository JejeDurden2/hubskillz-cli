import { describe, expect, it } from "vitest";
import { declaredRelease, describeSkillMd, parseSkillMd } from "./skill-md";

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

  it("gathers a literal block scalar and keeps its line breaks", () => {
    const parsed = parseSkillMd(
      "---\nname: x\ndescription: |\n\n  Use when: asked.\n    Indented more.\n  Last.\nversion: 2\n---\nbody",
    );
    expect(parsed.frontmatter).toEqual([
      { key: "name", value: "x" },
      {
        key: "description",
        value: "Use when: asked.\n  Indented more.\nLast.",
      },
      { key: "version", value: "2" },
    ]);
  });

  it("folds a `>-` block into one line", () => {
    const parsed = parseSkillMd(
      "---\r\ndescription: >-\r\n  First part\r\n  second part.\r\n---\r\nbody",
    );
    expect(parsed.frontmatter).toEqual([
      { key: "description", value: "First part second part." },
    ]);
  });

  it("an empty block scalar reads as an empty value", () => {
    const parsed = parseSkillMd("---\ndescription: |\nname: x\n---\n");
    expect(parsed.frontmatter).toEqual([
      { key: "description", value: "" },
      { key: "name", value: "x" },
    ]);
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

  it("turns dashes into commas", () => {
    const source =
      "---\nname: x\ndescription: Scale ad creative — headlines, text — for any platform. More.\n---\n";
    expect(describeSkillMd(source, "x")).toBe(
      "Scale ad creative, headlines, text, for any platform.",
    );
  });

  it("summarizes a block scalar description", () => {
    const source =
      "---\nname: x\ndescription: |\n  Review a diff.\n  Also when asked.\n---\n";
    expect(describeSkillMd(source, "x")).toBe("Review a diff.");
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

describe("declaredRelease", () => {
  it("reads a top-level version", () => {
    expect(declaredRelease("---\nname: x\nversion: 1.4.0\n---\n")).toBe(
      "1.4.0",
    );
  });

  it("reads the version nested under metadata", () => {
    expect(
      declaredRelease("---\nname: x\nmetadata:\n  version: 2.0.1\n---\n"),
    ).toBe("2.0.1");
  });

  it("drops the quotes around it", () => {
    expect(declaredRelease('---\nname: x\nversion: "3"\n---\n')).toBe("3");
  });

  it("is null when the skill declares none", () => {
    expect(declaredRelease("---\nname: x\n---\nbody")).toBeNull();
  });

  it("refuses a value that is not a release", () => {
    expect(
      declaredRelease("---\nversion: see the changelog\n---\n"),
    ).toBeNull();
  });
});
