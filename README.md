# vcon-js

A JavaScript library for creating and managing vCons (Virtual Conversations).

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
  name: 'John Doe'
});
const party2 = new Party({
  tel: '+0987654321',
  name: 'Jane Smith'
});

vcon.addParty(party1);
vcon.addParty(party2);

// Add a dialog
const dialog = new Dialog({
  type: 'text/plain',
  start: new Date(),
  parties: [0, 1], // References to party indices
  body: 'Hello, this is a conversation!',
  mimetype: 'text/plain'
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

// Add an attachment
const attachment = vcon.addAttachment(
  'application/pdf',
  'base64EncodedContent',
  'base64'
);

// Find an attachment by type
const pdfAttachment = vcon.findAttachmentByType('application/pdf');
```

### Working with Analysis

```typescript
import { Vcon } from 'vcon-js';

const vcon = Vcon.buildNew();

// Add analysis
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 0, // Reference to dialog index
  vendor: 'sentiment-analyzer',
  body: {
    score: 0.8,
    label: 'positive'
  }
});

// Find analysis by type
const sentimentAnalysis = vcon.findAnalysisByType('sentiment');
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

## API Reference

### Vcon

The main class for working with vCons.

#### Methods

- `static buildNew()`: Creates a new vCon
- `static buildFromJson(jsonString: string)`: Creates a vCon from JSON
- `addParty(party: Party)`: Adds a party to the vCon
- `addDialog(dialog: Dialog)`: Adds a dialog to the vCon
- `addAttachment(type: string, body: any, encoding?: Encoding)`: Adds an attachment
- `addAnalysis(params: AnalysisParams)`: Adds analysis data
- `addTag(tagName: string, tagValue: string)`: Adds a tag
- `findPartyIndex(by: string, val: string)`: Finds a party index
- `findDialog(by: string, val: any)`: Finds a dialog
- `findAttachmentByType(type: string)`: Finds an attachment by type
- `findAnalysisByType(type: string)`: Finds analysis by type
- `getTag(tagName: string)`: Gets a tag value
- `toJson()`: Converts the vCon to JSON
- `toDict()`: Converts the vCon to a dictionary

### Party

Class for representing parties in a vCon.

#### Properties

- `tel?: string`: Telephone number
- `stir?: string`: STIR identifier
- `mailto?: string`: Email address
- `name?: string`: Display name
- `validation?: string`: Validation information
- `gmlpos?: string`: GML position
- `civicaddress?: CivicAddress`: Civic address
- `uuid?: string`: UUID
- `role?: string`: Role
- `contact_list?: string`: Contact list
- `meta?: Record<string, any>`: Additional metadata

### Dialog

Class for representing dialogs in a vCon.

#### Properties

- `type: string`: Dialog type
- `start: Date`: Start time
- `parties: number[]`: Party indices
- `originator?: number`: Originator party index
- `mimetype?: string`: MIME type
- `filename?: string`: Filename
- `body?: string`: Dialog content
- `encoding?: string`: Content encoding
- `url?: string`: External URL
- `signature?: string`: Digital signature
- `duration?: number`: Duration in seconds
- `meta?: Record<string, any>`: Additional metadata

#### Methods

- `addExternalData(url: string, filename: string, mimetype: string)`: Adds external data
- `addInlineData(body: string, filename: string, mimetype: string)`: Adds inline data
- `isExternalData()`: Checks if dialog has external data
- `isInlineData()`: Checks if dialog has inline data
- `isText()`: Checks if dialog is text
- `isAudio()`: Checks if dialog is audio
- `isVideo()`: Checks if dialog is video
- `isEmail()`: Checks if dialog is email

### Attachment

Class for representing attachments in a vCon.

#### Properties

- `type: string`: Attachment type
- `body: any`: Attachment content
- `encoding: Encoding`: Content encoding

## License

MIT 