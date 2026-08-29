# Changelog

All notable changes to the `hubskillz` CLI. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
