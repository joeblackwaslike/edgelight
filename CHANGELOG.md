# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/joeblackwaslike/edgelite/compare/v0.2.0...v0.3.0) (2026-06-12)


### Features

* **db:** expose public transaction API on Db ([#17](https://github.com/joeblackwaslike/edgelite/issues/17)) ([cfff1f6](https://github.com/joeblackwaslike/edgelite/commit/cfff1f65e5cc85caff3413d2bb0af49e13ce6480))
* **phase-1:** add EdgeLite error classes ([64f0a4e](https://github.com/joeblackwaslike/edgelite/commit/64f0a4ed005f2e83e589b6c06edad2ee57b32fe4))
* **phase-1:** openDb creates PGlite data directory ([182f542](https://github.com/joeblackwaslike/edgelite/commit/182f54258e9a6697c7f94718864d2f266305ba17))
* **phase-1:** wire autoMigrate option stub; all Phase 1 tests green ([869c405](https://github.com/joeblackwaslike/edgelite/commit/869c4050e152b07229d0f58bfea7201448d44e23))
* **phase-2:** SDL AST type definitions and peggy dependency ([c4c83bd](https://github.com/joeblackwaslike/edgelite/commit/c4c83bd52144c0498cf40a861e2982db0eaa58e0))
* **phase-2:** SDL parser — parseSdl() with peggy grammar embedded as TS constant ([3aee67d](https://github.com/joeblackwaslike/edgelite/commit/3aee67dd0bb6ec5cc520bedd94bccc654ea01f0d))
* **phase-3:** compileSdl complete — all DDL mappings + full memtree schema test ([7cbfa57](https://github.com/joeblackwaslike/edgelite/commit/7cbfa5735412ceb64f37fd69b452e5882dcd0363))
* **phase-3:** compileSdl CREATE TABLE skeleton ([7b80acd](https://github.com/joeblackwaslike/edgelite/commit/7b80acd59dda47c8ccb70d1967d1b447b9c11de4))
* **phase-4:** define query builder interface types ([b4008eb](https://github.com/joeblackwaslike/edgelite/commit/b4008ebcece3b418424cf53812207623374c088c))
* **phase-4:** generateQueryBuilder emits e object with all builders ([935816a](https://github.com/joeblackwaslike/edgelite/commit/935816a0c1efef5ed96bf823e248cf04dba0c62b))
* **phase-4:** wire edgelite codegen CLI command ([0439a9c](https://github.com/joeblackwaslike/edgelite/commit/0439a9c4ad337ccd5ffab5513b897a72e2d648b8))
* **phase-5:** execute() wired into DbImpl.run() ([feca4a5](https://github.com/joeblackwaslike/edgelite/commit/feca4a53531ac992f74d9a0ce50200e19213a307))
* **phase-5:** integration tests — insert, select, update, count, edge unlessConflict ([a52d842](https://github.com/joeblackwaslike/edgelite/commit/a52d842bbcc345446db685e1c56a281ba419a524))
* **phase-5:** result mapper — parent__id → { parent: { id } } ([0ea4be0](https://github.com/joeblackwaslike/edgelite/commit/0ea4be08aa107a6442ca0acd161d01564184b87c))
* **phase-5:** SQL compiler — select, insert, update, count, neighbors, fts ([2dd07aa](https://github.com/joeblackwaslike/edgelite/commit/2dd07aac9188d6f098b5088e5cf28d037aa3e3c1))
* **phase-6:** DB introspection via information_schema ([cde1ea6](https://github.com/joeblackwaslike/edgelite/commit/cde1ea6a4f2fcac2f697345b94fe32832bbf6819))
* **phase-6:** migration apply (with DESTRUCTIVE skip) and status ([aebc956](https://github.com/joeblackwaslike/edgelite/commit/aebc956a10dfecde21f61d6fca6df323f9310bf4))
* **phase-6:** migration CLI complete; autoMigrate wired; DESTRUCTIVE policy enforced ([072ea31](https://github.com/joeblackwaslike/edgelite/commit/072ea3147a8839880b3c0263e4d8c0ff56a645dd))
* **phase-6:** migration file generation with DESTRUCTIVE header ([afa882b](https://github.com/joeblackwaslike/edgelite/commit/afa882b4bc275319b1d4a85193e41f76387150b6))
* **phase-6:** SDL vs DB diff — detects add/drop table, add/drop column ([55073bc](https://github.com/joeblackwaslike/edgelite/commit/55073bc234f97457b80803dc6d526d412cf0583d))
* **phase-7:** export openDb, closeDb, Db from public index ([8dd6d6a](https://github.com/joeblackwaslike/edgelite/commit/8dd6d6a0a2ae563c14658109478c0ab85ae4ec6a))
* **phase-7:** public API + migration generator fix ([82a9577](https://github.com/joeblackwaslike/edgelite/commit/82a957778ff8a18b088cee4a0c16200e7b88b60d))


### Bug Fixes

* **migration:** use compileSdl for new-table migrations instead of column stubs ([d67d556](https://github.com/joeblackwaslike/edgelite/commit/d67d5569a6a2a0eede481b7b32e3cf5ee0742542))
* **phase-6:** apply — bare names, no comment stripping, transaction, locale-safe sort ([27f884b](https://github.com/joeblackwaslike/edgelite/commit/27f884b96a0d9453b3f278bf78e7c48d2db9b4eb))
* **phase-6:** CLI try/finally resource cleanup; async main catch; sql strip regex ([10d4d83](https://github.com/joeblackwaslike/edgelite/commit/10d4d8313463297825e94cc3ced36f75bfe70dc3))
* **phase-6:** correct _edgelite exclusion filter; add exclusion test ([a392341](https://github.com/joeblackwaslike/edgelite/commit/a3923410b64f8db86da3ad2d73520188c1fee6b4))
* **phase-6:** exhaust changeToSql kinds with throw; atomic file write ([812030b](https://github.com/joeblackwaslike/edgelite/commit/812030b6146f073ef2c20f9e82a2333c77ec225c))
* **phase-6:** pglite.transaction(), end-anchor sql strip, skipMigrationCheck, scaffold comment ([93cd61e](https://github.com/joeblackwaslike/edgelite/commit/93cd61e7724f61a5fbc5f28c4ae8e2aeaba22b38))
* **types:** exhaustive switch uses change.kind, test helpers use spread for optional props ([e914d47](https://github.com/joeblackwaslike/edgelite/commit/e914d47fd4970f41e6d73c5c936a46d3772febfa))

## [0.2.0](https://github.com/joeblackwaslike/edgelite/compare/edgelite-v0.1.0...edgelite-v0.2.0) (2026-06-12)


### Features

* **db:** expose public transaction API on Db ([#17](https://github.com/joeblackwaslike/edgelite/issues/17)) ([cfff1f6](https://github.com/joeblackwaslike/edgelite/commit/cfff1f65e5cc85caff3413d2bb0af49e13ce6480))
* **phase-1:** add EdgeLite error classes ([64f0a4e](https://github.com/joeblackwaslike/edgelite/commit/64f0a4ed005f2e83e589b6c06edad2ee57b32fe4))
* **phase-1:** openDb creates PGlite data directory ([182f542](https://github.com/joeblackwaslike/edgelite/commit/182f54258e9a6697c7f94718864d2f266305ba17))
* **phase-1:** wire autoMigrate option stub; all Phase 1 tests green ([869c405](https://github.com/joeblackwaslike/edgelite/commit/869c4050e152b07229d0f58bfea7201448d44e23))
* **phase-2:** SDL AST type definitions and peggy dependency ([c4c83bd](https://github.com/joeblackwaslike/edgelite/commit/c4c83bd52144c0498cf40a861e2982db0eaa58e0))
* **phase-2:** SDL parser — parseSdl() with peggy grammar embedded as TS constant ([3aee67d](https://github.com/joeblackwaslike/edgelite/commit/3aee67dd0bb6ec5cc520bedd94bccc654ea01f0d))
* **phase-3:** compileSdl complete — all DDL mappings + full memtree schema test ([7cbfa57](https://github.com/joeblackwaslike/edgelite/commit/7cbfa5735412ceb64f37fd69b452e5882dcd0363))
* **phase-3:** compileSdl CREATE TABLE skeleton ([7b80acd](https://github.com/joeblackwaslike/edgelite/commit/7b80acd59dda47c8ccb70d1967d1b447b9c11de4))
* **phase-4:** define query builder interface types ([b4008eb](https://github.com/joeblackwaslike/edgelite/commit/b4008ebcece3b418424cf53812207623374c088c))
* **phase-4:** generateQueryBuilder emits e object with all builders ([935816a](https://github.com/joeblackwaslike/edgelite/commit/935816a0c1efef5ed96bf823e248cf04dba0c62b))
* **phase-4:** wire edgelite codegen CLI command ([0439a9c](https://github.com/joeblackwaslike/edgelite/commit/0439a9c4ad337ccd5ffab5513b897a72e2d648b8))
* **phase-5:** execute() wired into DbImpl.run() ([feca4a5](https://github.com/joeblackwaslike/edgelite/commit/feca4a53531ac992f74d9a0ce50200e19213a307))
* **phase-5:** integration tests — insert, select, update, count, edge unlessConflict ([a52d842](https://github.com/joeblackwaslike/edgelite/commit/a52d842bbcc345446db685e1c56a281ba419a524))
* **phase-5:** result mapper — parent__id → { parent: { id } } ([0ea4be0](https://github.com/joeblackwaslike/edgelite/commit/0ea4be08aa107a6442ca0acd161d01564184b87c))
* **phase-5:** SQL compiler — select, insert, update, count, neighbors, fts ([2dd07aa](https://github.com/joeblackwaslike/edgelite/commit/2dd07aac9188d6f098b5088e5cf28d037aa3e3c1))
* **phase-6:** DB introspection via information_schema ([cde1ea6](https://github.com/joeblackwaslike/edgelite/commit/cde1ea6a4f2fcac2f697345b94fe32832bbf6819))
* **phase-6:** migration apply (with DESTRUCTIVE skip) and status ([aebc956](https://github.com/joeblackwaslike/edgelite/commit/aebc956a10dfecde21f61d6fca6df323f9310bf4))
* **phase-6:** migration CLI complete; autoMigrate wired; DESTRUCTIVE policy enforced ([072ea31](https://github.com/joeblackwaslike/edgelite/commit/072ea3147a8839880b3c0263e4d8c0ff56a645dd))
* **phase-6:** migration file generation with DESTRUCTIVE header ([afa882b](https://github.com/joeblackwaslike/edgelite/commit/afa882b4bc275319b1d4a85193e41f76387150b6))
* **phase-6:** SDL vs DB diff — detects add/drop table, add/drop column ([55073bc](https://github.com/joeblackwaslike/edgelite/commit/55073bc234f97457b80803dc6d526d412cf0583d))
* **phase-7:** export openDb, closeDb, Db from public index ([8dd6d6a](https://github.com/joeblackwaslike/edgelite/commit/8dd6d6a0a2ae563c14658109478c0ab85ae4ec6a))
* **phase-7:** public API + migration generator fix ([82a9577](https://github.com/joeblackwaslike/edgelite/commit/82a957778ff8a18b088cee4a0c16200e7b88b60d))


### Bug Fixes

* **migration:** use compileSdl for new-table migrations instead of column stubs ([d67d556](https://github.com/joeblackwaslike/edgelite/commit/d67d5569a6a2a0eede481b7b32e3cf5ee0742542))
* **phase-6:** apply — bare names, no comment stripping, transaction, locale-safe sort ([27f884b](https://github.com/joeblackwaslike/edgelite/commit/27f884b96a0d9453b3f278bf78e7c48d2db9b4eb))
* **phase-6:** CLI try/finally resource cleanup; async main catch; sql strip regex ([10d4d83](https://github.com/joeblackwaslike/edgelite/commit/10d4d8313463297825e94cc3ced36f75bfe70dc3))
* **phase-6:** correct _edgelite exclusion filter; add exclusion test ([a392341](https://github.com/joeblackwaslike/edgelite/commit/a3923410b64f8db86da3ad2d73520188c1fee6b4))
* **phase-6:** exhaust changeToSql kinds with throw; atomic file write ([812030b](https://github.com/joeblackwaslike/edgelite/commit/812030b6146f073ef2c20f9e82a2333c77ec225c))
* **phase-6:** pglite.transaction(), end-anchor sql strip, skipMigrationCheck, scaffold comment ([93cd61e](https://github.com/joeblackwaslike/edgelite/commit/93cd61e7724f61a5fbc5f28c4ae8e2aeaba22b38))
* **types:** exhaustive switch uses change.kind, test helpers use spread for optional props ([e914d47](https://github.com/joeblackwaslike/edgelite/commit/e914d47fd4970f41e6d73c5c936a46d3772febfa))

## [Unreleased]

### Added
- Initial release
