# Changelog

## [0.2.1](https://github.com/jbcom/strata-procedural/compare/v0.2.0...v0.2.1) (2026-10-17)


### Bug Fixes

* **lint:** remove redundant non-null assertions ([d250d80](https://github.com/jbcom/strata-procedural/commit/d250d80f3169b08baecdd84bfc1cb064abf03ba4))
* **lint:** remove redundant non-null assertions ([8fdf4a5](https://github.com/jbcom/strata-procedural/commit/8fdf4a5b5a480c6f2ee7cd8276df1fc931f9ed0f))

## [0.2.0](https://github.com/jbcom/strata-procedural/compare/v0.1.0...v0.2.0) (2026-10-17)


### Features

* add composable procedural surfaces, meshes and verified adapters ([ee376fa](https://github.com/jbcom/strata-procedural/commit/ee376fa4cc08e08200447017943ac39068134834))
* add composable surfaces and portable procedural meshes ([2d5279b](https://github.com/jbcom/strata-procedural/commit/2d5279b88d2c3cfa4b7607200daf4fe1258f87f1))
* **materials:** add seeded paired hex sampling ([dacafd1](https://github.com/jbcom/strata-procedural/commit/dacafd1a17067ac996a3964ebbebdbd2e317c33c))
* **materials:** add seeded paired stochastic texture sampling ([1743fef](https://github.com/jbcom/strata-procedural/commit/1743fefaa20b5e6307edb5e5d7faa550be764e23))
* **materials:** add segment geometry and filtered band kernels ([1c31bb6](https://github.com/jbcom/strata-procedural/commit/1c31bb65720e06f53a15df1ba3651a62574408dd))
* **materials:** add segment samples and footprint-aware band coverage ([1085344](https://github.com/jbcom/strata-procedural/commit/1085344912ac69d5e60de962167fceb83553b567))
* **materials:** bake sub-texel UV triangles with area coverage ([07293da](https://github.com/jbcom/strata-procedural/commit/07293da211e6c698b028a5d363548734f71f8bba))
* **materials:** bake tangent normal maps from height grids ([9b00176](https://github.com/jbcom/strata-procedural/commit/9b00176190cfd42765f85ce203c8a2a67ead702c))
* **materials:** bake tangent normal maps from height grids ([df6d5ab](https://github.com/jbcom/strata-procedural/commit/df6d5abd24b8ff641168fda32140fa7ed9461f0d))
* **materials:** expose raw selected UV texel footprints ([96f789f](https://github.com/jbcom/strata-procedural/commit/96f789f0e56ecb8ff20f98db0f5dc9b652897334))
* **materials:** sample clipped UV atlas footprints ([3e882b8](https://github.com/jbcom/strata-procedural/commit/3e882b8319d0340e1d16e914cb5d395b001c661c))
* **materials:** stream raw selected UV texel footprints ([83b1538](https://github.com/jbcom/strata-procedural/commit/83b15388862578f955d7abed29ce8af275f6c221))
* **mesh:** add bounded adaptive spatial curve metrics ([87a3032](https://github.com/jbcom/strata-procedural/commit/87a3032227d58acb2c7223322e5f078983f3448e))
* **mesh:** add bounded adaptive spatial curve metrics ([d57d1e9](https://github.com/jbcom/strata-procedural/commit/d57d1e9e94e7c2aeb8145694cd7c60663195b33d))
* **mesh:** add mapped parametric sheet geometry ([0aee053](https://github.com/jbcom/strata-procedural/commit/0aee053e0e8f4e98d30652bd0e196fc8ec993db1))
* **mesh:** add section surfaces and coherent parameter winding ([20842ae](https://github.com/jbcom/strata-procedural/commit/20842ae8fef0829c7fe0013f5dd76f1bf257a22f))
* **mesh:** build mapped sheets and asymmetric section surfaces ([f69e83d](https://github.com/jbcom/strata-procedural/commit/f69e83debb034dbb1be9a35b80b7ea491a4fe087))
* **mesh:** recover renderer-neutral parametric sheets ([ec4010f](https://github.com/jbcom/strata-procedural/commit/ec4010f269d486821b5966488a43c2b091d0a1d7))
* **mesh:** sample signed-power superellipse sections ([6fc525e](https://github.com/jbcom/strata-procedural/commit/6fc525eb96812a8848e046a68c657f552652c997))
* **mesh:** sample signed-power superellipse sections ([c19ee1d](https://github.com/jbcom/strata-procedural/commit/c19ee1de5c21fa476cd6c431341b30d7493761d8))
* **mesh:** select cells in sampled sheets ([002232c](https://github.com/jbcom/strata-procedural/commit/002232c6e21b099f043a6dd36fb4260cf7a15c50))
* **mesh:** select sampled sheet cells and prove openings ([2317a92](https://github.com/jbcom/strata-procedural/commit/2317a92ff46be4a2521544637d7ccc890e39a915))
* **noise:** adapt deterministic 4D fields to periodic coordinates ([169beb1](https://github.com/jbcom/strata-procedural/commit/169beb1b0155ea1d63d353816154e9935d6fce81))
* **noise:** adapt deterministic 4D fields to periodic coordinates ([968d56a](https://github.com/jbcom/strata-procedural/commit/968d56a426c200eaafbe35ee9789373ba39d9c59))
* **noise:** add complete seeded two-nearest cell fields ([dcb2196](https://github.com/jbcom/strata-procedural/commit/dcb21964e3904c5e6d7e69e6c2aaa28edbb7ad15))
* **noise:** add complete seeded two-nearest cell fields ([3605d7e](https://github.com/jbcom/strata-procedural/commit/3605d7e9b44e22f1d9a9557c722ed4a7eefcc6b8))
* **shaders:** add paired integer hex texture sampling ([4c671b4](https://github.com/jbcom/strata-procedural/commit/4c671b4140e89b63fc20d40f8f3fc0b9b0af2c8a))
* **surface-fields:** add owned monotone cubic profiles ([a68a6cc](https://github.com/jbcom/strata-procedural/commit/a68a6ccb4c8c04137688e63e569fa96ef04323c5))
* **surface-fields:** add owned monotone cubic profiles ([da76302](https://github.com/jbcom/strata-procedural/commit/da763024dc56dde0ff9cdd1834b430c3f4ad4af1))
* **surface-fields:** sample explicit surface differentials ([422dab2](https://github.com/jbcom/strata-procedural/commit/422dab2bff30a7af53726a16cd0b958b596ee1cd))
* **surface-fields:** sample explicit surface differentials ([d9053a2](https://github.com/jbcom/strata-procedural/commit/d9053a2dbb9db3771716f857a6a169818395b322))
* **terrain:** compose directional fields and periodic profiles ([a2acd2d](https://github.com/jbcom/strata-procedural/commit/a2acd2d8fb9c9ffa436fe563ea6815a6e0589c61))
* **terrain:** compose directional fields and periodic profiles ([052bdd4](https://github.com/jbcom/strata-procedural/commit/052bdd41285347b10ce9b6bffccdb140cb72b0b7))
* **terrain:** encode and decode raw signed vector bytes ([fd031f5](https://github.com/jbcom/strata-procedural/commit/fd031f5b9cae323fd3d2d9b19e58f5e9cb21dba2))
* **terrain:** encode and decode raw signed vector bytes ([395cdca](https://github.com/jbcom/strata-procedural/commit/395cdcaeaa79cf62228d41836ebadd75c4e86a71))
* **terrain:** encode and sample explicit-range scalar grids ([d268a69](https://github.com/jbcom/strata-procedural/commit/d268a692424a68ebbd0a0958cc852eaa75e571ef))
* **terrain:** encode and sample explicit-range scalar grids ([c4df696](https://github.com/jbcom/strata-procedural/commit/c4df69628c47d8aac37d9600794e8ab313f30196))
* **three:** sample prepared maps with triplanar materials ([1d02d0a](https://github.com/jbcom/strata-procedural/commit/1d02d0ab3d736a844dd46867a10bfeac2d501467))
* **three:** sample prepared surface maps with triplanar materials ([c8faa10](https://github.com/jbcom/strata-procedural/commit/c8faa1020f3dac86dd21d689348de8f1a43ca844))
* **three:** snapshot prepared static meshes into copied buffers ([859ba8d](https://github.com/jbcom/strata-procedural/commit/859ba8deed8a76a25b86a10f2de1756038a7f815))
* **three:** snapshot prepared static meshes into copied buffers ([5dcf602](https://github.com/jbcom/strata-procedural/commit/5dcf6024dc146d1048cfab8f88a39cf5476a45f9))


### Bug Fixes

* bound procedural work and stabilize generated normals ([9af0905](https://github.com/jbcom/strata-procedural/commit/9af09050fd6f49613b34156672a4f58164c3effc))
* complete rebrand documentation and publishing review ([24e3733](https://github.com/jbcom/strata-procedural/commit/24e3733fe773afb6432364f9b9da4ea0313471cf))
* **deps:** bump tsup to 9 to resolve the development esbuild alert ([6cbd4fb](https://github.com/jbcom/strata-procedural/commit/6cbd4fb44b75f866d8f34add7eba168128d9c31f))
* **deps:** bump tsup to 9 to resolve the development esbuild alert ([4c4e775](https://github.com/jbcom/strata-procedural/commit/4c4e775bae32f3f02b5162f477c83731419943ec)), closes [#44](https://github.com/jbcom/strata-procedural/issues/44)
* exclude internal coordination from public artifacts ([25c36fc](https://github.com/jbcom/strata-procedural/commit/25c36fc25484b9c6583e80a9f0d5a753c4b9df62))
* explain release tag validation failure ([53e9d9c](https://github.com/jbcom/strata-procedural/commit/53e9d9c0c35c9e81b01ad7f1107c0e79f7da354a))
* keep sheet corner normals outward on incident faces ([f3d1434](https://github.com/jbcom/strata-procedural/commit/f3d14342f6d309ceea9f8f1c747b33a012c0d63c))
* keep sheet corner normals outward on incident faces ([6d13d49](https://github.com/jbcom/strata-procedural/commit/6d13d493d65143d2969346ed4c6e3eb59fd21d4c))
* **mesh:** contextualize invalid curve metric options ([f7561e7](https://github.com/jbcom/strata-procedural/commit/f7561e7161b0d5b32cbd98c22067034c41a6742b))
* **mesh:** keep angular-length UVs continuous across branch cuts ([db5976e](https://github.com/jbcom/strata-procedural/commit/db5976edda05d2f851a05121e3b0ca84f1c487c7))
* **mesh:** preserve coherent winding through folded parameter surfaces ([1e07d00](https://github.com/jbcom/strata-procedural/commit/1e07d00b541b92a00f3ee4fd0dff4d71c91cadc0))
* preserve extreme biome ranking and prove rendered surfaces ([77fa362](https://github.com/jbcom/strata-procedural/commit/77fa36262d4f509d7ec25edf5a321bfc8da1b294))
* resolve rebrand documentation and publishing review ([9d8e1a1](https://github.com/jbcom/strata-procedural/commit/9d8e1a1e1a45702fe109ce9ff1650085fc2ae317))
* support WebGL1 scalar texture uploads at Three peer floor ([0d562c4](https://github.com/jbcom/strata-procedural/commit/0d562c4db41286210b9a944c37429b2f248cc922))
* **terrain:** keep shared heightfield normals outward ([28cfbb1](https://github.com/jbcom/strata-procedural/commit/28cfbb16356a39b262ea934faee6b472cdc7244a))
* **terrain:** keep shared heightfield normals outward ([c863885](https://github.com/jbcom/strata-procedural/commit/c86388541640b71830a250cc2d9f2b3ef0c3d359))
* **three:** reject incompatible native shader layouts atomically ([7d95bbe](https://github.com/jbcom/strata-procedural/commit/7d95bbe3c81393cb54a17b89fbb3655789a0ff3a))


### Performance Improvements

* memoize repeated wear samples and verify workload evidence ([c2b9c47](https://github.com/jbcom/strata-procedural/commit/c2b9c47cb385e475b64fc09444472f4afb8f3a39))
* **reskin:** filter overlap candidates on both UV axes ([528a19b](https://github.com/jbcom/strata-procedural/commit/528a19b1427145e3027cbd0d65841541bbdca386))
* **reskin:** scale exact UV overlap candidate search ([11d9630](https://github.com/jbcom/strata-procedural/commit/11d9630beca20aa99bfcf6ca5fabc6b02ddece90))
* **terrain:** cache heightfield samples ([a8b77e4](https://github.com/jbcom/strata-procedural/commit/a8b77e452436e5362c0047223205395a13581424))
* **terrain:** reuse bounded exact heightfield samples ([60d5872](https://github.com/jbcom/strata-procedural/commit/60d5872dc0a0df63da53039ae87463e178a474d5))

## 0.1.0

- Initial standalone release of deterministic procedural terrain, materials, and analytic scalar relief fields.
- Preserves the relevant package history from the source project while publishing only this package's source, tests, license, and public documentation.
