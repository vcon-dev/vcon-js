# vcon-js

A JavaScript/TypeScript library for creating and managing vCons (Virtual Conversations), compliant with [IETF draft-ietf-vcon-vcon-core-05](https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core) (syntax `"0.5.0"`).

> **Version 1.0.0 is a breaking release.** It writes vCon syntax `0.5.0`. The Dialog Object lost its transfer, recording-set, party history and originator content, which moved to the new Session and Event Objects. The library still reads `0.4.0` vCons and migrates them on load. See [Migrating from 0.4.0](#migrating-from-040) and the [CHANGELOG](CHANGELOG.md).

## Installation

```bash
npm install vcon-js
```

## Usage

### Creating a new vCon

A conversation hangs off a Session. The Session lists the receivers (the first party is the implied originator), and a Dialog lists only its contributors. Core-05 requires at least one Session when there is dialog or there are events.

```typescript
import { Vcon, Party, Dialog, Session } from 'vcon-js';

// Create a new vCon
const vcon = Vcon.buildNew();

// Add parties
vcon.addParty(new Party({ tel: '+1234567890', name: 'John Doe', role: 'agent' }));
vcon.addParty(new Party({ tel: '+0987654321', name: 'Jane Smith', role: 'customer' }));

// Add a Session; its parties are the receivers
const session = vcon.addSession(new Session({ start: new Date(), parties: [0, 1] }));

// Add a text dialog to the Session. Its parties are the contributors (the sender).
vcon.addDialog(
  new Dialog({
    type: 'text',
    start: new Date(),
    parties: [0],
    body: 'Hello, this is a conversation!',
    mediatype: 'text/plain',
    encoding: 'none'
  }),
  session
);

// Check it against the core-05 rules
const { valid, errors } = vcon.isValid();

// Convert to JSON
const json = vcon.toJson();
```

`addDialog` and `addIncompleteDialog` return the new Dialog's index. `isValid()` returns `{ valid, errors }`; `getValidationWarnings()` lists SHOULD-level findings.

### Loading from JSON

```typescript
import { Vcon } from 'vcon-js';

const jsonString = '...'; // Your vCon JSON string
const vcon = Vcon.buildFromJson(jsonString);
```

A vCon that declares `"vcon": "0.4.0"` is migrated to 0.5.0 on load; the report is in `vcon.migrationReport`. See [Migrating from 0.4.0](#migrating-from-040).

### Working with Attachments

Per core-05 §4.6, an attachment has `purpose`, `start` and `party`, plus `dialog` (a single index) or `session` (an index or list). `party` defaults to 0 and `start` to the vCon's `created_at`. The library never invents the scope: with neither `dialog` nor `session`, `addAttachment` uses the only Session when the vCon has exactly one, and throws otherwise. A `dialog` index is never widened to a Session.

```typescript
import { Vcon } from 'vcon-js';

// vcon already has one Session, so the scope defaults to session 0
vcon.addAttachment({
  purpose: 'document',
  mediatype: 'application/pdf',
  body: 'base64urlEncodedContent',
  encoding: 'base64url',
  filename: 'document.pdf',
  party: 0
});

// Explicit scope
vcon.addAttachment({ purpose: 'note', body: 'hi', encoding: 'none', mediatype: 'text/plain', party: 1, dialog: 0 });
vcon.addAttachment({ purpose: 'note', body: 'hi', encoding: 'none', mediatype: 'text/plain', party: 1, session: [0, 1] });

// External attachment (a content_hash is recommended where the bytes are stable;
// when present it must match sha512-<base64url-of-SHA-512>)
vcon.addAttachment({
  purpose: 'transcript',
  url: 'https://example.com/transcript.txt',
  content_hash: 'sha512-Tf9OoDQfCoI_FdP08BqxLq4OXaV5zLhR-NvZ3-hMWLLN7iZA50Dh7hctp5Om55Vg5ff5vQWKEqKAQz7W-kZRCg',
  mediatype: 'text/plain'
});

// Look up by purpose
const transcript = vcon.findAttachmentByPurpose('transcript');
```

### Working with Analysis

Per the spec, `analysis.body` MUST be a string. `addAnalysis` accepts an object or array and serializes it for you (forcing `encoding: "json"`); if you pass a string yourself it's stored verbatim.

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add inline analysis (object body gets auto-stringified to JSON)
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 0,
  vendor: 'sentiment-analyzer',
  product: 'analyzer-v2',
  body: {
    score: 0.8,
    label: 'positive'
  }
});

// Add analysis with external reference
vcon.addAnalysis({
  type: 'transcription',
  dialog: [0, 1],
  sessions: 0,   // optional: Session(s) the analysis is based on
  vendor: 'whisper',
  url: 'https://example.com/transcription.json',
  content_hash: 'sha512-xyz789...',
  mediatype: 'application/json'
});

// Find analysis by type
const sentimentAnalysis = vcon.findAnalysisByType('sentiment');
```

### Working with Dialog Types

Core-05 defines three dialog types: `recording` (audio or video, told apart by `mediatype`), `text`, and `incomplete` (a conversation that failed to be set up, with no content). A Dialog's `parties` are its contributors; a nested list puts several contributors on one channel and `null` marks a channel with no contributor. The receivers are the `parties` of the Session that lists the Dialog.

```typescript
import { Dialog } from 'vcon-js';

// Text dialog: the sender
const textDialog = new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0],
  body: 'Hello!',
  mediatype: 'text/plain',
  encoding: 'none'
});

// Recording dialog with external audio: one channel per contributor
const recordingDialog = new Dialog({
  type: 'recording',
  start: new Date(),
  parties: [0, 1],
  duration: 300
});
recordingDialog.addExternalData(
  'https://example.com/audio.wav',
  'audio/wav',
  { filename: 'call.wav', content_hash: 'sha512-abc...' }
);

// Incomplete dialog (e.g., no answer): the party that tried
vcon.addIncompleteDialog({ start: new Date(), disposition: 'no-answer', parties: [0], session: 0 });

// An empty placeholder Dialog ({}) holds an array position so indices do not shift
vcon.addDialog(Dialog.placeholder());
```

`Dialog` rejects the parameters core-05 removed (`originator`, `party_history`, `transferee`, `transferor`, `transfer_target`, `original`, `consultation`, `target_dialog`, `recordings`, `recording_set`). `type: 'audio'` and `type: 'video'` still build a `recording` and emit a deprecation warning; on read they are accepted with a validation warning.

### Sessions and Events

```typescript
import { Vcon, Session, SessionReference, Event } from 'vcon-js';

const vcon = Vcon.buildNew();
// ... parties, dialogs ...

// Sessions relate to each other with Session_Reference (child, peer, precursor, breakout)
const call = vcon.addSession(new Session({ start: T, duration: 600, parties: [0, 1] }));
const consult = vcon.addSession(new Session({
  start: T,
  parties: [1, 2],
  sessions: [new SessionReference(call, 'peer', 'consultation call')]
}));

// Events: join, drop, hold, unhold, mute, unmute, keydown, keyup, consultation-start,
// blind-transfer, consultative-transfer, transfer-abandoned, channel-contributors.
vcon.addEvent(new Event({ type: 'join', time: T, sessions: call, party: 0 }));
vcon.addEvent(new Event({ type: 'keydown', time: T, sessions: call, party: 0, button: '5' }));
vcon.addEvent(new Event({
  type: 'blind-transfer',
  time: T,
  sessions: call,     // the original call
  party: 1,           // the Transferor
  transferee: 0,
  transfer_target: 2,
  target_session: consult
}));
```

`new Event(...)` enforces the per-type parameter table of core-05 §4.3.1.5 and throws on a missing or forbidden parameter. A plain object passed to `addEvent` is checked by `isValid()`.

### Attachment-based analysis and provenance

```typescript
import { Vcon, Dialog } from 'vcon-js';

const vcon = Vcon.buildNew();

// Analysis can key off an attachment, Session or other analysis instead of a dialog
vcon.addAnalysis({ type: 'summary', attachment: 0, vendor: 'acme', body: { text: 'hi' } });
vcon.addAnalysis({ type: 'summary', sessions: 0, vendor: 'acme', body: 'short summary' });

// Generation provenance (draft-howe-vcon-provenance) on machine-generated dialog or analysis
vcon.addAnalysis({ type: 'summary', dialog: 0, vendor: 'acme',
  provenance: { model: 'gpt-4', provider: 'openai', temperature: 0.2 } });
```

Every other extension parameter round-trips untyped via a catch-all, so you can attach any
extension's fields without a typed helper.

### Redaction and amendment

`redacted_from` and `amended_from` (renamed from `redacted` and `amended`) are mutually exclusive. The old property names remain on `Vcon` as deprecated aliases.

```typescript
vcon.redacted_from = { uuid: '...', type: 'pii', url: 'https://example.com/o.vcon', content_hash: 'sha512-...' };
// a string can carry __REDACTED_REF_7 if redacted_strings has { ref: 7 }
vcon.data.redacted_strings = [{ ref: 7 }];
```

### Signing

`sign()` and `verify()` produce and check a JWS (general serialization with one signature) with Node's `crypto`. `alg` defaults to `RS256`; `none` is rejected on both sides (core-05 §6.2.2) with `AlgorithmNotPermittedError`, and `verify()` returns `false` when no `alg` is declared.

```typescript
import { Vcon } from 'vcon-js';

const { privateKey, publicKey } = Vcon.generateKeyPair();
vcon.sign(privateKey);               // RS256; also RS384/512, PS256/384/512, ES256/384/512, EdDSA
vcon.verify(publicKey);              // true
vcon.sign(privateKey, 'none');       // throws AlgorithmNotPermittedError
```

Encryption (JWE) is not implemented; wrap the vCon with a library of your choice.

A signed (JWS) or encrypted (JWE) container loaded with `new Vcon(...)` is kept exactly as given. `isValid()` checks a JWS's `signatures` and validates the decoded `payload` as a vCon; for a JWE it checks the member types and `getValidationWarnings()` notes that the content cannot be validated without decrypting it.

### Working with Extensions

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add a non-critical extension
vcon.addExtension('contact_center');

// Add a critical extension (must be understood by processors)
vcon.addCriticalExtension('encrypted');

// Check extensions
console.log(vcon.hasExtension('contact_center')); // true
console.log(vcon.isCriticalExtension('encrypted')); // true
```

`extensions` MUST list every extension in use. `isValid()` reports `lawful_basis` and `wtf_transcription` attachments or analysis that are not listed, every `critical` entry that is not in `extensions`, and values outside the core vocabulary (event types, encodings, dispositions, Session_Reference types) when `extensions` is empty.

### Lawful basis

The `lawful_basis` extension records the basis for processing as an attachment with `purpose: "lawful_basis"`, scoped with `party` plus `session`. This library does not create one for you and never invents a basis. Add it yourself, list the extension, and check with `hasLawfulBasis()`:

```typescript
vcon.addAttachment({
  purpose: 'lawful_basis',
  party: 0,
  session: 0,
  encoding: 'json',
  body: {
    lawful_basis: 'consent',
    expiration: null,
    purpose_grants: [{ purpose: 'recording', granted: true, granted_at: '2026-01-15T10:30:00Z' }]
  }
});
vcon.addExtension('lawful_basis');

vcon.hasLawfulBasis();                // true
vcon.findLawfulBasisAttachments(0);   // lawful_basis attachments for party 0
```

`isValid()` checks the body of every `lawful_basis` attachment (required fields, purpose grants, the `content_hash` object, proof mechanisms and registry), reporting each finding as `Attachment at index N (lawful_basis): ...`. An expired basis and unknown proof types, hash algorithms or canonicalization methods are warnings in `getValidationWarnings()`. `validateLawfulBasisAttachment()` checks a bare attachment.

### Content hashes and bodies

`isValid()` rejects a malformed `content_hash` (it must be `<algorithm>-<unpadded base64url digest>`, or a non-empty list of them; `sha512` and `sha256` digests must have the right length) on Dialogs, attachments, analysis, `redacted_from` and `amended_from`. A `url` without a `content_hash` is allowed on Dialogs, attachments and analysis (following the working group's direction on draft-ietf-vcon-vcon-core issue #40, since a producer cannot always obtain stable bytes for the URL); `redacted_from` and `amended_from` with a `url` still need one. An attachment needs `body`+`encoding` or `url`. `getValidationWarnings()` notes a body under `encoding: "json"` that is a serialized JSON string rather than the JSON value. `contentHashProblems(value)` gives the reasons for one value.

### Working with Tags

Tags are stored as a single attachment with `purpose: "tags"`, `party: 0`, `session` listing every Session, and a JSON-string body. Tags describe the whole vCon, so if the vCon has no Session, an empty placeholder Session is added to scope the attachment. The `addTag` / `getTag` / `tags` API hides the encoding — there is no top-level `tags` field in the emitted JSON.

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

vcon.addTag('category', 'support');
vcon.addTag('priority', 'high');

vcon.getTag('category'); // 'support'
vcon.tags;               // { category: 'support', priority: 'high' }
```

### Migrating from 0.4.0

Readers accept `0.4.0` and `0.5.0`; writers emit `0.5.0`. A 0.4.0 vCon passed to `new Vcon(...)` or `Vcon.buildFromJson(...)` is migrated, following Appendix A.1 of core-05, and the result carries a report of everything the draft did not dictate.

```typescript
import { Vcon, migrate040To050 } from 'vcon-js';

// On load
const vcon = Vcon.buildFromJson(old040Json);
vcon.vcon;                       // '0.5.0'
vcon.migrationReport?.summary(); // '4 inferred, 0 fallback, 1 unresolved'

// Or directly, on a plain object
const { vcon: migrated, report } = migrate040To050(old040Object);
report.inferred;        // values the migration chose
report.fallbacks;       // required fields filled with a documented fallback
report.unresolved;      // problems left for a person
report.removedDialogs;  // original content of every Dialog replaced by {}, by index

// Strict mode throws MigrationError instead of using a fallback
migrate040To050(old040Object, { strict: true });
```

What the migration does:

- Adds one Session that lists every kept Dialog; each `recording-set` Dialog becomes its own Session.
- Turns `party_history` entries into Events and `transfer` Dialogs into transfer Events, with Sessions for the original, consultation and target calls.
- Moves `originator` to the Session, and reduces a text or incomplete Dialog's `parties` to the sender.
- Replaces each removed Dialog with `{}` so no Dialog index changes, and re-points analysis and attachments that referenced one.
- Renames `redacted` and `amended`, and adds the extensions in use to `extensions`.
- Lists every dropped field with its value in the report. It never promotes a receiver to sender when the sender is `null`, and never defaults an attachment's scope unless the result has exactly one Session.

Signed input is not migrated on load, because migrating drops the signature. Verify it first, then call `Vcon.migrate040To050(signed)`; the report sets `resignRequired`. Pass `{ migrateLegacy: false }` to keep a 0.4.0 object untouched (`isValid()` then reports it as not 0.5.0).

### Working with Message IDs

For email and messaging systems, use the `message_id` parameter to prevent duplicates:

```typescript
import { Dialog } from 'vcon-js';

const emailDialog = new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0, 1],
  mediatype: 'message/rfc822',
  message_id: '<abc123@example.com>',  // SMTP message-id
  body: 'Email content here...'
});
```

### Party Identifiers

vcon-core supports multiple party identifier types:

```typescript
import { Party } from 'vcon-js';

const party = new Party({
  tel: '+1234567890',           // Telephone URL
  sip: 'sip:user@example.com', // SIP address
  mailto: 'user@example.com',   // Email address
  stir: 'eyJhbGci...',         // STIR PASSporT
  did: 'did:example:123',       // Decentralized Identifier
  name: 'John Doe',
  timezone: 'America/New_York',
  role: 'agent'
});

// Check if party has an identifier
console.log(party.hasIdentifier()); // true

// Get primary identifier
console.log(party.getPrimaryIdentifier()); // '+1234567890'
```

## API Reference

### Vcon

The main class for working with vCons.

#### Static Methods

- `buildNew()`: Creates a new vCon with UUID and timestamp
- `buildFromJson(jsonString, options?)`: Creates a vCon from JSON string; a 0.4.0 vCon is migrated
- `migrate040To050(source, { strict? })`: Explicitly migrates a 0.4.0 vCon (object or JSON, signed or not) and returns a `Vcon` with `migrationReport`
- `generateKeyPair()`: RSA 2048 key pair for `sign()`

#### Instance Methods

- `addParty(party: Party)`: Adds a party to the vCon
- `addSession(session?)`: Adds a Session (empty if omitted); returns its index
- `addEvent(event)`: Adds an Event; returns its index
- `addDialog(dialog, session?)`: Adds a dialog, optionally to a Session; returns its index
- `addIncompleteDialog(params)`: Adds an `incomplete` dialog; returns its index
- `addAttachment(params)`: Adds an attachment (inline or external). `purpose` required; `party` defaults to 0; `dialog` or `session` required unless the vCon has exactly one Session.
- `addAnalysis(params)`: Adds analysis data. Object/array bodies are auto-serialized to a JSON string.
- `addTag(tagName, tagValue)`: Adds a tag (writes to the `purpose: "tags"` attachment).
- `addExtension(name)`: Adds a non-critical extension
- `addCriticalExtension(name)`: Adds a critical extension
- `findPartyIndex(by, val)`: Finds a party index by property
- `findDialog(by, val)`: Finds a dialog by property
- `findAttachmentByPurpose(purpose)`: Finds an attachment by purpose
- `findAnalysisByType(type)`: Finds analysis by type
- `hasExtension(name)`: Checks if extension is used
- `isCriticalExtension(name)`: Checks if extension is critical
- `getTag(tagName)`: Gets a tag value
- `findLawfulBasisAttachments(party?)`, `hasLawfulBasis()`: Lawful basis attachments
- `isValid()`: `{ valid, errors }` against core-05
- `getValidationWarnings()`: SHOULD-level findings
- `sign(privateKey, alg?)`, `verify(publicKey)`: JWS; `alg` `none` is rejected
- `toJson()`: Converts the vCon to JSON string
- `toDict()`: Converts the vCon to a plain object

#### Properties

- `uuid`: Unique identifier
- `vcon`: Syntax version (`"0.5.0"`)
- `migrationReport`: `MigrationReport` when the input was migrated from 0.4.0
- `created_at`: Creation timestamp (RFC3339)
- `updated_at`: Last modification timestamp
- `subject`: Conversation subject
- `parties`: Array of parties
- `sessions`: Array of Session Objects
- `events`: Array of Event Objects
- `dialog`: Array of dialogs
- `attachments`: Array of attachments
- `analysis`: Array of analysis results
- `tags`: Decoded tag dictionary (read-through view of the `purpose: "tags"` attachment)
- `extensions`: Non-critical extensions array
- `critical`: Critical extensions array
- `redacted_from`: Reference to the unredacted vCon (mutually exclusive with `amended_from`); `redacted` is a deprecated alias
- `amended_from`: Reference to the prior version (mutually exclusive with `redacted_from`); `amended` is a deprecated alias
- `redacted_strings`: Redacted substring entries
- `meta`: Additional metadata

### Party

Class for representing parties in a vCon.

#### Properties

- `tel?: string`: Telephone URL (TEL format)
- `sip?: string`: SIP address
- `mailto?: string`: Email address
- `stir?: string`: STIR PASSporT
- `did?: string`: Decentralized Identifier
- `name?: string`: Display name
- `uuid?: string`: Participant identifier
- `validation?: string`: Identity validation method
- `gmlpos?: string`: GML position
- `civicaddress?: CivicAddress`: Civic address
- `timezone?: string`: Location timezone
- `role?: string`: Role in conversation
- `meta?: Record<string, any>`: Additional metadata

#### Methods

- `toDict()`: Converts to plain object
- `hasIdentifier()`: Checks if party has any identifier
- `getPrimaryIdentifier()`: Gets the primary identifier
- `validate()`: Validates against vcon-core recommendations

### Dialog

Class for representing dialogs in a vCon.

#### Static Constants

```typescript
Dialog.DIALOG_TYPES     // ['recording', 'text', 'incomplete']
Dialog.DISPOSITIONS     // ['no-answer', 'congestion', 'failed', 'busy', 'hung-up', 'voicemail-no-message']
Dialog.VALID_ENCODINGS  // ['base64url', 'json', 'none']
```

#### Properties

- `type?: string`: Dialog type (`recording`, `text`, `incomplete`); absent on a placeholder
- `start?: Date | string`: Start time (RFC3339)
- `parties?: number | Array<number | number[] | null>`: Contributing party indices
- `mediatype?: string`: MIME type
- `filename?: string`: Original filename
- `body?: string`: Inline content
- `encoding?: string`: Content encoding (`base64url`, `json`, `none`)
- `url?: string`: External URL reference
- `content_hash?: string | string[]`: Content hash for external files (single or array)
- `duration?: number`: Duration in seconds
- `disposition?: string`: Disposition for incomplete dialogs
- `session_id?: SessionId`: Session identifier (with `local` and `remote` UUIDs per RFC 7989)
- `redacted_segments?: { start, end }[]`: Redacted segments of the content
- `application?: string`: Application that created the dialog (e.g., 'zoom', 'teams')
- `message_id?: string`: Message identifier for cross-referencing (e.g., SMTP message-id)

#### Methods

- `toDict()`: Converts to plain object
- `addExternalData(url, mediatype, options?)`: Adds external data reference
- `addInlineData(body, mediatype, options?)`: Adds inline data
- `static placeholder()`, `isPlaceholder()`: An empty Dialog (`{}`)
- `static fromDict(data)`: Wraps an existing Dialog Object for reading
- `isExternalData()`: Checks if has external data
- `isInlineData()`: Checks if has inline data
- `isText()`: Checks if text type
- `isRecording()`: Checks if recording type
- `isTransfer()`: Deprecated, always `false`
- `isIncomplete()`: Checks if incomplete type
- `isAudio()`: Checks if audio content
- `isVideo()`: Checks if video content
- `isEmail()`: Checks if email content
- `validate()`: Validates against vcon-core

### Attachment

Class for representing attachments in a vCon.

#### Static Constants

```typescript
Attachment.VALID_ENCODINGS  // ['base64url', 'json', 'none']
```

#### Properties

- `purpose?: string`: Purpose/category (REQUIRED in core)
- `start?: Date | string`: Reference time (REQUIRED)
- `party?: number`: Contributing party index (defaults to `0`)
- `dialog?: number`: Related dialog index
- `session?: number | number[]`: Related Session index or indices (at least one of `dialog` or `session` is required; neither is defaulted)
- `mediatype?: string`: Media type
- `filename?: string`: Original filename
- `body?: any`: Inline content
- `encoding?: string`: Content encoding (`base64url`, `json`, `none`)
- `url?: string`: External URL (`content_hash` recommended, not required)
- `content_hash?: string | string[]`: Content hash (`sha512-<base64url>`; single or array for multiple algorithms)

#### Methods

- `toDict()`: Converts to plain object
- `addExternalData(url, mediatype, options?)`: Adds external reference
- `addInlineData(body, mediatype, options?)`: Adds inline content
- `isExternalData()`: Checks if has external data
- `isInlineData()`: Checks if has inline data
- `validate()`: Validates against vcon-core

### Session

`new Session({ start?, duration?, parties?, originator?, session_id?, sessions?, dialog? })`. `parties` are the receivers (the first is the implied originator); `originator` is only set when it is not the first party. `toDict()` omits unset parameters, and an empty Session is `{}`. `SessionReference(session, type, description?)` is a Session_Reference Object. `validateSession()` checks a Session object.

### Event

`new Event({ type, time, sessions?, party?, dialog?, channel?, contributors?, button?, transferee?, transfer_target?, consultation?, target_session?, ...extension })`. The constructor enforces the parameter table of core-05 §4.3.1.5 (`EVENT_PARAMETER_RULES`; `validate: false` skips it). `validateEvent()` checks an Event object. `CORE_EVENT_TYPES` lists the thirteen core types.

### PartyHistory (deprecated)

The 0.4.0 Dialog `party_history` entry. Constructing one warns. Convert it with `toEvent(sessions)`.

```typescript
new PartyHistory(party: number, event: string, time: Date | string, button?: string).toEvent(sessions)
```

### Migration

- `migrate040To050(vcon, { strict? })`: returns `{ vcon, report }`. Throws `MigrationError`.
- `MigrationReport`: `inferred`, `fallbacks`, `unresolved`, `notes`, `removedDialogs`, `resignRequired`, `stepsRun`, `entries`, `summary()`, `toDict()`.
- `MIGRATION_STEPS`: the table of steps T1 to T15 in execution order.

### SessionId### SessionId

Session identifier object per RFC 7989.

#### Properties

- `local: string`: Local UUID as defined in RFC 7989
- `remote: string`: Remote UUID as defined in RFC 7989

### Constants

```typescript
import { VCON_VERSION } from 'vcon-js';

console.log(VCON_VERSION); // '0.5.0'
```

## Tutorial Examples

The `examples/` directory contains three comprehensive tutorials demonstrating real-world usage. Each builds a valid core-05 vCon and prints `isValid()`. None of them records a lawful basis; add a `lawful_basis` attachment before using the pattern for real conversations.

### Example 1: Text Chat Conversation

**File:** `examples/01-text-chat.ts`
**Run:** `npm run example:chat`

A customer support chat conversation demonstrating:
- Creating parties with different identifiers (tel, mailto)
- One Session for the chat, with each message a text Dialog from its sender
- Building a multi-turn text conversation
- Setting conversation subject and tags
- Serializing and deserializing vCons

```typescript
// Quick start - text chat
const vcon = Vcon.buildNew();
vcon.addParty(new Party({ tel: '+1-555-123-4567', name: 'Customer', role: 'customer' }));
vcon.addParty(new Party({ mailto: 'agent@company.com', name: 'Agent', role: 'agent' }));

const session = vcon.addSession(new Session({ start: new Date(), parties: [0, 1] }));
vcon.addDialog(new Dialog({
  type: 'text',
  start: new Date().toISOString(),
  parties: [0],  // the sender
  body: 'Hi, I need help with my account.',
  mediatype: 'text/plain',
  encoding: 'none'
}), session);
```

### Example 2: Phone Call Recording with Analysis

**File:** `examples/02-call-recording.ts`
**Run:** `npm run example:call`

An insurance claim phone call demonstrating:
- Recording type dialogs with duration
- External media references with content_hash
- Party validation (STIR/SHAKEN)
- Multiple analysis types (transcription, sentiment, topic classification)
- Contact center extensions
- Call events (join, hold, resume, drop) as Event Objects

```typescript
// Quick start - call recording
const vcon = Vcon.buildNew();
vcon.addExtension('contact_center');

const session = vcon.addSession(new Session({ start: new Date(), duration: 847, parties: [0, 1] }));
const recordingDialog = new Dialog({
  type: 'recording',
  start: new Date().toISOString(),
  parties: [0, 1],
  duration: 847,
  campaign: 'claims-inbound'
});
vcon.addDialog(recordingDialog, session);

recordingDialog.addExternalData(
  'https://storage.example.com/call.wav',
  'audio/wav',
  { content_hash: 'sha512-abc123...' }
);

vcon.addAnalysis({
  type: 'transcription',
  dialog: 0,
  vendor: 'whisper',
  product: 'large-v3',
  body: { segments: [...] }
});
```

### Example 3: Video Conference with Attachments

**File:** `examples/03-video-conference.ts`
**Run:** `npm run example:conference`

A multi-party product roadmap meeting demonstrating:
- 5+ party conferences
- Video recording dialogs in a meeting Session
- Join and drop Events
- An incomplete dialog for a failed join attempt, in a Session related to the meeting by a Session_Reference
- Multiple attachments (presentations, notes, chat transcripts)
- Inline and external content storage
- Meeting-specific analysis (action items, summaries)
- Validation of the dialogs and the whole vCon

```typescript
// Quick start - video conference
const vcon = Vcon.buildNew();
vcon.subject = 'Q1 Product Roadmap Review';
vcon.addExtension('meeting');

// Add multiple participants
['Host', 'Engineer', 'Designer', 'QA', 'Marketing'].forEach((role, i) => {
  vcon.addParty(new Party({ mailto: `${role.toLowerCase()}@company.com`, role: i === 0 ? 'host' : 'participant' }));
});

// Add the meeting Session and its recording
const meeting = vcon.addSession(new Session({ start: new Date(), duration: 3720, parties: [0, 1, 2, 3, 4] }));
vcon.addDialog(new Dialog({
  type: 'recording',
  start: new Date().toISOString(),
  parties: [0, 1, 2, 3, 4],
  duration: 3720,
  application: 'zoom'
}), meeting);

// Add attachments, scoped to the meeting
vcon.addAttachment({
  purpose: 'presentation',
  filename: 'roadmap.pptx',
  body: '...',
  encoding: 'base64url',
  mediatype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  session: meeting
});
```

### Running All Examples

```bash
# Run individual examples
npm run example:chat        # Text chat conversation
npm run example:call        # Phone call with analysis
npm run example:conference  # Video conference

# Run all examples
npm run examples
```

## vcon-core Compliance

This library implements [draft-ietf-vcon-vcon-core-05](https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core), including:

- **Syntax parameter**: `0.5.0` written; `0.4.0` read and migrated (Appendix A.1). The `vcon` parameter is optional.
- **Sessions and Events**: top-level `sessions` (with Session_Reference types `child`, `peer`, `precursor`, `breakout`) and `events` arrays; at least one Session when there is dialog or events; the per-type Event parameter table
- **Dialog Types**: `recording`, `text`, `incomplete`; empty `{}` placeholder Dialogs; `audio` and `video` accepted on read with a warning and never written
- **Attachments**: `party` plus `dialog` or `session`; scope is never invented
- **Redaction and amendment**: `redacted_from`, `amended_from` (exclusive), `redacted_strings` with `__REDACTED_REF_#` checks, Dialog `redacted_segments`
- **Signing**: JWS `alg` `none` rejected on sign and verify
- **Extensions**: `extensions` MUST list every extension in use; every `critical` entry must be listed
- **Dispositions**: `no-answer`, `congestion`, `failed`, `busy`, `hung-up`, `voicemail-no-message`
- **Encodings**: `base64url`, `json`, `none`
- **Content Hash**: SHA-512 hash format for external references (supports array for multiple algorithms)
- **Analysis source**: keyed off `dialog`, `sessions`, `attachment` and/or `analysis` (all optional; `vendor` is required)
- **Party Identifiers**: tel, sip, mailto, stir, did, uuid; plus `type`, `org`, `dept`
- **Date Format**: RFC3339 timestamps
- **SessionId**: Object with `local` and `remote` UUIDs per RFC 7989
- **Message ID**: Support for `message_id` parameter in dialogs for cross-referencing

The core-05 Appendix B examples and the library's output are validated against the Appendix C JSON Schema in the test suite (`src/__tests__/fixtures/`).

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npm run lint         # Run ESLint
npm run format       # Format with Prettier
```

## License

MIT
