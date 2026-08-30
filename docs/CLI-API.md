# CLI <-> web contract (v1)

Auth: `Authorization: Bearer <device token>`. Tokens are created in the web app (`/app/settings/tokens`), stored by the CLI in `~/.hubskillz/config.json` (`{ "baseUrl", "token", "machineId" }`). Routes are NestJS controllers in `apps/api/src/modules/{delivery,directory}/presentation/` (`@Controller("api/cli")`), reached from the web origin through the Next rewrite `/api/:path*` -> `API_URL` (`apps/web/next.config.ts`). Zod schemas for every payload live in `packages/shared/src/cli/*` and are imported by both sides.

Content hash: sha256 over files sorted by path, each contributing `path + "\0" + content + "\0"`. Same function in `packages/shared` used by web and CLI.

## GET /api/cli/me
-> `{ user: {id, email, name}, org: {id, name, slug}, surfaces: [{id, kind, label}] }`

## POST /api/cli/inventory
Body: `{ surface: { kind: "claude-code-local", label: string, machineId: string, path: string }, skills: [{ name, contentHash, files: [{ path, hash, size }], upstream?: { source, skillPath, hash } }] }`
Upserts the surface (by user + machineId + path), replaces its installations, computes state per skill. `upstream` comes from the skills.sh lock file (`docs/UPSTREAM.md`). Max 500 skills, 100 files per skill.

What is stored per installation: skill name, content hash, per-file hashes, the upstream reference when there is one, and, for private skills only, a full content snapshot (`Installation.files`, since migration `20260826220009_installation_snapshot`). The CLI sends `content` on every file of a skill that has no upstream and whose files total at most `MAX_SNAPSHOT_CHARS` (200,000 chars). The server keeps the snapshot only when every file of the skill came with content (`snapshotOf()` in `apps/api/src/modules/delivery/application/cli.ts`), otherwise it stores hashes alone. The snapshot exists so `/api/cli/adopt` and the "Add to directory" action can turn a private skill into a directory version without a separate upload. Upstream skills are re-fetched from skills.sh, so their content is never sent or stored by this route. Each new inventory replaces the previous one, snapshot included.
-> `{ surfaceId, items: [{ name, state: "synced"|"drifted"|"customized"|"missing"|"unmanaged", installedHash?, approvedVersionId?, approvedVersion?, required: boolean, importable: boolean, upstreamAhead?: boolean }] }`
`importable` = unmanaged and installed from skills.sh. `upstreamAhead` = directory skill whose upstream head is newer than the approved pin.

State rules (single function in packages/shared, unit tested):
- skill in directory with approved version A, installed hash == A.hash -> synced
- installed hash == an older approved version of the same skill -> drifted
- installed hash matches no version -> customized
- not installed but a team of the user requires or recommends it -> missing
- installed, name not in directory -> unmanaged

## GET /api/cli/approved?surfaceId=...
Approved version content for every skill the user's teams require or recommend, plus every approved skill installed by name on the surface (an adopted skill has no team row).
-> `{ skills: [{ name, versionId, version: number, contentHash, blocked: boolean, blockedReason?, files: [{ path, content }] }] }`
`blocked` is true when the org audit policy refuses the approved version: `files` is empty and the CLI prints `blockedReason`.
`name` is kebab-case (`skillNameSchema`), same as on the way in: the CLI joins it onto a filesystem path, so it validates the response instead of trusting it.

## POST /api/cli/adopt
Body: `{ surfaceId }`
First sync of an account: every importable installation of the surface becomes a directory skill with its first version approved (upstream at HEAD, private from the snapshot). Names already in the directory are left alone. Maintainer only (403 otherwise).
-> `{ adopted: [name], skipped: [{ name, code }] }`

## POST /api/cli/drafts
Body: `{ name, files: [{ path, content }], message?: string }`
Creates the skill if missing (state draft) and a new draft version. -> `{ skillId, versionId }`
`name` is kebab-case, 2 to 60 chars (`skillNameSchema`). 1 to 100 files, each content max 200,000 chars, `message` max 500 chars.

## GET /api/cli/pending?surfaceId=...
Sync requests queued from the browser for this surface, not applied yet.
-> `{ requests: [{ id, skillName | null }] }` (null = all)

## POST /api/cli/pending/:id/applied
Marks a request applied. -> `{ ok: true }`

## Decisions fixed by the CLI implementation (server must match)

- `computeState` lives in `@hubskillz/shared` and returns `SkillState | null`; null = emit no item (not installed, no team wants it).
- `drifted` = installed hash matches any known version other than the approved one, whatever its state. `synced` compares content hashes, not ids.
- Skill absent from the directory but installed -> `unmanaged`.
- Every `/api/cli/*` error returns `{ code, message }` (`DomainError.toJSON()`), `apiErrorSchema` in shared.
- Surface `path` is the absolute skills root (`.../.claude/skills`). Label: `hostname()` global, `hostname():<project dir basename>` for a project root.
- `me.user.name` is a string, `""` when unset. `inventoryItem.approvedVersion` is the integer number.
- File paths are POSIX-relative to the skill dir (`skillFilePathSchema`: no leading `/`, no `..` segment, no backslash, no NUL, max 200 chars). Query params are real query strings.
