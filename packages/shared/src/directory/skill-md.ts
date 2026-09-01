import type { SkillFile } from "../cli/schemas";

export interface FrontmatterEntry {
  readonly key: string;
  readonly value: string;
}

export interface ParsedSkill {
  readonly frontmatter: readonly FrontmatterEntry[];
  readonly body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;
// `|` keeps line breaks, `>` folds them; the chomping indicator is ignored.
const BLOCK_SCALAR = /^([|>])[+-]?$/;

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Splits the `---` block a SKILL.md opens with. Flat `key: value` lines, plus
 * a block scalar value (`description: |`) gathered from the indented lines
 * that follow; anything else is left in the body.
 */
export function parseSkillMd(source: string): ParsedSkill {
  const match = FRONTMATTER.exec(source);
  if (match === null) return { frontmatter: [], body: source };

  const frontmatter: FrontmatterEntry[] = [];
  const lines = (match[1] ?? "").split("\n");
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const block = BLOCK_SCALAR.exec(value);
    if (block !== null) {
      const indent = indentOf(line);
      const collected: string[] = [];
      while (at + 1 < lines.length) {
        const next = lines[at + 1] ?? "";
        if (next.trim() !== "" && indentOf(next) <= indent) break;
        collected.push(next);
        at += 1;
      }
      const filled = collected.filter((entry) => entry.trim() !== "");
      const common = Math.min(...filled.map(indentOf));
      const stripped = filled.map((entry) => entry.slice(common).trimEnd());
      value = stripped.join(block[1] === "|" ? "\n" : " ").trim();
    }
    frontmatter.push({ key, value });
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

// An em dash, or an en dash used as one, becomes a comma: the site's copy
// rule, applied to upstream text the same way.
const DASH = /\s*—\s*|\s+–\s+/g;

/** First sentence, capped at 200 characters, dashes turned into commas. */
export function summarize(text: string): string {
  const sentence = (FIRST_SENTENCE.exec(text)?.[0] ?? text).replace(DASH, ", ");
  return sentence.length > DESCRIPTION_MAX
    ? `${sentence.slice(0, DESCRIPTION_MAX - 1).trimEnd()}\u2026`
    : sentence;
}

// A release the maintainer would recognize: "2.0.1", "v3", "2026.02". Anything
// longer or stranger is prose we refuse to print as a version.
const RELEASE = /^v?\d[\w.+-]{0,23}$/;

/**
 * The release a skill declares for itself, top-level `version:` or the
 * `metadata.version` skills.sh writes. Null when it declares none: the
 * directory's own vN counter says nothing about an upstream skill's release.
 */
export function declaredRelease(source: string): string | null {
  const entry = parseSkillMd(source).frontmatter.find(
    (item) => item.key === "version",
  );
  const value = (entry?.value ?? "").replace(QUOTED, "$2").trim();
  return RELEASE.test(value) ? value : null;
}

/** The release a skill folder declares, read from its SKILL.md. */
export function releaseOf(files: readonly SkillFile[]): string | null {
  const skillMd = files.find((file) => file.path === "SKILL.md");
  return skillMd === undefined ? null : declaredRelease(skillMd.content);
}
