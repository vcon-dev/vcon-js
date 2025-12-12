/**
 * Example 2: Phone Call Recording with Analysis
 *
 * This example demonstrates creating a vCon for a recorded phone call
 * with transcription and sentiment analysis.
 *
 * Key concepts covered:
 * - Recording type dialogs
 * - External media references with content_hash
 * - Adding transcription analysis
 * - Adding sentiment analysis
 * - Using extensions for specialized features
 * - Party validation and identifiers
 */

import { Vcon, Party, Dialog, PartyHistory } from '../src';

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

const recordingDialog = new Dialog({
  type: 'recording',
  start: callStart.toISOString(),
  parties: [0, 1],
  originator: 0,  // Customer initiated the call
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
    content_hash: 'sha512-4dff4ea340f0a823f15d3f4f01ab62eae0e5da579ccb851f8db9dfe84c58b2b37b89903a740e1ee172da793a6e79d560e5f7f9bd058a12a280433ed6fa46510a'
  }
);

// Add party history to track call events
recordingDialog.party_history = [
  new PartyHistory(0, 'joined', callStart).toDict(),
  new PartyHistory(1, 'joined', new Date(callStart.getTime() + 15000)).toDict(),  // Agent joined after 15s
  new PartyHistory(1, 'hold', new Date(callStart.getTime() + 300000)).toDict(),   // Put on hold at 5 min
  new PartyHistory(1, 'resume', new Date(callStart.getTime() + 420000)).toDict(), // Resumed at 7 min
  new PartyHistory(0, 'left', new Date(callStart.getTime() + callDuration * 1000)).toDict(),
  new PartyHistory(1, 'left', new Date(callStart.getTime() + callDuration * 1000 + 2000)).toDict()
];

vcon.addDialog(recordingDialog);

console.log('Call recording details:');
console.log(`  Type: ${recordingDialog.type}`);
console.log(`  Duration: ${Math.floor(callDuration / 60)}m ${callDuration % 60}s`);
console.log(`  External URL: ${recordingDialog.url}`);
console.log(`  Content hash: ${recordingDialog.content_hash?.substring(0, 30)}...`);
console.log(`  Party events: ${recordingDialog.party_history?.length}\n`);

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

// Step 9: Validate the dialog
const validation = recordingDialog.validate();
console.log(`\nDialog validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
if (validation.errors.length > 0) {
  console.log('Errors:', validation.errors);
}

// Step 10: Output JSON (truncated for readability)
const jsonOutput = JSON.parse(vcon.toJson());
console.log('\n--- vCon JSON (structure) ---');
console.log(JSON.stringify({
  uuid: jsonOutput.uuid,
  vcon: jsonOutput.vcon,
  subject: jsonOutput.subject,
  created_at: jsonOutput.created_at,
  parties: `[${jsonOutput.parties.length} parties]`,
  dialog: `[${jsonOutput.dialog.length} dialog - recording type]`,
  analysis: `[${jsonOutput.analysis.length} analysis items]`,
  extensions: jsonOutput.extensions,
  tags: jsonOutput.tags
}, null, 2));

console.log('\n=== Example 2 Complete ===');
