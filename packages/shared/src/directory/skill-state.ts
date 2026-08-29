// The review state machine, kept pure so the rules are testable without a
// database. Prisma enums are string unions, so the server passes its rows
// straight in.

export type Role = "ADMIN" | "MAINTAINER" | "MEMBER";

export type VersionState =
  "DRAFT" | "PROPOSED" | "APPROVED" | "REJECTED" | "SUPERSEDED";

export type DirectorySkillState =
  "DRAFT" | "PROPOSED" | "APPROVED" | "DEPRECATED";

export type VersionAction = "propose" | "approve" | "reject";

export interface Actor {
  readonly role: Role;
  /** True when the actor wrote the version being acted on. */
  readonly isAuthor: boolean;
}

/** Maintainers and admins run the directory. Members read and propose. */
export function canMaintain(role: Role): boolean {
  return role === "ADMIN" || role === "MAINTAINER";
}

export function canVersionAction(
  action: VersionAction,
  from: VersionState,
  actor: Actor,
): boolean {
  switch (action) {
    case "propose":
      // Any member sends a draft to review, theirs or someone else's.
      return from === "DRAFT";
    case "approve":
      // An admin may skip review and approve a draft outright.
      if (from === "DRAFT") return actor.role === "ADMIN";
      if (from !== "PROPOSED" || !canMaintain(actor.role)) return false;
      // A maintainer never approves their own version. An admin can.
      return !actor.isAuthor || actor.role === "ADMIN";
    case "reject":
      return from === "PROPOSED" && canMaintain(actor.role);
  }
}

export function versionStateAfter(action: VersionAction): VersionState {
  switch (action) {
    case "propose":
      return "PROPOSED";
    case "approve":
      return "APPROVED";
    case "reject":
      return "REJECTED";
  }
}

/**
 * Skill state after a version action, or null to leave the skill alone.
 * A skill that already has an approved version stays APPROVED while a new
 * version goes through review.
 */
export function skillStateAfter(
  action: VersionAction,
  current: DirectorySkillState,
  hasApprovedVersion: boolean,
): DirectorySkillState | null {
  switch (action) {
    case "propose":
      return hasApprovedVersion || current !== "DRAFT" ? null : "PROPOSED";
    case "approve":
      return "APPROVED";
    case "reject":
      return null;
  }
}
