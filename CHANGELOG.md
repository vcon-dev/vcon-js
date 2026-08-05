# Changelog

All notable changes to `vcon-js` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses semver
(pre-1.0, so a minor bump may carry breaking changes).

The `vcon` syntax parameter is `"0.4.0"` and is independent of the package version.

## [Unreleased] — 0.5.2

### Fixed
- `addTag()` now stamps the schema-required `start` on the `purpose: "tags"` attachment.
  Previously every tagged vCon emitted an attachment missing `start`, which fails validation
  against the core JSON Schema. Caught by the new conformance suite.

### Added
- Schema-conformance test suite: emitted vCons are validated against the authoritative
  `vcon_json_schema.json` (vendored under `src/__tests__/fixtures/`) via ajv.
- `package.json` metadata: `repository`, `homepage`, `bugs`, `author`, `engines` (`node >=18`).
- `prepublishOnly` guard (`npm run build && npm test`) so a stale/empty `dist/` cannot ship.
- ESLint configuration (`.eslintrc.json`); the `lint` script previously had no config.

### Removed (breaking, type-level only)
- Dropped the unused signing surface: the `jose` and `jsonwebtoken` runtime dependencies, the
  dead `crypto` import, and the `Signature` interface plus `VconData.signature` / `signatures`
  / `payload`. Nothing implemented these; signing is the caller's responsibility. The per-object
  `alg` / `signature` fields on Dialog (spec url-referenced content signature) are unchanged.

### Changed
- CI now runs build + lint + tests + example smoke on Node 18 and 20.
- Removed redundant `@types/uuid` and `@types/jsonwebtoken` devDependencies.

## [0.5.1] — 2026-08-04

### Security
- Bumped `uuid` `^9.0.1` -> `^11.1.1` (GHSA-w5hq-g745-h8pq). The `v4` import is unchanged.
  `npm audit` reports 0 vulnerabilities.

## [0.5.0] — 2026-08-04

### Added
- Parity with the current core draft (`draft-ietf-vcon-vcon-core`, past -02):
  - `recording-set` dialog type with `recordings[]` and `recording_set`; `isRecordingSet()`.
  - Analysis `attachment` reference; `dialog` is now optional (analysis may key off an attachment).
  - Party `type`, `org`, `dept`.
  - Typed `provenance` parameter on Dialog and Analysis (draft-howe-vcon-provenance). All other
    extension parameters continue to round-trip untyped via the catch-all.
- `test:coverage` script; test count 78 -> 93.

### Changed
- Transfer index fields (`transfer_target`, `original`, `consultation`, `target_dialog`) widened
  to `number | number[]`. Syntax parameter stays `"0.4.0"`.

## [0.4.0] — 2026-05-19

First release that actually conforms to `draft-ietf-vcon-vcon-core-02`.

### Changed (breaking)
- Tags are emitted as a single `purpose: "tags"` attachment (no top-level `tags` field on the wire);
  the `addTag` / `getTag` / `tags` API is preserved.
- `analysis.body` is always a string; `addAnalysis` auto-`JSON.stringify`s object/array bodies and
  forces `encoding: "json"`.
- Attachments use `purpose`; the legacy `type` field was removed (the `lawful_basis` extension
  remains reachable via the catch-all). `party`/`dialog` default to `0` when omitted.
- Removed the spec-reserved `group`.

## [0.3.0] — 2026-04-16

Type-level move toward core-02 (later found incomplete; see 0.4.0).

### Changed (breaking)
- `SessionId` shape `{ id, type? }` -> `{ local, remote }` (RFC 7989 §5).
- `content_hash` accepts `string | string[]` everywhere.
- `VCON_VERSION` `'0.0.1'` -> `'0.4.0'`.
- `PartyHistory` gained `button` (DTMF); `Dialog` gained `message_id`; `Redacted`/`Amended` gained
  `type` / `url` / `content_hash`.

[Unreleased]: https://github.com/vcon-dev/vcon-js/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/vcon-dev/vcon-js/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/vcon-dev/vcon-js/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/vcon-dev/vcon-js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/vcon-dev/vcon-js/releases/tag/v0.3.0
