# Upstream skills (skills.sh) and private skills

The heart of the product. Two kinds of skills, one directory, one approval flow.

- **Upstream skill.** Comes from skills.sh (`owner/repo/skill`). The org does not author it. It pins a version, watches for updates, reads partner security audits, and decides when to move. Most skills are this kind. On a dev laptop today: 58 of 59 skills in `~/.claude/skills` are symlinks to `~/.agents/skills` written by `npx skills add`.
- **Private skill.** Authored inside the org. Propose, review, approve, share across teams. Never leaves the org.
- **Fork.** An upstream skill with local edits. Keeps its upstream link so updates can be merged instead of lost.

Everything below extends the existing model (`docs/PLAN.md`, `docs/CLI-API.md`). No second pipeline: an upstream update is a draft version that goes through the same review and approval as a private edit.

## Facts about skills.sh (verified 2026-08-26)

- CLI `npx skills add <owner/repo> [--skill name]`. Canonical copy in `~/.agents/skills/<name>` (global) or `.agents/skills/<name>` (project); each agent dir (`~/.claude/skills/<name>`) is a symlink to it. `--copy` writes a real directory instead.
- Global lock `~/.agents/.skill-lock.json` (v3): per skill `source` (`owner/repo`), `sourceType` (`github` | `git` | `local` | `node_modules`), `sourceUrl`, `skillPath` (`skills/x/SKILL.md`), `skillFolderHash` (GitHub tree SHA), `installedAt`, `updatedAt`.
- Project lock `<repo>/skills-lock.json` (v1): `source`, `sourceType`, `sourceUrl?`, `ref?`, `skillPath?`, `computedHash` (sha256 over file contents). Timestamp free, meant to be committed.
- `npx skills update` refetches from upstream and overwrites. It does not know about our pins. See "Writer conflict".
- API `https://skills.sh/api/v1`:
  - `GET /skills/:source/:skill` -> id, source, slug, installs, content hash, files with content. **Requires a Vercel OIDC token** (no skills.sh account exists: the project enables Settings > OIDC Federation and Vercel mints `VERCEL_OIDC_TOKEN` per request). So search runs in `apps/web` on Vercel (`src/server/skills-sh.ts`), never in `apps/api`; content comes from GitHub; 600 req/min.
  - `GET /skills/search?q=&owner=` -> same auth.
  - `GET /skills/audit/:source/:skill` -> **public**. `audits[{ provider: "Gen Agent Trust Hub" | "Socket" | "Snyk", status: "pass" | "warn" | "fail", riskLevel?, summary, auditedAt, categories? }]`. 404 when never audited. Per skill, dated, not per commit.
- Content is also fetchable from GitHub directly: `GET repos/:owner/:repo/git/trees/:sha?recursive=1` then raw files at a commit. This is the version-precise path and the one that survives skills.sh being down or changing its API. skills.sh API is the discovery path (search, installs, audits), GitHub is the content path.
- Snyk audit of 3,984 skills (Feb 2026): 13.4% with at least one critical issue, 36.8% with at least one flaw.

## Product rules (must not bend)

1. **Provenance is never lost.** A skill that entered through skills.sh keeps `origin`, `upstreamSource`, `upstreamSkillPath` for life, including after a fork.
2. **A pinned version is a real version.** The org approves upstream commit X. Surfaces run X until the org approves Y. skills.sh publishing Y changes nothing on any laptop until a human approves it.
3. **Updates are proposals.** An upstream change creates a draft version with the upstream diff attached. It is reviewed like any other draft. An org may opt into auto-propose (draft becomes proposed without a human) but never auto-approve.
4. **Security is displayed, then enforced by policy, never computed by us.** We show partner audits verbatim (provider, status, risk, date). Org policy decides what a `fail` or `warn` blocks. We do not write a scanner (rung 1: partners already do it; rung 5: consume their API).
5. **A fork is an upstream skill with a patch, not a new private skill.** Fork keeps the link, marks `kind = FORK`, and stores the upstream base it diverged from so the next upstream update can be 3-way merged.
6. **Private skills never call out.** No upstream fetch, no audit fetch, no telemetry for `origin = INTERNAL`.
7. **hubskillz is the only writer on a managed surface.** Documented, enforced by drift detection, not by locking files.

## Data model changes

```prisma
enum SkillOrigin { INTERNAL  SKILLS_SH }
enum VersionKind { INTERNAL  UPSTREAM  FORK }
enum AuditStatus { PASS  WARN  FAIL }
enum AuditPolicy { OFF  WARN  BLOCK_FAIL  BLOCK_WARN }

model Skill {
  // existing fields...
  origin            SkillOrigin @default(INTERNAL)
  upstreamSource    String?     // "owner/repo"
  upstreamSkillPath String?     // "skills/find-skills/SKILL.md" (dir = dirname)
  upstreamSlug      String?     // skills.sh slug, for API + links
  // Latest upstream commit observed by the watcher, whatever the org approved.
  upstreamHeadCommit    String?
  upstreamHeadHash      String?   // our contentHash of files at that commit
  upstreamCheckedAt     DateTime?
  audits  AuditSnapshot[]

  @@unique([orgId, upstreamSource, upstreamSkillPath])
}

model SkillVersion {
  // existing fields...
  kind             VersionKind @default(INTERNAL)
  // UPSTREAM and FORK: the upstream commit the content comes from / was forked from.
  upstreamCommit   String?
  // UPSTREAM: equals contentHash. FORK: contentHash of the pristine upstream at upstreamCommit.
  upstreamBaseHash String?
}

// One row per (skill, provider, auditedAt). Append only. Latest per provider is what the UI shows.
model AuditSnapshot {
  id         String      @id @default(cuid())
  skillId    String
  skill      Skill       @relation(fields: [skillId], references: [id], onDelete: Cascade)
  provider   String      // "snyk" | "socket" | "agent-trust-hub"
  status     AuditStatus
  riskLevel  String?
  summary    String
  auditedAt  DateTime
  fetchedAt  DateTime    @default(now())

  @@unique([skillId, provider, auditedAt])
  @@index([skillId, provider])
}

model Org {
  // existing...
  auditPolicy      AuditPolicy @default(WARN)
  autoProposeUpstream Boolean @default(false)
}

model Installation {
  // existing...
  // From the lock file next to the surface. Null when not installed by `npx skills`.
  upstreamSource    String?
  upstreamSkillPath String?
  upstreamHash      String?  // skillFolderHash (global) or computedHash (project)
}
```

`contentHash` stays the single hashing function (`packages/shared`). Upstream content is hashed by us after fetch; we never compare our hash to skills.sh's or GitHub's tree SHA, we store theirs only as a change signal.

## State model additions

Installation states stay the 5 in `CLI-API.md`. Two flags are added at the directory level and one at the installation level:

- `Skill.updateAvailable` (derived): `origin = SKILLS_SH && upstreamHeadHash != approvedVersion.upstreamBaseHash`. Shown on the skill row, the team view, and the org directory header ("N skills have an upstream update").
- `Skill.auditState` (derived): worst status across latest snapshot per provider; `none` when never audited. Shown as a glyph next to the name, same column style as drift.
- `InventoryItem.importable` (derived, CLI + personal view): `state = unmanaged && installation.upstreamSource != null`. Personal view offers "Add to directory" in one click, pre-filled from the lock.

`computeState` is unchanged. A `unmanaged` upstream skill is still unmanaged: the org has not decided anything about it yet.

## Flows

### A. Import from skills.sh (browser)

1. Directory > "Add skill" gets two tabs: "From skills.sh" and "Write your own" (current form).
2. From skills.sh: search box calls our server action which calls `GET /skills/search` with the OIDC token. Result row: `owner/repo/skill`, installs, audit glyphs (from the public audit endpoint, cached 1h).
3. Pick one -> server fetches the GitHub default-branch head commit for `owner/repo`, the tree under `dirname(skillPath)`, then raw files. Creates `Skill{origin: SKILLS_SH, upstream*}` and `SkillVersion{kind: UPSTREAM, number 1, upstreamCommit, upstreamBaseHash = contentHash, state: PROPOSED}`. Stores the audit snapshots.
4. Review page shows files, audit panel, and the same approve button. Approval = pin.

Also reachable from the personal view on any `importable` row (step 3 straight away, source and path taken from the lock).

### B. Watcher (scheduled job)

BullMQ job scheduler in `apps/api` (`upstream.module.ts`, `0 6 * * *` UTC, registered only when `WORKER=1`), one run per org (later: per source repo dedup across orgs).

1. Group `SKILLS_SH` skills by `upstreamSource`. One GitHub call per repo: `GET repos/:o/:r/commits?path=<skill dir>&per_page=1` gives the head commit touching that dir. Compare to `upstreamHeadCommit`.
2. Changed: fetch files at that commit, compute hash, set `upstreamHead*`. If hash differs from `approvedVersion.upstreamBaseHash` (a commit that did not change content, e.g. a README two dirs up, is ignored):
   - Create `SkillVersion{kind: UPSTREAM, state: DRAFT | PROPOSED per org.autoProposeUpstream, upstreamCommit, message: "upstream <short sha>: <commit title>"}`. For a `FORK` approved version, see C.
   - Notify maintainers (in-app first; email when the waitlist provider question is settled).
3. Every run, also `GET /skills/audit/:source/:slug` for each skill. Insert new snapshots (unique on `auditedAt`). If the worst status got worse, notify maintainers; if policy is `BLOCK_*` and the approved version is now blocked, mark it on the skill and stop serving it in `/api/cli/approved` (returns the item with `blocked: true` and no files; the CLI prints why).

GitHub rate limit: 5,000/h with a token, plenty. Use `GITHUB_TOKEN` env (a fine-grained token, public repos only, no scopes).

### C. Update a fork (3-way merge)

Approved version is `FORK` at upstream base B with local content L. Watcher finds upstream U.

1. Draft version created with `kind: FORK`, `upstreamCommit: U`, `upstreamBaseHash: hash(U)`, files = **U verbatim**, plus a review note listing the files where L differs from B ("your patch touches SKILL.md, references/x.md").
2. Review page shows three diffs: B -> U (what upstream changed), B -> L (what we changed), and an editor pre-filled with U. First iteration: the reviewer re-applies the patch by hand in the editor. Second iteration (only when someone asks): a "Merge with Claude" button that sends B, L, U and returns a proposed merge, opened in the editor, never auto-saved. Model call lives in one server action, prompt in one constant.
3. Approve -> new approved version is `FORK` at base U.

Same screen serves the case "we decide to drop our patch": approve U as-is, kind flips to `UPSTREAM`.

### D. Edit an upstream skill in the browser

Editing an `UPSTREAM` approved version creates a draft `FORK` at the same `upstreamCommit`, `upstreamBaseHash = approved.contentHash`. The skill page shows "forked from `owner/repo/skill` @ short sha, N files patched".

### E. CLI

`scan` reads, when present, `~/.agents/.skill-lock.json` for the global surface and `<project>/skills-lock.json` for a project surface. For each skill dir, if it is a symlink resolve it and match the basename against the lock. Inventory item gains optional `upstream: { source, skillPath, hash }`. Server writes it to `Installation`.

`apply` for a skill whose installed dir is a symlink into `~/.agents/skills`: write into the **symlink target** (canonical copy), keep the symlink. Every agent on the machine gets the approved version, which is the point of the canonical copy. Do not touch `.skill-lock.json`: `npx skills update` will detect a hash mismatch and treat it as "modified locally", which is true.

`hubskillz sync` prints, after apply, one line per skill whose upstream head is newer than the approved pin: `find-skills: upstream 3 commits ahead, not approved yet`. Read only, no action from the CLI.

`hubskillz upgrade [SKILL...]` is the one CLI path that installs upstream head. It fetches nothing and writes nothing itself: it reads each skills.sh lock to know what is installed, then spawns `npx skills update` in each root, which owns those files and keeps its own lock correct. hubskillz contributes the root list, because `skills update` covers one scope per run and knows only the current directory, while hubskillz knows the global root and every registered project. It looks a named skill up in every root. See "Writer conflict": this is that conflict made explicit and user-invoked.

### Writer conflict

`npx skills update` overwrites the canonical copy with upstream head, bypassing the pin. This is a drift and the next `hubskillz sync` reports `drifted` (if the new content matches a known version) or `customized`. Sync-all restores the pin. Documented on the skill page and in the CLI README. No file locks, no hooks: detection plus one click is enough until a team complains.

`hubskillz upgrade` triggers this on purpose, because a person asked for upstream head. Rule 2 holds all the same: the pin is untouched, the org still decides, and the laptop is simply out of sync until `hubskillz sync` runs. The command says so on every run. Rule 7 (hubskillz is the only writer on a managed surface) is the one that bends: the write is delegated to the tool that owns the lock, which is the only way to leave `~/.agents/.skill-lock.json` honest, since `skillFolderHash` is a GitHub tree SHA and the project lock's `computedHash` is skills.sh's own digest, neither of which we can recompute from `contentHash`.

## UI

- Skill row (directory, team, personal): origin glyph (`skills.sh` mono tag or `private`), audit glyph (pass / warn / fail / none), update dot when `updateAvailable`.
- Skill page header: `owner/repo/skill @ abc1234`, link to skills.sh and to GitHub at that commit, installs count, audit panel (three provider rows, status, risk, date, summary, "last checked at"). Fork: "patched, N files, base abc1234".
- Directory header: "N skills have an upstream update" with "Review all" filter. "N skills failed an audit" in signal orange when policy is `BLOCK_*`.
- Org settings: audit policy (4 radio), auto-propose upstream updates (toggle), GitHub token status.
- Review page for an upstream version: diff against approved, audit panel, commit message and link. For a fork: three-way layout from C.
- Personal view: `importable` rows show "Add to directory" for maintainers, "Ask a maintainer" for members.

All strings in `messages/{fr,en}.json`. FR written natively.

## Landing and positioning

Current landing sells "one directory, every surface in sync". Add the upstream story above the mechanism section, one block:

- Headline territory (EN): "Most of your skills come from skills.sh. Decide when they change." (FR, native, to be written, no translation.)
- Three facts, mono: pinned version per skill; upstream update = a reviewed diff, never a surprise; Snyk, Socket and Gen audits on every row, with a policy that can block a failed skill.
- Private skills block right after: "The ones you wrote stay inside. Same review, same sync."

The problem matrix (`drift-matrix.tsx`) gains one column state: an upstream update nobody approved. Pricing copy unchanged.

## Phases (replaces "Phase 3" in PLAN.md)

Phase 2 as built stays. The following is inserted before billing.

**2b. Provenance.** Schema fields on Skill, SkillVersion, Installation. CLI reads both lock files and reports `upstream`. Personal view shows origin on every row and `importable`. Import from skills.sh (flow A) with GitHub content fetch and audit snapshot. Skill page header with provenance and audit panel. Tests: lock parsing (both formats, missing, corrupted), import creates UPSTREAM version with correct hashes, audit snapshot upsert.
Exit: on the author's laptop, `hubskillz sync` lists 58 importable skills, one click each turns them into pinned directory entries with audits visible.

**2c. Watcher and policy.** Cron, GitHub head detection, draft creation, audit refresh, notifications (in-app), org policy enum, `/api/cli/approved` honours `BLOCK_*`. Tests: watcher creates exactly one draft per content change and none for no-op commits; policy blocks; hash comparisons use `contentHash` only.
Exit: bump a skill upstream in a test repo, next cron run yields a proposed version with the right diff.

**2d. Forks.** Edit-creates-fork, three-diff review, manual re-apply. Model-assisted merge only on demand. Tests: fork base tracking, kind transitions (UPSTREAM -> FORK -> UPSTREAM).

**2e. Copy.** Landing block, matrix column, FR/EN strings, skill page copy.

Then Phase 4 billing as planned. Phase 5 (GitHub repo surface) reuses `skills-lock.json` reading from 2b unchanged.

## Cut on purpose

- Our own scanner. Partners cover it; add a local heuristic only when a customer asks for offline scanning.
- Generic git / npm / local sources (`sourceType != github`). Lock rows with other types are reported as unmanaged with origin shown as text. Add when one shows up in a real org.
- Per-commit audits. skills.sh does not expose them; we show the audit date next to the pinned commit date and let the reviewer judge.
- Pushing forks back upstream (open a PR on the source repo). Nice, later.
- Multiple upstream registries. `origin` is an enum so a second one is a value, not a refactor.

## Open questions

- Notification channel for maintainers before email exists: in-app inbox in the app header, or nothing until Resend is chosen.
- Should `auditPolicy` default to `WARN` or `BLOCK_FAIL` for new orgs. Leaning `BLOCK_FAIL`: a paid team product that lets a `fail` through by default undercuts the pitch.
- Import for members (non-maintainers): request-to-add flow or just a message to the maintainer.
