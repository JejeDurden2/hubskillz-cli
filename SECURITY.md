# Security policy

## Supported versions

The latest published version of the `hubskillz` npm package and the `main` branch.

## Reporting a vulnerability

Email desmaresjerome@gmail.com, or use GitHub's private vulnerability reporting on this repository. Do not open a public issue.

You get an acknowledgement within 72 hours and a fix or a mitigation plan within 14 days for confirmed issues.

## Scope notes

- Device tokens are stored in `~/.hubskillz/config.json` with mode `0600`. The CLI never prints them.
- The CLI writes only under `~/.claude/skills` and `<project>/.claude/skills`, never through a symlink that leaves your home directory.
