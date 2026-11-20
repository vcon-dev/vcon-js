# Changelog

All notable changes to `vcon-js` are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses semver
(a major bump carries breaking changes).

The `vcon` syntax parameter is `"0.5.0"` and is independent of the package version.

## [1.0.0] — 2026-11-01

Retargets the library to `draft-ietf-vcon-vcon-core-05` (syntax `"0.5.0"`), matching the Python
reference implementation. This is a breaking release: the Dialog Object lost its transfer,
recording-set, party history and originator content, which moved to the new Session and Event
Objects. Readers accept `0.4.0` and `0.5.0`; writers emit `0.5.0`.

### Added
- `Session` and `SessionReference` (`src/session.ts`), the top-level `sessions` array,
  `Vcon.addSession()` and `Vcon.sessions`.
- `Event` (`src/event.ts`), the top-level `events` array, `Vcon.addEvent()` and `Vcon.events`.
  The per-event-type parameter table (section 4.3.1.5) is enforced by `new Event(...)`,
  `validateEvent()` and `Vcon.isValid()`.
- `redacted_from`, `amended_from` and `redacted_strings` top-level parameters and properties;
  Dialog `redacted_segments`; Attachment `session`; Analysis `sessions` and `analysis`.
- Empty Dialog Objects: `Dialog.placeholder()` serializes as `{}`. `Dialog.fromDict()` wraps an
  existing Dialog Object for reading.
- `migrate040To050(vcon, { strict })` (`src/migration.ts`), a table driven implementation of
  Appendix A.1 (`MIGRATION_STEPS`, one entry per step T1 to T15) that returns
  `{ vcon, report }`. The `MigrationReport` lists every inferred value, every fallback for a
  required field and every unresolved item, and keeps the original content of removed Dialogs.
  `MigrationError` is thrown for input that cannot be migrated and, in strict mode, when a
  required field has no source. Signed input is migrated as its unsigned payload and the report
  sets `resignRequired`; the library never re-signs.
- `Vcon.migrate040To050()` static method, `Vcon.migrationReport`, and the `migrateLegacy` and
  `strictMigration` options on `new Vcon()` and `Vcon.buildFromJson()`.
- `Vcon.isValid()` and `Vcon.getValidationWarnings()`, backed by `validateVconDict()`.
- Validation parity with the reference library vcon 1.0.6, with the same messages:
  - A malformed `content_hash` (not `<algorithm>-<base64url digest>`, an empty list, or a
    `sha512`/`sha256` digest of the wrong length) on a Dialog, attachment, analysis,
    `redacted_from` or `amended_from` is an error. `contentHashProblems()` is exported.
  - A `url` without a `content_hash` is allowed on a Dialog, attachment or analysis, with no
    error and no warning, following the working group's direction on
    draft-ietf-vcon-vcon-core issue #40 (a producer cannot always obtain stable bytes for the
    URL; core-05 itself still says MUST). An attachment needs `body`+`encoding` or `url`
    (`Attachment at index N must include body+encoding or url.`). `Dialog.validate()` and
    `Attachment.validate()` no longer require a `content_hash` with a `url`, but still reject a
    malformed one. `redacted_from` and `amended_from` with a `url` still need a `content_hash`.
  - A warning for a serialized JSON string body under `encoding: "json"`.
  - `isValid()` runs the lawful basis body validator on every `purpose: "lawful_basis"`
    attachment (`src/lawful-basis.ts`, a port of the reference `LawfulBasisValidator`), with
    errors and warnings prefixed `Attachment at index N (lawful_basis): `. Unknown proof
    types, hash algorithms and canonicalization methods are warnings. Exported as
    `validateLawfulBasisAttachment()` and `validateLawfulBasisBody()`.
  - An unparseable `created_at` or `updated_at` error quotes the reason, as the reference does.
  - A JWS container (no `uuid`, has `payload` and `signatures`) or JWE container (no `uuid`,
    has `ciphertext`) is kept exactly as given on load: no `uuid`, `created_at` or arrays are
    added. `isValid()` checks a JWS's `signatures` and validates its decoded `payload` as a vCon
    (including the lawful basis check); a JWE gets type checks on `ciphertext`, `iv`, `tag`,
    `protected` and `recipients`, and the warning that its content cannot be validated without
    decrypting it. `signedForm()`, `encryptedForm()` and `signedPayload()` are exported.
- `Vcon.sign(key, alg = "RS256")`, `Vcon.verify(key)` and `Vcon.generateKeyPair()` (JWS with
  Node `crypto`, no new dependency); `AlgorithmNotPermittedError`. This restores a signing
  surface that 0.5.2 removed, because core-05 section 6.2.2 now forbids `alg` "none" and the
  library needs somewhere to enforce it.
- `Vcon.addIncompleteDialog()`, `Vcon.findDialogsByType()`, `Vcon.findLawfulBasisAttachments()`
  and `Vcon.hasLawfulBasis()`.
- Test fixtures: the core-05 Appendix C JSON Schema and the Appendix B examples, under
  `src/__tests__/fixtures/`. The Appendix B examples and the library's output are validated
  against the schema. Migration, Session, Event, signing and extension-enforcement tests are
  ported from the reference implementation.

### Changed
- **Breaking:** `VCON_VERSION` and `Vcon.buildNew()` emit `"0.5.0"` (was `"0.4.0"`). `Vcon.vcon`
  is `undefined` when the input had no `vcon` parameter (it is optional in 0.5.0) instead of
  defaulting.
- **Breaking:** a vCon that declares `"vcon": "0.4.0"` is migrated on load, so `vcon.vcon` reads
  `"0.5.0"` and Dialog indices are preserved. Use `{ migrateLegacy: false }` to keep the raw
  0.4.0 object. A signed 0.4.0 vCon is kept signed on load; migrate it explicitly after
  verifying.
- **Breaking:** `Vcon.redacted` and `Vcon.amended` are now `redacted_from` and `amended_from`
  (`VconData.redacted` and `amended` are gone, and the boolean form is gone); the old names remain
  as deprecated aliases on `Vcon` that warn.
- **Breaking:** Dialog types are `recording`, `text` and `incomplete`. `new Dialog({ type: 'audio' | 'video' })`
  still works but warns and builds a `recording`; on read, `audio` and `video` Dialogs are
  accepted and `getValidationWarnings()` notes them. The `transfer` and `recording-set` types are
  gone, as are the Dialog parameters `party_history`, `originator`, `transferee`, `transferor`,
  `transfer_target`, `original`, `consultation`, `target_dialog`, `recordings`, `recording_set`
  and `transfer`; passing one to `new Dialog()` throws. `PartyHistory` is deprecated: it warns
  and converts with `toEvent(sessions)`. `Dialog.isTransfer()` warns and returns false;
  `Dialog.isRecordingSet()` is removed. `Dialog.type` and `Dialog.start` are optional in the
  type, since `{}` is a valid Dialog.
- **Breaking:** Dialog `parties` are the contributors only (a nested list is several
  contributors on one channel; `null` is a channel with no contributor). The receivers are the
  `parties` of the Session that lists the Dialog.
- **Breaking:** attachments need `party` plus `dialog` (a single index; arrays are no longer
  accepted) or `session`. The `dialog` default of `0` is gone. With neither given,
  `addAttachment()` uses the only Session when the vCon has exactly one and throws otherwise; no
  placeholder Session is added and a given `dialog` index is never widened to a Session.
  `addTag()` (whole-vCon metadata) lists every Session and adds an empty placeholder Session
  when there is none. `addAttachment()` defaults `start` to `created_at` and `mediatype` to
  `application/json` for `encoding: "json"`. `Attachment.validate()` requires `start`, `party`
  and `dialog` or `session`, and no longer accepts the `type: "lawful_basis"` form (the
  extension uses `purpose: "lawful_basis"`).
- **Breaking:** `addDialog()` returns the new Dialog's index and takes an optional `session`.
- `addAnalysis()` accepts `sessions` and `analysis`, and defaults `encoding` to `"none"` for a
  string body, which the schema requires.
- `isValid()` checks: a Session exists when there is dialog or events; all Session, Event,
  attachment and analysis references; the Event parameter table; `redacted_from` and
  `amended_from` exclusivity; that `extensions` lists every extension in use (`lawful_basis`,
  `wtf_transcription`, or any value outside the core vocabulary) and every `critical` entry;
  inline attachment `mediatype`; `__REDACTED_REF_#` references against `redacted_strings`; and
  that `vcon`, when present, is `"0.5.0"`.
- `Dialog.validate()` rejects unknown Dialog types, content on an `incomplete` Dialog and media
  types outside the known set (text, message and multipart subtypes are accepted).
- The vendored test schema is now the core-05 Appendix C schema (was the `0.4.0` schema).
- `created_at` is kept exactly as written on load; only a missing or empty value is set to
  now. `getValidationWarnings()` no longer adds its own no-party/no-session notes for
  `lawful_basis` attachments (`isValid()` already requires `party` and `dialog` or `session`).
- Date-time parsing rejects out-of-range fields (February 30, hour 24, offset of 24 hours)
  instead of rolling them over, and keeps microseconds. `migrate040To050` derives Session start
  and duration, and a consultation-end Event time, with microsecond precision and the reference's
  rounding and formatting, so both libraries produce the same document from the same input.

### Removed
- `Dialog.isRecordingSet()`, the `recording-set` and `transfer` Dialog types and their
  parameters (see Changed).

### Not changed
- Tags keep the JSON-string body and dictionary API. Encryption (JWE) is not implemented.
- The sample `*.vcon.json` files under `examples/` and `test-vcons/` are legacy data and were
  not regenerated; the readers migrate them if they declare `0.4.0`.

## [0.5.2] — 2026-08-06

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

[0.5.2]: https://github.com/vcon-dev/vcon-js/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/vcon-dev/vcon-js/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/vcon-dev/vcon-js/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/vcon-dev/vcon-js/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/vcon-dev/vcon-js/releases/tag/v0.3.0
