# Agent notes

`strata-kit` is a standalone public ESM package. Keep the root, noise, SDF, terrain, materials, shaders, and surface-fields imports free of renderer and framework dependencies. `three` and `r3f` remain opt-in exports with optional peer dependencies.

Run `pnpm verify` after package changes. It tests the packed tarball in a clean consumer without React or Three, then in an explicit adapter consumer. Run `pnpm test:gpu` only through the approved muted render pool; it is the WebGL readback proof for the analytic relief module.

Do not add application assets, game-specific coordinate projections, skeleton processing, or normal-map policy here. Consumers own those operations and pass local surface differentials to the generic relief API.
