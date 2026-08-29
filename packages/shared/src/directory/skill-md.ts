export interface FrontmatterEntry {
  readonly key: string;
  readonly value: string;
}

export interface ParsedSkill {
  readonly frontmatter: readonly FrontmatterEntry[];
  readonly body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

/**
 * Splits the `---` block a SKILL.md opens with. Flat `key: value` lines only,
 * which is all the format uses; anything else is left in the body.
 */
export function parseSkillMd(source: string): ParsedSkill {
  const match = FRONTMATTER.exec(source);
  if (match === null) return { frontmatter: [], body: source };

  const frontmatter: FrontmatterEntry[] = [];
  for (const line of (match[1] ?? "").split("\n")) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    frontmatter.push({
      key: line.slice(0, separator).trim(),
      value: line.slice(separator + 1).trim(),
    });
  }
  return {
    frontmatter,
    body: source.slice(match[0].length).replace(/^(\r?\n)+/, ""),
  };
}

const DESCRIPTION_MAX = 200;

// Strips the quotes YAML allows around a scalar (`description: "..."`).
const QUOTED = /^(["'])([\s\S]*)\1$/;

// A sentence ends at `.`, `!` or `?` followed by whitespace and a capital or
// an opening paren; "e.g. foo" and "interfaces.dev/cheat-sheet" stay intact.
const FIRST_SENTENCE = /^[\s\S]*?(?<!\be\.g|\bi\.e)[.!?](?=\s+[A-Z(]|$)/;

/**
 * The one-line summary a skill shows in the directory: the first sentence of
 * the frontmatter description, else of the first body paragraph, else the
 * skill name. Skill descriptions are trigger lists written for the model;
 * their first sentence is the part written for a human.
 */
export function describeSkillMd(source: string, name: string): string {
  const { frontmatter, body } = parseSkillMd(source);
  const declared = frontmatter.find((entry) => entry.key === "description");
  const raw =
    declared !== undefined && declared.value !== ""
      ? declared.value.replace(QUOTED, "$2")
      : body
          .split(/\r?\n\s*\r?\n/)
          .map((block) => block.replace(/\s+/g, " ").trim())
          .find((block) => block !== "" && !block.startsWith("#"));
  if (raw === undefined || raw === "") return name;
  return summarize(raw);
}

/** First sentence, capped at 200 characters. */
export function summarize(text: string): string {
  const sentence = FIRST_SENTENCE.exec(text)?.[0] ?? text;
  return sentence.length > DESCRIPTION_MAX
    ? `${sentence.slice(0, DESCRIPTION_MAX - 1).trimEnd()}\u2026`
    : sentence;
}
