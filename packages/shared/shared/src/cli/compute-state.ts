import type { SkillState } from "./schemas";

export interface SkillVersionRef {
  readonly id: string;
  readonly number: number;
  readonly contentHash: string;
}

export interface ComputeStateInput {
  /** Hash of what sits on disk, null when the skill is not installed. */
  readonly installedHash: string | null;
  /** Every version of the directory skill with this name; empty = not in the directory. */
  readonly versions: readonly SkillVersionRef[];
  /** Id of the version currently approved, null when none is. */
  readonly approvedVersionId: string | null;
  /** True when a team of the user requires or recommends this skill. */
  readonly requiredOrRecommended: boolean;
}

/**
 * State rules from docs/CLI-API.md. Returns null when there is nothing to
 * report: the skill is neither installed nor wanted by any of the user's teams.
 */
export function computeState(input: ComputeStateInput): SkillState | null {
  const { installedHash, versions, approvedVersionId } = input;

  if (versions.length === 0) {
    return installedHash === null ? null : "unmanaged";
  }
  if (installedHash === null) {
    return input.requiredOrRecommended ? "missing" : null;
  }

  const approved = versions.find((version) => version.id === approvedVersionId);
  if (approved !== undefined && approved.contentHash === installedHash) {
    return "synced";
  }
  const known = versions.some(
    (version) => version.contentHash === installedHash,
  );
  return known ? "drifted" : "customized";
}
