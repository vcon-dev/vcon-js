# vcon-js

A JavaScript/TypeScript library for creating and managing vCons (Virtual Conversations), compliant with IETF draft-ietf-vcon-vcon-core-01.

## Project Overview

This library provides a complete implementation of the vCon specification for JavaScript/TypeScript environments. vCon is a standardized JSON format for representing conversational data, encompassing metadata, conversation media, related documents, and analysis.

## Architecture

```
src/
├── types.ts        # TypeScript type definitions for vcon-core-01
├── vcon.ts         # Main Vcon class for managing conversation containers
├── party.ts        # Party and PartyHistory classes
├── dialog.ts       # Dialog class for conversation segments
├── attachment.ts   # Attachment class for related files
├── index.ts        # Public API exports
└── __tests__/      # Jest test files
    ├── vcon.test.ts
    ├── party.test.ts
    ├── dialog.test.ts
    ├── attachment.test.ts
    └── utils.ts    # Test utilities for loading synthetic vCons

test-vcons/         # Synthetic test data (261 vCon files across 19 categories)
examples/           # Usage examples
```

## Key Classes

### Vcon
The main container class. Use `Vcon.buildNew()` to create a new vCon or `Vcon.buildFromJson(json)` to parse existing JSON.

### Party
Represents conversation participants with identifiers (tel, sip, mailto, stir, did, uuid) and metadata.

### Dialog
Represents conversation segments. Four types per vcon-core-01: `recording`, `text`, `transfer`, `incomplete`.

### Attachment
Represents attached files. Can be inline (body/encoding) or external (url/content_hash).

## vcon-core-01 Compliance

The library implements draft-ietf-vcon-vcon-core-01:

- **Dialog types**: recording, text, transfer, incomplete
- **Dispositions** (for incomplete): no-answer, congestion, failed, busy, hung-up, voicemail-no-message
- **Encodings**: base64url, json, none (note: base64 is NOT valid per spec)
- **Extensions**: support for `extensions` and `critical` arrays
- **Content hash**: SHA-512 format for external references
- **Timestamps**: RFC3339 format

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm test             # Run Jest tests (61 tests)
npm run lint         # Run ESLint
npm run format       # Format with Prettier

# Tutorial examples
npm run example:chat        # Text chat conversation
npm run example:call        # Phone call with analysis
npm run example:conference  # Video conference with attachments
npm run examples            # Run all examples
```

## Tutorial Examples

Three comprehensive examples in `examples/` directory:

1. **01-text-chat.ts** - Customer support chat demonstrating text dialogs, parties, tags, serialization
2. **02-call-recording.ts** - Phone call with transcription/sentiment analysis, party history, contact center extension
3. **03-video-conference.ts** - Multi-party meeting with attachments, groups, incomplete dialogs, validation

## Testing

Tests use Jest with ts-jest preset. Synthetic test vCons in `test-vcons/` directory provide real-world conversation scenarios for validation. Test utilities in `src/__tests__/utils.ts` help load these fixtures.

## Key Implementation Notes

1. **Date handling**: Dates are stored as ISO strings (RFC3339) in serialized output, but can be passed as Date objects or strings to constructors.

2. **Encoding validation**: Only `base64url`, `json`, and `none` are valid encodings per vcon-core-01. The older `base64` is not supported.

3. **parties field**: Can be a single integer or array of integers per vcon-core-01.

4. **created_at is immutable**: Once set, should not be changed. Use `updated_at` to track modifications.

5. **Extension framework**: Use `addExtension()` for optional extensions, `addCriticalExtension()` for required ones.

## Common Tasks

### Creating a vCon with conversation
```typescript
const vcon = Vcon.buildNew();
vcon.addParty(new Party({ tel: '+1234567890', name: 'Agent', role: 'agent' }));
vcon.addParty(new Party({ tel: '+0987654321', name: 'Customer', role: 'customer' }));
vcon.addDialog(new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0, 1],
  body: 'Hello!',
  mediatype: 'text/plain'
}));
```

### Adding external media reference
```typescript
const dialog = new Dialog({ type: 'recording', start: new Date(), parties: [0, 1] });
dialog.addExternalData('https://example.com/audio.wav', 'audio/wav', {
  filename: 'call.wav',
  content_hash: 'sha512-abc123...'
});
```

### Adding analysis
```typescript
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 0,
  vendor: 'analyzer-service',
  product: 'v2',
  body: { score: 0.8, label: 'positive' },
  encoding: 'json'
});
```
