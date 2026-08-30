// Derived flags from docs/UPSTREAM.md, pure so every table computes them the
// same way.

export interface UpstreamFlagsInput {
  readonly origin: "INTERNAL" | "SKILLS_SH";
  readonly upstreamHeadHash: string | null;
  /** upstreamBaseHash of the approved version, null when nothing is approved. */
  readonly approvedBaseHash: string | null;
}

/** The org pinned one upstream hash and the watcher saw another. */
export function isUpdateAvailable(input: UpstreamFlagsInput): boolean {
  return (
    input.origin === "SKILLS_SH" &&
    input.upstreamHeadHash !== null &&
    input.approvedBaseHash !== null &&
    input.upstreamHeadHash !== input.approvedBaseHash
  );
}

/** Short commit or hash, the way git prints it. */
export function shortSha(value: string): string {
  return value.slice(0, 7);
}

/** GitHub tree link at one commit, for the header and the version rows. */
export function githubTreeUrl(
  source: string,
  commit: string,
  skillPath: string,
): string {
  const dir = skillPath.split("/").slice(0, -1).join("/");
  return `https://github.com/${source}/tree/${commit}/${dir}`;
}

export function skillsShUrl(source: string, slug: string): string {
  return `https://skills.sh/${source}/${slug}`;
}

// Two clients call skills.sh: search from the web app, because skills.sh
// authenticates it by the Vercel OIDC token, and audits from the api. The
// split is deliberate; the host and the budget they share are not.
export const SKILLS_SH_API = "https://skills.sh/api/v1";

/** No skills.sh call holds a request longer than this. */
export const SKILLS_SH_TIMEOUT_MS = 10_000;

export interface ForkFields {
  readonly kind: "FORK";
  readonly upstreamCommit: string | null;
  readonly upstreamBaseHash: string | null;
}

/**
 * The upstream pin a browser edit of a skills.sh skill forks from: the
 * approved version, else the newest version that carries one.
 */
export function forkFieldsFrom(
  versions: ReadonlyArray<{
    readonly state: string;
    readonly upstreamCommit: string | null;
    readonly upstreamBaseHash: string | null;
  }>,
): ForkFields {
  const base =
    versions.find((version) => version.state === "APPROVED") ??
    versions.find((version) => version.upstreamBaseHash !== null);
  return {
    kind: "FORK",
    upstreamCommit: base?.upstreamCommit ?? null,
    upstreamBaseHash: base?.upstreamBaseHash ?? null,
  };
}
