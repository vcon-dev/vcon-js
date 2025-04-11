import { Vcon, Party, Dialog } from '../src';

// Create a new vCon
const vcon = Vcon.buildNew();

// Add parties
const party1 = new Party({
  tel: '+1234567890',
  name: 'John Doe',
  role: 'customer'
});

const party2 = new Party({
  tel: '+0987654321',
  name: 'Jane Smith',
  role: 'agent'
});

vcon.addParty(party1);
vcon.addParty(party2);

// Add a text dialog
const textDialog = new Dialog({
  type: 'text/plain',
  start: new Date(),
  parties: [0, 1], // References to party indices
  originator: 0,
  body: 'Hello, I need help with my account.',
  mimetype: 'text/plain'
});

vcon.addDialog(textDialog);

// Add a response dialog
const responseDialog = new Dialog({
  type: 'text/plain',
  start: new Date(Date.now() + 1000), // 1 second later
  parties: [0, 1],
  originator: 1,
  body: 'Hello John, how can I assist you today?',
  mimetype: 'text/plain'
});

vcon.addDialog(responseDialog);

// Add an attachment
vcon.addAttachment(
  'application/pdf',
  'base64EncodedContent',
  'base64'
);

// Add analysis
vcon.addAnalysis({
  type: 'sentiment',
  dialog: [0, 1], // Analyze both dialogs
  vendor: 'sentiment-analyzer',
  body: {
    score: 0.8,
    label: 'positive'
  }
});

// Add tags
vcon.addTag('category', 'support');
vcon.addTag('priority', 'medium');

// Convert to JSON
const json = vcon.toJson();
console.log('vCon JSON:', json);

// Load from JSON
const loadedVcon = Vcon.buildFromJson(json);
console.log('Loaded vCon UUID:', loadedVcon.uuid);
console.log('Loaded vCon parties:', loadedVcon.parties.length);
console.log('Loaded vCon dialogs:', loadedVcon.dialog.length);
console.log('Loaded vCon attachments:', loadedVcon.attachments.length);
console.log('Loaded vCon analysis:', loadedVcon.analysis.length);
console.log('Loaded vCon tags:', loadedVcon.tags); 