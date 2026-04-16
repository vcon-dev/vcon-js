# vcon-js

A JavaScript/TypeScript library for creating and managing vCons (Virtual Conversations), compliant with [IETF draft-ietf-vcon-vcon-core-02](https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core-02).

## Installation

```bash
npm install vcon-js
```

## Usage

### Creating a new vCon

```typescript
import { Vcon, Party, Dialog } from 'vcon-js';

// Create a new vCon
const vcon = Vcon.buildNew();

// Add parties
const party1 = new Party({
  tel: '+1234567890',
  name: 'John Doe',
  role: 'agent'
});
const party2 = new Party({
  tel: '+0987654321',
  name: 'Jane Smith',
  role: 'customer'
});

vcon.addParty(party1);
vcon.addParty(party2);

// Add a text dialog
const dialog = new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0, 1],
  body: 'Hello, this is a conversation!',
  mediatype: 'text/plain'
});

vcon.addDialog(dialog);

// Convert to JSON
const json = vcon.toJson();
```

### Loading from JSON

```typescript
import { Vcon } from 'vcon-js';

const jsonString = '...'; // Your vCon JSON string
const vcon = Vcon.buildFromJson(jsonString);
```

### Working with Attachments

```typescript
import { Vcon, Attachment } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add an inline attachment
const attachment = vcon.addAttachment({
  type: 'application/pdf',
  body: 'base64EncodedContent',
  encoding: 'base64url',
  filename: 'document.pdf'
});

// Add an external attachment
vcon.addAttachment({
  purpose: 'transcript',
  url: 'https://example.com/transcript.txt',
  content_hash: 'sha512-abc123...',
  mediatype: 'text/plain'
});

// Find an attachment by type
const pdfAttachment = vcon.findAttachmentByType('application/pdf');

// Find an attachment by purpose
const transcript = vcon.findAttachmentByPurpose('transcript');
```

### Working with Analysis

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add inline analysis
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 0,
  vendor: 'sentiment-analyzer',
  product: 'analyzer-v2',
  body: {
    score: 0.8,
    label: 'positive'
  },
  encoding: 'json'
});

// Add analysis with external reference
vcon.addAnalysis({
  type: 'transcription',
  dialog: [0, 1],
  vendor: 'whisper',
  url: 'https://example.com/transcription.json',
  content_hash: 'sha512-xyz789...',
  mediatype: 'application/json'
});

// Find analysis by type
const sentimentAnalysis = vcon.findAnalysisByType('sentiment');
```

### Working with Dialog Types

vcon-core-02 defines four dialog types: `recording`, `text`, `transfer`, and `incomplete`.

```typescript
import { Dialog } from 'vcon-js';

// Text dialog
const textDialog = new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0, 1],
  body: 'Hello!',
  mediatype: 'text/plain'
});

// Recording dialog with external audio
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

// Incomplete dialog (e.g., no answer)
const incompleteDialog = new Dialog({
  type: 'incomplete',
  start: new Date(),
  parties: [0],
  disposition: 'no-answer'
});

// Check dialog types
console.log(textDialog.isText()); // true
console.log(recordingDialog.isRecording()); // true
console.log(incompleteDialog.isIncomplete()); // true
```

### Working with Extensions (vcon-core-02)

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

### Working with Groups

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add a group reference (for linking related vCons)
vcon.addGroup({ uuid: 'conversation-thread-uuid', type: 'thread' });
```

### Working with Tags

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add a tag
vcon.addTag('category', 'support');

// Get a tag
const category = vcon.getTag('category');
```

### Working with Party History

Track party events within a dialog (join, drop, hold, unhold, mute, unmute, keydown, keyup):

```typescript
import { Dialog, PartyHistory } from 'vcon-js';

const dialog = new Dialog({
  type: 'recording',
  start: new Date(),
  parties: [0, 1]
});

// Add party history events
dialog.party_history = [
  new PartyHistory(0, 'join', new Date()).toDict(),
  new PartyHistory(1, 'join', new Date(Date.now() + 5000)).toDict(),
  new PartyHistory(1, 'hold', new Date(Date.now() + 60000)).toDict(),
  new PartyHistory(1, 'unhold', new Date(Date.now() + 120000)).toDict(),
  // DTMF keypress events (button parameter required for keydown/keyup)
  new PartyHistory(0, 'keydown', new Date(Date.now() + 150000), '5').toDict(),
  new PartyHistory(0, 'keyup', new Date(Date.now() + 150100), '5').toDict(),
  new PartyHistory(0, 'drop', new Date(Date.now() + 300000)).toDict(),
  new PartyHistory(1, 'drop', new Date(Date.now() + 300000)).toDict()
];
```

### Transfer Dialogs

Represent call transfers between parties:

```typescript
import { Dialog } from 'vcon-js';

const transferDialog = new Dialog({
  type: 'transfer',
  start: new Date(),
  parties: [0, 1, 2],  // Original caller, original agent, new agent
  transferor: 1,       // Agent initiating transfer
  transferee: 0,       // Caller being transferred
  transfer_target: 2   // New agent receiving transfer
});
```

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

vcon-core-02 supports multiple party identifier types:

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
- `buildFromJson(jsonString: string)`: Creates a vCon from JSON string

#### Instance Methods

- `addParty(party: Party)`: Adds a party to the vCon
- `addDialog(dialog: Dialog)`: Adds a dialog to the vCon
- `addAttachment(params)`: Adds an attachment (inline or external)
- `addAnalysis(params)`: Adds analysis data
- `addTag(tagName, tagValue)`: Adds a tag
- `addExtension(name)`: Adds a non-critical extension
- `addCriticalExtension(name)`: Adds a critical extension
- `addGroup(group)`: Adds a group reference
- `findPartyIndex(by, val)`: Finds a party index by property
- `findDialog(by, val)`: Finds a dialog by property
- `findAttachmentByType(type)`: Finds an attachment by type
- `findAttachmentByPurpose(purpose)`: Finds an attachment by purpose
- `findAnalysisByType(type)`: Finds analysis by type
- `hasExtension(name)`: Checks if extension is used
- `isCriticalExtension(name)`: Checks if extension is critical
- `getTag(tagName)`: Gets a tag value
- `toJson()`: Converts the vCon to JSON string
- `toDict()`: Converts the vCon to a plain object

#### Properties

- `uuid`: Unique identifier
- `vcon`: Version string
- `created_at`: Creation timestamp (RFC3339)
- `updated_at`: Last modification timestamp
- `subject`: Conversation subject
- `parties`: Array of parties
- `dialog`: Array of dialogs
- `attachments`: Array of attachments
- `analysis`: Array of analysis results
- `tags`: Tag dictionary
- `extensions`: Non-critical extensions array
- `critical`: Critical extensions array
- `group`: Group references
- `redacted`: Redaction reference
- `amended`: Amendment reference
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
- `validate()`: Validates against vcon-core-02 recommendations

### Dialog

Class for representing dialogs in a vCon.

#### Static Constants

```typescript
Dialog.DIALOG_TYPES     // ['recording', 'text', 'transfer', 'incomplete']
Dialog.DISPOSITIONS     // ['no-answer', 'congestion', 'failed', 'busy', 'hung-up', 'voicemail-no-message']
Dialog.VALID_ENCODINGS  // ['base64url', 'json', 'none']
```

#### Properties

- `type: string`: Dialog type (`recording`, `text`, `transfer`, `incomplete`)
- `start: Date | string`: Start time (RFC3339)
- `parties?: number | number[]`: Party indices
- `originator?: number`: Originator party index
- `mediatype?: string`: MIME type
- `filename?: string`: Original filename
- `body?: string`: Inline content
- `encoding?: string`: Content encoding (`base64url`, `json`, `none`)
- `url?: string`: External URL reference
- `content_hash?: string | string[]`: Content hash for external files (single or array)
- `duration?: number`: Duration in seconds
- `disposition?: string`: Disposition for incomplete dialogs
- `session_id?: SessionId`: Session identifier (with `local` and `remote` UUIDs per RFC 7989)
- `party_history?: PartyHistory[]`: Party event history
- `application?: string`: Application that created the dialog (e.g., 'zoom', 'teams')
- `message_id?: string`: Message identifier for cross-referencing (e.g., SMTP message-id)

#### Methods

- `toDict()`: Converts to plain object
- `addExternalData(url, mediatype, options?)`: Adds external data reference
- `addInlineData(body, mediatype, options?)`: Adds inline data
- `isExternalData()`: Checks if has external data
- `isInlineData()`: Checks if has inline data
- `isText()`: Checks if text type
- `isRecording()`: Checks if recording type
- `isTransfer()`: Checks if transfer type
- `isIncomplete()`: Checks if incomplete type
- `isAudio()`: Checks if audio content
- `isVideo()`: Checks if video content
- `isEmail()`: Checks if email content
- `validate()`: Validates against vcon-core-02

### Attachment

Class for representing attachments in a vCon.

#### Static Constants

```typescript
Attachment.VALID_ENCODINGS  // ['base64url', 'json', 'none']
```

#### Properties

- `type?: string`: Attachment type (MIME type)
- `purpose?: string`: Purpose/category
- `start?: Date | string`: Reference time
- `party?: number`: Related party index
- `dialog?: number | number[]`: Related dialog indices
- `mediatype?: string`: Media type
- `filename?: string`: Original filename
- `body?: any`: Inline content
- `encoding?: string`: Content encoding
- `url?: string`: External URL
- `content_hash?: string | string[]`: Content hash (single or array for multiple algorithms)

#### Methods

- `toDict()`: Converts to plain object
- `addExternalData(url, mediatype, options?)`: Adds external reference
- `addInlineData(body, mediatype, options?)`: Adds inline content
- `isExternalData()`: Checks if has external data
- `isInlineData()`: Checks if has inline data
- `validate()`: Validates against vcon-core-02

### PartyHistory

Class for tracking party events within a dialog.

#### Static Constants

```typescript
PartyHistory.VALID_EVENTS  // ['join', 'drop', 'hold', 'unhold', 'mute', 'unmute', 'keydown', 'keyup']
```

#### Constructor

```typescript
new PartyHistory(party: number, event: string, time: Date | string, button?: string)
```

#### Properties

- `party: number`: Party index
- `event: string`: Event type (`join`, `drop`, `hold`, `unhold`, `mute`, `unmute`, `keydown`, `keyup`)
- `time: Date | string`: Event timestamp
- `button?: string`: DTMF digit or button label (required for `keydown`/`keyup` events)

#### Methods

- `toDict()`: Converts to plain object with ISO timestamp
- `static fromDict(data)`: Creates PartyHistory from plain object
- `validate()`: Validates event type and button requirement

### SessionId

Session identifier object per RFC 7989.

#### Properties

- `local: string`: Local UUID as defined in RFC 7989
- `remote: string`: Remote UUID as defined in RFC 7989

### Constants

```typescript
import { VCON_VERSION } from 'vcon-js';

console.log(VCON_VERSION); // '0.4.0'
```

## Tutorial Examples

The `examples/` directory contains three comprehensive tutorials demonstrating real-world usage:

### Example 1: Text Chat Conversation

**File:** `examples/01-text-chat.ts`
**Run:** `npm run example:chat`

A customer support chat conversation demonstrating:
- Creating parties with different identifiers (tel, mailto)
- Building a multi-turn text conversation
- Setting conversation subject and tags
- Serializing and deserializing vCons

```typescript
// Quick start - text chat
const vcon = Vcon.buildNew();
vcon.addParty(new Party({ tel: '+1-555-123-4567', name: 'Customer', role: 'customer' }));
vcon.addParty(new Party({ mailto: 'agent@company.com', name: 'Agent', role: 'agent' }));

vcon.addDialog(new Dialog({
  type: 'text',
  start: new Date().toISOString(),
  parties: [0, 1],
  originator: 0,
  body: 'Hi, I need help with my account.',
  mediatype: 'text/plain'
}));
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
- Party history tracking (join, hold, resume, leave events)

```typescript
// Quick start - call recording
const vcon = Vcon.buildNew();
vcon.addExtension('contact_center');

const recordingDialog = new Dialog({
  type: 'recording',
  start: new Date().toISOString(),
  parties: [0, 1],
  duration: 847,
  campaign: 'claims-inbound'
});

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
- Video recording dialogs
- Incomplete dialogs (failed join attempts)
- Multiple attachments (presentations, notes, chat transcripts)
- Inline and external content storage
- Group references for meeting series
- Meeting-specific analysis (action items, summaries)
- Validation of dialog objects

```typescript
// Quick start - video conference
const vcon = Vcon.buildNew();
vcon.subject = 'Q1 Product Roadmap Review';
vcon.addExtension('meeting');

// Add multiple participants
['Host', 'Engineer', 'Designer', 'QA', 'Marketing'].forEach((role, i) => {
  vcon.addParty(new Party({ mailto: `${role.toLowerCase()}@company.com`, role: i === 0 ? 'host' : 'participant' }));
});

// Add recording with party history
const videoDialog = new Dialog({
  type: 'recording',
  start: new Date().toISOString(),
  parties: [0, 1, 2, 3, 4],
  duration: 3720,
  application: 'zoom'
});

// Add attachments
vcon.addAttachment({
  purpose: 'presentation',
  filename: 'roadmap.pptx',
  body: '...',
  encoding: 'base64url'
});

// Link to meeting series
vcon.addGroup({ uuid: 'roadmap-series-2025', type: 'meeting-series' });
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

## vcon-core-02 Compliance

This library implements the [IETF draft-ietf-vcon-vcon-core-02](https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core-02) specification, including:

- **Version**: `0.4.0` (note: the `vcon` parameter is DEPRECATED per Section 4.1.1)
- **Dialog Types**: `recording`, `text`, `transfer`, `incomplete`
- **Dispositions**: `no-answer`, `congestion`, `failed`, `busy`, `hung-up`, `voicemail-no-message`
- **Encodings**: `base64url`, `json`, `none`
- **Content Hash**: SHA-512 hash format for external references (supports array for multiple algorithms)
- **Extensions**: Support for `extensions` and `critical` arrays
- **Party Identifiers**: tel, sip, mailto, stir, did, uuid
- **Date Format**: RFC3339 timestamps
- **SessionId**: Object with `local` and `remote` UUIDs per RFC 7989
- **PartyHistory Events**: `join`, `drop`, `hold`, `unhold`, `mute`, `unmute`, `keydown`, `keyup`
- **Message ID**: Support for `message_id` parameter in dialogs for cross-referencing
- **Redacted/Amended**: Enhanced with `type`, `url`, and `content_hash` parameters

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests (61 tests)
npm run lint         # Run ESLint
npm run format       # Format with Prettier
```

## License

MIT
