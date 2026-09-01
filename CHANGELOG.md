# Changelog

All notable changes to the `hubskillz` CLI. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [1.0.0] - 2026-09-01

### Changed

- `sync` is an upload, like a git push: it sends the skills as they sit on disk, prints their state and writes no local file. Your repos are the source of truth and the directory is the picture of them. The install/update/remove plan is gone, and with it the `--adopt`, `--dry-run` and `--force` flags of `sync`. Changing what a repo holds stays explicit: `hubskillz move` carries a skill between roots, `hubskillz upgrade` updates skills.sh skills, deleting the folder removes the skill.
- `sync` adds the skills the directory does not know yet on its own, so what runs on the machine appears on the site as is. In a team org that step stays maintainer only; other roles get a notice and the sync continues.
- Server side, a solo account's skill now lives only where it is installed. A skill adopted from one repo stops reading as missing on every other machine and repo, which used to make `sync` copy the union of all repos everywhere.

## [0.4.0] - 2026-09-01

### Added

- `hubskillz upgrade [SKILL...]`: brings every skill installed by `npx skills add` up to its latest upstream. hubskillz fetches nothing, it reads each skills.sh lock and runs `npx skills update` in each root so that lock stays correct; what it adds is the list of roots, `skills update` covering one scope per run and knowing only the current directory. It looks a named skill up in every root. It installs upstream head whatever version the directory pinned, the writer conflict of docs/UPSTREAM.md made explicit and user-invoked.
- `hubskillz doctor`: reads every local skills root and reports what no agent loads, and what loads twice. A folder with no `SKILL.md`, an empty folder and a dead symlink read as errors; a `SKILL.md` with no `name` or `description`, a project copy that duplicates or shadows `~/.claude/skills`, the same skill in several repos and a registered repo that lost its `.claude/skills` read as warnings. It never calls the server, so it runs before the first login.
- `hubskillz move <skill> <global|DIR>`: moves one skill folder between the machine root and a repo. The source is found in the current project then the global root, `--from` picks it when the name exists twice. A symlinked folder moves as a link. When the destination already holds the very same files, `move` removes the spare copy instead; a destination holding something different needs `--force`.
- `hubskillz publish <skill>` and `hubskillz unpublish <skill>`: list an approved skill on your public page at `hubskillz.com/@handle`, or take it off. New route `POST /api/cli/publish`, which addresses the skill by name (docs/CLI-API.md).
- `status` ends each surface with the count of skills to install or update and the command to run.
- `status` and `sync` print the web address where an upstream update waits for review.

### Changed

- A project surface inherits the machine's global root: Claude Code loads `~/.claude/skills` in every project, so a skill installed there reports `inherited` on a project instead of `missing`, and `sync` installs no copy into the repo. An unmodified or late copy already in the project is a redundant shadow: `sync` removes it after showing the plan, and never touches a customized copy. The CLI declares each surface's scope (`global` or `project`) with the inventory.

## [0.3.1] - 2026-08-30

### Fixed

- Large inventories (hundreds of skills, or private skills with big snapshots) are posted in chunks under the API body limit instead of failing with HTTP 413.
- `sync` prints a line while the directory adopts the skills found on disk, instead of staying silent.

## [0.3.0] - 2026-08-29

### Changed

- Default server is `https://api.hubskillz.com`. Installs that logged in earlier keep `https://hubskillz.com` in their config file and still work; `hubskillz login --base-url https://api.hubskillz.com` switches them.

## [0.2.2] - 2026-08-29

### Fixed

- Non-JSON responses (proxy 502/504 HTML pages) now report `HTTP` with the status and a retry hint instead of `Unexpected token '<'`.
- HTTP 413 explains that the inventory is too large and how to reduce it (fewer skills or roots, or project roots).

## [0.2.1] - 2026-08-28

### Changed

- Package metadata points to the public repository, https://github.com/JejeDurden2/hubskillz-cli.
- Published from GitHub Actions through npm Trusted Publishing, with provenance.

## [0.2.0] - 2026-08-28

### Added

- `hubskillz help [command]` and `<command> --help` with every flag described.
- Quickstart shown by the bare `hubskillz`, after `login` and after `status`, until the first `sync` completes.
- `HUBSKILLZ_TOKEN` environment variable for CI and containers, no config file needed.
- `login --token TOKEN` to skip the prompt.
- `hubskillz logout`.

### Changed

- Unknown flags and commands now exit with a usage hint instead of a raw parser error.
- A corrupt config file reports `BAD_CONFIG` instead of crashing.

## [0.1.0] - 2026-08-20

### Added

- `login`, `status`, `sync`, `push`, `projects`.
