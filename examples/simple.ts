import { Vcon, Party, Dialog, Session } from '../src';

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

// Add a Session. Core-05 needs one when there is dialog; its parties are the
// receivers and the first party is the implied originator.
const session = vcon.addSession(new Session({ start: new Date(), parties: [0, 1] }));

// Add a text dialog. A text Dialog's parties are the sender only.
const textDialog = new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0], // John sends
  body: 'Hello, I need help with my account.',
  mediatype: 'text/plain',
  encoding: 'none'
});

vcon.addDialog(textDialog, session);

// Add a response dialog
const responseDialog = new Dialog({
  type: 'text',
  start: new Date(Date.now() + 1000), // 1 second later
  parties: [1], // Jane sends
  body: 'Hello John, how can I assist you today?',
  mediatype: 'text/plain',
  encoding: 'none'
});

vcon.addDialog(responseDialog, session);

// Add an attachment. With exactly one Session it is scoped to that Session.
vcon.addAttachment({
  purpose: 'document',
  mediatype: 'application/pdf',
  body: 'base64urlEncodedContent',
  encoding: 'base64url'
});

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

// Validate against core-05
console.log('Valid:', vcon.isValid());
// No lawful basis is recorded here; add a purpose "lawful_basis" attachment for real use.
console.log('Has lawful basis:', vcon.hasLawfulBasis());

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