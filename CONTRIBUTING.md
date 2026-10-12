# Contributing

Use Node 22 or newer and the exact pnpm version in `package.json`.

```sh
corepack enable
pnpm install
pnpm verify
```

Keep changes focused on the public API. Add a focused test for a behavior change, update `README.md` and `docs/` when the public contract changes, and use Conventional Commits. Releases are prepared from `main`; do not hand-edit the package version or changelog during ordinary development.
