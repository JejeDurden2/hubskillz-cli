# Contributing

The `hubskillz` CLI is developed in the open at https://github.com/JejeDurden2/hubskillz-cli: `packages/cli`, `packages/shared` and the CLI to web contract. Pull requests and issues go there. The web app is closed source.

Thanks for helping. Bug reports, docs fixes and small focused pull requests are all welcome.

## Setup

Requirements: Node 22, pnpm 9.

```sh
pnpm install
pnpm build
```

Then `node packages/cli/dist/index.js`. Point it at a server with `--base-url` or `HUBSKILLZ_BASE_URL`.

## Before you open a pull request

The pre-push hook and CI run the same checks:

```sh
pnpm format:check
pnpm lint
pnpm type-check
pnpm build
pnpm test
```

- Write tests for business logic (`*.spec.ts` next to the code, Vitest).
- No `any`, explicit return types, named exports.
- Commits follow Conventional Commits with a scope: `feat(cli): ...`, `fix(web): ...`, `docs: ...`.
- User-facing strings in the web app go through `apps/web/messages/{en,fr}.json`.

## Where things live

- `packages/cli`: the `hubskillz` npm package.
- `packages/shared`: Zod schemas, content hash and state rules used by both sides.
- `docs/CLI-API.md`: the contract with the `/api/cli/*` routes of the web app.

## Reporting a bug

Open an issue with the command you ran, the output (`NO_COLOR=1` helps), your OS and `hubskillz --version`. Never paste a device token.

## Releasing the CLI

Maintainers: bump `packages/cli/package.json`, add a `CHANGELOG.md` entry, commit. The mirror workflow pushes the tree and tags `cli-v<version>` on the public repo, whose release workflow publishes to npm with provenance.
