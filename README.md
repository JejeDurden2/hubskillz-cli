# hubskillz

[![npm](https://img.shields.io/npm/v/hubskillz)](https://www.npmjs.com/package/hubskillz)
[![CI](https://github.com/JejeDurden2/hubskillz-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/JejeDurden2/hubskillz-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/hubskillz)](https://github.com/JejeDurden2/hubskillz-cli/blob/main/LICENSE)

Keep the Claude Code skills on your machine in sync with your organization's approved directory.

`hubskillz` inventories `~/.claude/skills` and `<repo>/.claude/skills`, reports the state of every skill against the directory, and installs the approved versions after showing you the plan. Skills you customized are never overwritten unless you ask.

## Install

```sh
npm i -g hubskillz
# or without installing
npx hubskillz help
```

Requires Node 22 or newer.

## Quickstart

```sh
hubskillz login        # paste a device token from Settings, Device tokens
hubskillz doctor       # what is broken or duplicated on this machine
hubskillz upgrade --all  # every skills.sh skill to its latest upstream
hubskillz status       # what is installed, and how it compares
hubskillz sync --all   # install the approved set, adopt what the directory lacks
```

The bare `hubskillz` command prints this quickstart, with your progress, until the first sync completes.

## Commands

```
hubskillz login    [--token TOKEN] [--base-url URL]
hubskillz logout
hubskillz status   [--path DIR] [--yes]
hubskillz sync     [--path DIR] [--all] [--adopt] [--yes] [--dry-run] [--force]
hubskillz upgrade  [SKILL...] [--path DIR] [--all] [--yes]
hubskillz doctor   [--path DIR]
hubskillz move     <skill> <global|DIR> [--from global|DIR] [--force]
hubskillz publish  <skill>
hubskillz unpublish <skill>
hubskillz push     <skill-dir> [-m MESSAGE]
hubskillz projects [add|remove [DIR] | discover [--yes] | list]
hubskillz help     [command]
hubskillz --version
```

Every command accepts `--help`.

### login

Prompts for a device token (create one in the web app at `/app/settings/tokens`), verifies it against the server and writes it to the config file. `--token` skips the prompt. When stdin is a pipe, the token is read from it.

### logout

Removes the config file, so the token and the registered projects.

### status

Scans the global root and every registered project (running `projects discover` first when none is registered), sends each inventory and prints the state of every skill: `synced`, `drifted`, `customized`, `missing` or `unmanaged`. Reads only.

What the inventory contains: for every skill, its name, content hash and per-file hashes and sizes. Skills installed from skills.sh (found in the lock file) travel as hashes only, the server fetches their content upstream. Private skills (no upstream) also ship the content of their files, up to 200,000 characters per skill, so the web app can adopt them into the directory. The server keeps that snapshot with the installation and replaces it on every new inventory.

### sync

Installs missing skills and updates drifted ones to the approved version. Shows the plan first and asks for confirmation. Skills you changed locally are left untouched unless you pass `--force`.

- `--path DIR`: project directory to act on. Default: the current directory.
- `--all`: act on the global root, the project root and every registered project. With nothing registered yet, it first scans your home directory for repos with `.claude/skills` and asks which ones to register (see `projects discover`). Default: the project root when `DIR/.claude/skills` exists, else the global root.
- `--adopt`: add every importable skill found on this surface to the directory as an approved version, without asking. Importable means installed here and absent from the directory: an upstream skill is pinned at its installed hash, a private skill is created from its snapshot. Maintainer only, other roles get a notice and keep syncing. Without the flag, an interactive run asks the same question once; `--yes` alone answers no and `--dry-run` skips it.
- `--yes`, `-y`: apply without asking.
- `--dry-run`: print the plan and stop.
- `--force`: overwrite locally customized skills.

### upgrade

Brings every skill installed by `npx skills add` up to its latest upstream.

```sh
hubskillz upgrade                # this project, else the global root
hubskillz upgrade --all          # global root and every registered project
hubskillz upgrade find-skills    # one skill, wherever it lives
```

hubskillz fetches nothing here. It reads each skills.sh lock to know what is installed, then runs `npx skills update` in each root, which keeps that lock correct. What it adds is the list of roots: `skills update` covers one scope per run and only knows the current directory, while hubskillz knows the global root and every repo you registered with `hubskillz projects`.

`upgrade` looks a named skill up in every root, so `hubskillz upgrade find-skills` works from anywhere. A name no lock lists is an error. `--yes` passes `-y` through to skills.sh.

This is the one command that walks past your approved versions: it installs upstream head, whatever version your directory pinned. `hubskillz status` then reports those skills as drifted or customized, and `hubskillz sync` puts the pinned versions back.

### doctor

Reads every local skills root and reports what no agent loads, and what loads twice. No account needed: it never calls the server.

| Level   | What it reports                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error` | A folder with no `SKILL.md`, an empty folder, a symlink whose target is gone. Nothing loads.                                                                                                          |
| `warn`  | A `SKILL.md` without a `name` or a `description`, a copy that duplicates or shadows `~/.claude/skills`, the same skill sitting in several projects, a registered repo that lost its `.claude/skills`. |

Every warning names the command that clears it: `hubskillz sync` for a redundant project copy, `hubskillz move <skill> global` for a skill repeated across projects, `hubskillz projects remove` for a dead registration.

### move

Moves one skill folder between the machine root and a project.

```sh
hubskillz move find-skills global        # project copy goes to ~/.claude/skills
hubskillz move find-skills .             # global copy goes into this repo
hubskillz move find-skills ~/code/other  # into another repo
```

The destination is `global` or a project directory. `move` finds the source itself, in the project of the working directory then in `~/.claude/skills`, skipping the destination. When the name sits in two other roots, `--from` says which copy to move.

A symlinked skill folder (the skills.sh canonical copy under `~/.agents/skills`) moves as a link, so its target stays where it is. When the destination already holds the very same files, `move` removes the spare copy instead. It refuses a destination holding something different unless you pass `--force`.

The move is local. Run `hubskillz status` after it to report the new layout.

### publish, unpublish

`publish` lists an approved skill on your public page at `hubskillz.com/@handle`, where anyone can read it and install it. `unpublish` takes it off. The skill keeps its place in the directory either way; only your page changes. Same toggle as the button on the skill page in the app.

```sh
hubskillz publish find-skills
hubskillz unpublish find-skills
```

The skill must be approved with a pinned version. Set your handle in the app under Settings before the first publish.

### push

Uploads a skill directory as a draft version for review. `-m`, `--message` attaches a message to the draft.

### projects

Registers repos so `sync --all` and `status` cover them from anywhere, in one run. `add` records the current directory (or `DIR`), which must contain `.claude/skills`; `remove` forgets it; `list` prints them; `discover` scans your home directory (three levels deep, skipping `node_modules`, `.git`, `Library` and hidden folders) for repos with `.claude/skills` and lets you pick which ones to register, `--yes` registers them all. Without a TTY the prompt selects everything. A registered path that no longer has a skills root is skipped with a note.

## Surfaces

- Global root: `~/.claude/skills`
- Project root: `<project>/.claude/skills`

Claude Code loads the global root in every project on the machine. A skill installed there reports `inherited` on a project surface: keep the global root up to date and every project is covered, `sync` writes no copy into the repo. A project copy that matches a known version (unmodified or late) is a redundant shadow of the global one: `sync` removes it after showing the plan. `sync` never removes a customized copy.

A symlinked skill directory (the skills.sh canonical copy under `~/.agents/skills`) is written through, so every agent on the machine sees the approved version. Links that leave your home directory are refused.

## CI and containers

Set `HUBSKILLZ_TOKEN` and no config file is needed:

```sh
HUBSKILLZ_TOKEN=... npx hubskillz sync --all --yes
```

Prompts are skipped when stdin is not a TTY: `sync` needs `--yes` to apply, `projects discover` registers everything found.

Update every machine and every repo from the directory, without installing anything:

```sh
npx hubskillz sync --all --yes
```

## Configuration

| Source                     | What                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.hubskillz/config.json` | `{ "baseUrl", "token", "machineId", "projects", "firstSyncAt" }`, mode `0600`. `login` writes it, `hubskillz projects` edits `projects`, the first completed `sync` sets `firstSyncAt`. |
| `HUBSKILLZ_TOKEN`          | Device token. Takes precedence over the file.                                                                                                                                           |
| `HUBSKILLZ_BASE_URL`       | Server URL for self-hosted instances.                                                                                                                                                   |
| `NO_COLOR`                 | Disables colours. Colours are also off when stdout is not a TTY.                                                                                                                        |

The server URL resolves in this order: `--base-url` flag, `HUBSKILLZ_BASE_URL`, the config file, then `https://api.hubskillz.com`.

## Exit codes

`0` on success, `1` on any failure. The failure is one line on stderr, prefixed with `hubskillz:`.

## Links

- Docs: https://hubskillz.com/docs/cli
- Changelog: https://github.com/JejeDurden2/hubskillz-cli/blob/main/CHANGELOG.md
- Issues: https://github.com/JejeDurden2/hubskillz-cli/issues
- License: MIT
