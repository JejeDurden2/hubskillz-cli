// The web <-> api wire contract: the shapes the api's controllers respond
// with and the web's server client renders. One declaration for both sides,
// so a field or enum drift is a compile error instead of a blank page.
// Prisma enum values are string unions, so the api assigns its rows straight
// into these types; a member added in schema.prisma breaks the build here.
import type { SkillFile, SkillState } from "../cli/schemas";
import type {
  DirectorySkillState,
  VersionState,
} from "../directory/skill-state";
import type { Page } from "../pagination";

// Mirrors of the db enums the wire carries.
export type SkillLevel = "REQUIRED" | "RECOMMENDED";
export type SkillOrigin = "INTERNAL" | "SKILLS_SH";
export type VersionKind = "INTERNAL" | "UPSTREAM" | "FORK";
export type AuditStatus = "PASS" | "WARN" | "FAIL";
export type SurfaceCapability = "READ_WRITE" | "WRITE_ONLY" | "MANUAL";

// Directory ------------------------------------------------------------------

export interface DirectoryTeam {
  readonly id: string;
  readonly name: string;
  readonly level: SkillLevel;
}

export interface DirectoryRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: DirectorySkillState;
  readonly approvedNumber: number | null;
  /** Surfaces in the org that hold this skill at the approved hash. */
  readonly surfacesOnApproved: number;
  /** Surfaces in the org that hold this skill at all. */
  readonly surfacesInstalled: number;
  readonly origin: SkillOrigin;
  /** Worst latest partner audit, null when never audited. */
  readonly audit: AuditStatus | null;
  readonly updateAvailable: boolean;
  /** On the public page of the org. Null while private. */
  readonly publishedAt: Date | null;
}

export interface SkillVersionRow {
  readonly id: string;
  readonly number: number;
  readonly state: VersionState;
  readonly message: string;
  readonly contentHash: string;
  readonly createdAt: Date;
  readonly authorId: string | null;
  readonly authorName: string | null;
  readonly kind: VersionKind;
  readonly upstreamCommit: string | null;
}

export interface AuditRowView {
  readonly provider: string;
  readonly status: AuditStatus;
  readonly riskLevel: string | null;
  readonly summary: string;
  readonly auditedAt: Date;
}

/** Provenance of a SKILLS_SH skill; null for a private one. */
export interface UpstreamInfo {
  readonly source: string;
  readonly skillPath: string;
  readonly slug: string;
  readonly headCommit: string | null;
  readonly checkedAt: Date | null;
  readonly updateAvailable: boolean;
  /** Latest snapshot per provider. Empty when never audited. */
  readonly audits: readonly AuditRowView[];
}

export interface SkillDetail {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly state: DirectorySkillState;
  readonly approvedVersionId: string | null;
  readonly approvedNumber: number | null;
  readonly publishedAt: Date | null;
  readonly versions: readonly SkillVersionRow[];
  readonly teams: readonly DirectoryTeam[];
  readonly origin: SkillOrigin;
  readonly upstream: UpstreamInfo | null;
}

export interface SurfaceRow {
  readonly id: string;
  readonly label: string;
  readonly ownerName: string;
  readonly state: SkillState | null;
  readonly installedNumber: number | null;
  readonly observedAt: Date | null;
}

export interface CommentRow {
  readonly id: string;
  readonly body: string;
  readonly authorName: string | null;
  readonly createdAt: Date;
}

export interface TeamSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly members: number;
  readonly required: number;
  readonly recommended: number;
  readonly joined: boolean;
}

// Public pages ---------------------------------------------------------------

/** Who lists a skill on their public page. */
export interface Recommender {
  readonly handle: string;
  readonly name: string;
}

/** A shared skill as the public page reads it: approved version only. */
export interface PublicSkill {
  readonly orgSlug: string;
  readonly orgName: string;
  readonly name: string;
  readonly description: string;
  readonly versionNumber: number;
  /** approvedVersion.approvedAt ?? publishedAt, never null on a public skill. */
  readonly approvedAt: Date;
  readonly publishedAt: Date;
  /** Approved version only, orderBy path asc. */
  readonly files: readonly SkillFile[];
  /** Ordered handle asc. */
  readonly recommendedBy: readonly Recommender[];
}

/** One entry of GET /api/public/profiles/:handle; the ZIP holds the files. */
export interface PublicProfileSkill {
  readonly orgSlug: string;
  readonly name: string;
  readonly description: string;
  readonly versionNumber: number;
  readonly approvedAt: Date;
  readonly fileCount: number;
  readonly origin: SkillOrigin;
  /** "owner/repo" for a skills.sh import. */
  readonly upstreamSource: string | null;
}

/** Every public skill a user picked: the page shared under /@handle. */
export interface PublicProfile {
  readonly handle: string;
  readonly name: string;
  readonly image: string | null;
  readonly title: string | null;
  readonly xHandle: string | null;
  readonly linkedinHandle: string | null;
  /** Newest approvedAt across the skills. */
  readonly updatedAt: Date;
  /** Ordered name asc. Never empty: a user with nothing public reads as null. */
  readonly skills: readonly PublicProfileSkill[];
}

/** One row of the people index. */
export interface ProfileCard {
  readonly handle: string;
  readonly name: string;
  readonly image: string | null;
  readonly title: string | null;
  readonly skillCount: number;
  readonly updatedAt: Date;
  /** First 6, name asc. */
  readonly skillNames: readonly string[];
}

/** GET /api/public/profiles/refs, for the sitemap. */
export interface PublicProfileRef {
  readonly handle: string;
  readonly updatedAt: Date;
}

export interface PublicSkillRef {
  readonly orgSlug: string;
  readonly name: string;
  /** Same fallback as approvedAt. */
  readonly updatedAt: Date;
}

// Drift ----------------------------------------------------------------------

/** An inventory item plus the directory id the browser needs to queue a sync. */
export interface DriftItem {
  readonly name: string;
  readonly skillId: string | null;
  readonly state: SkillState;
  readonly installedHash: string | null;
  readonly approvedVersionId: string | null;
  readonly approvedVersion: number | null;
  readonly required: boolean;
  /** Unmanaged with an upstream or a snapshot: one click adds it to the directory. */
  readonly importable: boolean;
  /** Directory skill whose upstream head is newer than the approved pin. */
  readonly upstreamAhead: boolean;
  readonly upstreamSource: string | null;
  readonly upstreamSkillPath: string | null;
}

export interface StateCounts {
  readonly synced: number;
  readonly drifted: number;
  readonly customized: number;
  readonly missing: number;
  readonly unmanaged: number;
}

export interface SurfaceDrift {
  readonly id: string;
  readonly label: string;
  /** Same members as the db SurfaceKind enum. */
  readonly kind: "CLAUDE_CODE_LOCAL" | "CLAUDE_AI";
  readonly path: string;
  readonly capability: SurfaceCapability;
  readonly lastSeenAt: Date;
  readonly pending: number;
  readonly items: readonly DriftItem[];
  readonly counts: StateCounts;
}

/** One skill across every surface of the user, for the personal matrix. */
export interface CrossRow {
  readonly name: string;
  readonly skillId: string | null;
  readonly upstreamAhead: boolean;
  readonly required: boolean;
  readonly cells: Readonly<Record<string, DriftItem | null>>;
  /** Two surfaces hold the same skill with different content. */
  readonly differs: boolean;
}

export interface MatrixRow extends CrossRow {
  /** False once the row is synced on every surface that holds it. */
  readonly attention: boolean;
}

/** Three numbers for the top of the drift board. */
export interface DriftStats {
  /** Surfaces holding a drifted skill or missing a required one. */
  readonly staleSurfaces: number;
  readonly missingRequired: number;
  /** Distinct skills whose upstream head is newer than the approved pin. */
  readonly upstreamUpdates: number;
}

export interface DriftMatrixView {
  readonly surfaces: ReadonlyArray<Omit<SurfaceDrift, "items">>;
  readonly stats: DriftStats;
  /** Rows needing a look come first; this many of them in total. */
  readonly attention: number;
  /** Every skill whose content differs between surfaces, across all pages. */
  readonly differing: readonly string[];
  readonly rows: Page<MatrixRow>;
}

export interface ClaudeSpaceRow {
  readonly skillId: string;
  readonly name: string;
  readonly level: SkillLevel;
  readonly approvedNumber: number;
  /** Version we handed over, null when this skill was never exported. */
  readonly exportedNumber: number | null;
  readonly exportedAt: Date | null;
  /** The export matches the approved version. */
  readonly upToDate: boolean;
}

export interface PersonalDriftView {
  readonly surfaces: readonly SurfaceDrift[];
  readonly claude: readonly ClaudeSpaceRow[];
}
