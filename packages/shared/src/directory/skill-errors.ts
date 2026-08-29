/** Every code a skill server action can return, mapped 1:1 to `skill.errors`. */
export const SKILL_ERROR_CODES = [
  "FORBIDDEN",
  "BAD_STATE",
  "NOT_FOUND",
  "SELF_APPROVE",
  "DUPLICATE_NAME",
  "INVALID_NAME",
  "INVALID_DESCRIPTION",
  "INVALID_MESSAGE",
  "EMPTY_CONTENT",
  "EMPTY_COMMENT",
  "NO_APPROVED",
  "NO_CHANGE",
  "NO_ORG",
  "INVALID_REF",
  "UPSTREAM_NOT_FOUND",
  "UPSTREAM_UNAVAILABLE",
  "ALREADY_IMPORTED",
  "NOT_IMPORTABLE",
  "CONFLICT",
  "UNEXPECTED",
] as const;

export type SkillErrorCode = (typeof SKILL_ERROR_CODES)[number];

/** Anything unknown reads as UNEXPECTED, so a stale URL never breaks a page. */
export function toSkillErrorCode(code: string | undefined): SkillErrorCode {
  return SKILL_ERROR_CODES.find((known) => known === code) ?? "UNEXPECTED";
}
