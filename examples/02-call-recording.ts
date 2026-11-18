/**
 * Example 2: Phone Call Recording with Analysis
 *
 * This example demonstrates creating a vCon for a recorded phone call
 * with transcription and sentiment analysis.
 *
 * Key concepts covered:
 * - Recording type dialogs inside a Session
 * - Party events (join, hold, drop) as Event Objects
 * - External media references with content_hash
 * - Adding transcription analysis
 * - Adding sentiment analysis
 * - Using extensions for specialized features
 * - Party validation and identifiers
 */

import { Vcon, Party, Dialog, Session, Event } from '../src';

console.log('=== Example 2: Phone Call Recording with Analysis ===\n');

// Step 1: Create a new vCon for a phone call
const vcon = Vcon.buildNew();
vcon.subject = 'Insurance Claim Discussion';

// Add contact center extension to indicate this uses CC-specific features
vcon.addExtension('contact_center');

console.log(`Created vCon: ${vcon.uuid}`);
console.log(`Extensions: ${vcon.extensions}\n`);

// Step 2: Add parties with full identity information
const caller = new Party({
  tel: '+1-555-867-5309',
  name: 'Maria Garcia',
  role: 'customer',
  timezone: 'America/Chicago',
  validation: 'verified',  // STIR/SHAKEN verified caller
  civicaddress: {
    country: 'US',
    a1: 'TX',  // State
    a3: 'Austin',  // City
    pc: '78701'  // Postal code
  }
});

const agentParty = new Party({
  tel: '+1-800-555-1234',
  sip: 'sip:agent42@insurance.example.com',
  mailto: 'maria.agent@insurance.example.com',
  name: 'James Wilson',
  role: 'agent',
  timezone: 'America/New_York',
  // Extension fields for contact center
  id: 'agent-42',
  meta: {
    department: 'Claims',
    skill_level: 'senior'
  }
});

vcon.addParty(caller);
vcon.addParty(agentParty);

// Demonstrate party validation
console.log('Party validation:');
console.log(`  Caller has identifier: ${caller.hasIdentifier()}`);
console.log(`  Caller primary ID: ${caller.getPrimaryIdentifier()}`);
console.log(`  Agent has identifier: ${agentParty.hasIdentifier()}`);
console.log(`  Agent primary ID: ${agentParty.getPrimaryIdentifier()}\n`);

// Step 3: Create the call recording dialog
const callStart = new Date('2025-01-15T14:30:00-06:00');
const callDuration = 847; // 14 minutes 7 seconds

// The Session lists the receivers. The customer called, so parties [0, 1] makes
// the customer (the first party) the implied originator.
const session = vcon.addSession(new Session({
  start: callStart,
  duration: callDuration,
  parties: [0, 1]
}));

const recordingDialog = new Dialog({
  type: 'recording',
  start: callStart.toISOString(),
  parties: [0, 1],  // Contributors: one channel per party
  duration: callDuration,
  // Contact center specific fields
  campaign: 'claims-inbound',
  skill: 'auto-claims',
  interaction: 'voice'
});

// Add external reference to the audio file
recordingDialog.addExternalData(
  'https://storage.insurance.example.com/recordings/2025/01/15/call-abc123.wav',
  'audio/wav',
  {
    filename: 'call-abc123.wav',
    content_hash: 'sha512-Tf9OoDQfCoI_FdP08BqxLq4OXaV5zLhR-NvZ3-hMWLLN7iZA50Dh7hctp5Om55Vg5ff5vQWKEqKAQz7W-kZRCg'
  }
);

vcon.addDialog(recordingDialog, session);

// Track call events with Event Objects. In core-05 these replace the Dialog
// party_history; each Event lists the Session(s) it applies to.
const at = (ms: number) => new Date(callStart.getTime() + ms);
const events = [
  new Event({ type: 'join', time: at(0), sessions: session, party: 0 }),
  new Event({ type: 'join', time: at(15000), sessions: session, party: 1 }),      // Agent joined after 15s
  new Event({ type: 'hold', time: at(300000), sessions: session, party: 1 }),     // Put on hold at 5 min
  new Event({ type: 'unhold', time: at(420000), sessions: session, party: 1 }),   // Resumed at 7 min
  new Event({ type: 'drop', time: at(callDuration * 1000), sessions: session, party: 0 }),
  new Event({ type: 'drop', time: at(callDuration * 1000 + 2000), sessions: session, party: 1 })
];
events.forEach(e => vcon.addEvent(e));



console.log('Call recording details:');
console.log(`  Type: ${recordingDialog.type}`);
console.log(`  Duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`);
console.log(`  External URL: ${recordingDialog.url}`);
const hashPreview = Array.isArray(recordingDialog.content_hash)
  ? recordingDialog.content_hash[0]
  : recordingDialog.content_hash;
console.log(`  Content hash: ${hashPreview?.substring(0, 30)}...`);
console.log(`  Party events: ${vcon.events.length}\n`);

// Step 4: Add transcription analysis
vcon.addAnalysis({
  type: 'transcription',
  dialog: 0,
  vendor: 'openai',
  product: 'whisper-large-v3',
  schema: 'urn:ietf:params:vcon:analysis:transcription',
  mediatype: 'application/json',
  encoding: 'json',
  body: {
    language: 'en',
    confidence: 0.94,
    segments: [
      { start: 0, end: 5.2, speaker: 0, text: "Hi, I'm calling about my auto insurance claim." },
      { start: 5.5, end: 12.1, speaker: 1, text: "Hello, thank you for calling. I'd be happy to help you with your claim. May I have your policy number?" },
      { start: 12.5, end: 18.3, speaker: 0, text: "Yes, it's A-I-C seven four two nine eight one." },
      { start: 18.8, end: 25.0, speaker: 1, text: "Thank you, Ms. Garcia. I can see your claim for the fender bender on January 10th. How can I assist you today?" },
      { start: 25.5, end: 35.2, speaker: 0, text: "I wanted to check on the status. The repair shop said they submitted the estimate last week." },
      // ... more segments would follow
      { start: 830, end: 847, speaker: 1, text: "You're all set. The payment will be processed within 3 to 5 business days. Is there anything else I can help you with?" }
    ]
  }
});

console.log('Added transcription analysis');

// Step 5: Add sentiment analysis
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 0,
  vendor: 'internal',
  product: 'sentiment-analyzer-v2',
  schema: 'urn:ietf:params:vcon:analysis:sentiment',
  encoding: 'json',
  body: {
    overall_sentiment: 'positive',
    overall_score: 0.72,
    customer_sentiment: {
      start: 'neutral',
      middle: 'slightly_negative',  // During hold
      end: 'positive'
    },
    agent_sentiment: 'professional',
    key_moments: [
      { time: 300, event: 'frustration_detected', severity: 'low' },
      { time: 420, event: 'resolution_started', severity: 'positive' },
      { time: 800, event: 'satisfaction_expressed', severity: 'positive' }
    ]
  }
});

console.log('Added sentiment analysis');

// Step 6: Add topic classification
vcon.addAnalysis({
  type: 'topic-classification',
  dialog: 0,
  vendor: 'internal',
  product: 'topic-classifier-v1',
  encoding: 'json',
  body: {
    primary_topic: 'claim-status-inquiry',
    secondary_topics: ['payment-processing', 'repair-estimate'],
    confidence: 0.89,
    keywords: ['claim', 'estimate', 'payment', 'repair shop', 'fender bender']
  }
});

console.log('Added topic classification\n');

// Step 7: Add tags
vcon.addTag('call_type', 'inbound');
vcon.addTag('department', 'claims');
vcon.addTag('outcome', 'resolved');
vcon.addTag('follow_up_required', 'false');

// Step 8: Display summary
console.log('--- vCon Summary ---');
console.log(`UUID: ${vcon.uuid}`);
console.log(`Subject: ${vcon.subject}`);
console.log(`Parties: ${vcon.parties.length}`);
console.log(`Dialogs: ${vcon.dialog.length}`);
console.log(`Analysis items: ${vcon.analysis.length}`);
console.log(`Extensions: ${vcon.extensions?.join(', ')}`);
console.log(`Tags: ${JSON.stringify(vcon.tags)}`);

// Step 9: Validate the dialog and the whole vCon
const validation = recordingDialog.validate();
console.log(`\nDialog validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
if (validation.errors.length > 0) {
  console.log('Errors:', validation.errors);
}
const whole = vcon.isValid();
console.log(`vCon validation: ${whole.valid ? 'PASSED' : 'FAILED'}`);
if (!whole.valid) {
  console.log('Errors:', whole.errors);
  process.exit(1);
}
// This example records no lawful basis; a real recorded call needs a
// purpose "lawful_basis" attachment scoped to the Session.
console.log(`Carries a lawful_basis attachment: ${vcon.hasLawfulBasis()}`);

// Step 10: Output JSON (truncated for readability)
const jsonOutput = JSON.parse(vcon.toJson());
console.log('\n--- vCon JSON (structure) ---');
console.log(JSON.stringify({
  uuid: jsonOutput.uuid,
  vcon: jsonOutput.vcon,
  subject: jsonOutput.subject,
  created_at: jsonOutput.created_at,
  parties: `[${jsonOutput.parties.length} parties]`,
  sessions: `[${jsonOutput.sessions.length} session]`,
  events: `[${jsonOutput.events.length} events]`,
  dialog: `[${jsonOutput.dialog.length} dialog - recording type]`,
  analysis: `[${jsonOutput.analysis.length} analysis items]`,
  extensions: jsonOutput.extensions,
  tags: vcon.tags  // decoded from the purpose:"tags" attachment
}, null, 2));

console.log('\n=== Example 2 Complete ===');
