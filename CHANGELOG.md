# Changelog

All notable changes to the `hubskillz` CLI. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

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
