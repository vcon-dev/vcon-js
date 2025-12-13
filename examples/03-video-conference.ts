/**
 * Example 3: Video Conference with Multiple Parties and Attachments
 *
 * This example demonstrates creating a vCon for a video conference
 * with multiple participants, screen sharing, and file attachments.
 *
 * Key concepts covered:
 * - Multi-party conferences (more than 2 parties)
 * - Video recording dialogs
 * - Multiple attachments with different purposes
 * - Group references for related vCons
 * - Incomplete dialogs (failed join attempts)
 * - External and inline content
 * - Amendment and redaction references
 */

import { Vcon, Party, Dialog, Attachment } from '../src';

console.log('=== Example 3: Video Conference with Attachments ===\n');

// Step 1: Create the main vCon
const vcon = Vcon.buildNew();
vcon.subject = 'Q1 2025 Product Roadmap Review';

// Mark that this vCon uses the meeting extension
vcon.addExtension('meeting');

console.log(`Created vCon: ${vcon.uuid}`);

// Step 2: Add multiple parties
const parties = [
  new Party({
    mailto: 'sarah.chen@company.com',
    name: 'Sarah Chen',
    role: 'host',
    timezone: 'America/Los_Angeles',
    meta: { title: 'VP of Product' }
  }),
  new Party({
    mailto: 'mike.johnson@company.com',
    name: 'Mike Johnson',
    role: 'participant',
    timezone: 'America/New_York',
    meta: { title: 'Engineering Lead' }
  }),
  new Party({
    mailto: 'emma.wilson@company.com',
    name: 'Emma Wilson',
    role: 'participant',
    timezone: 'Europe/London',
    meta: { title: 'Design Director' }
  }),
  new Party({
    mailto: 'raj.patel@company.com',
    name: 'Raj Patel',
    role: 'participant',
    timezone: 'Asia/Kolkata',
    meta: { title: 'QA Manager' }
  }),
  new Party({
    mailto: 'lisa.kim@company.com',
    name: 'Lisa Kim',
    role: 'participant',
    timezone: 'Asia/Seoul',
    meta: { title: 'Marketing Lead' }
  })
];

parties.forEach(p => vcon.addParty(p));
console.log(`Added ${parties.length} conference participants:`);
parties.forEach((p, i) => console.log(`  [${i}] ${p.name} (${p.role}) - ${p.meta?.title}`));

// Step 3: Add an incomplete dialog for a failed join attempt
const failedJoinTime = new Date('2025-01-20T09:58:00-08:00');
const failedJoinDialog = new Dialog({
  type: 'incomplete',
  start: failedJoinTime.toISOString(),
  parties: 3,  // Raj tried to join (single party as integer)
  disposition: 'failed',
  meta: {
    error: 'network_timeout',
    retry_count: 2
  }
});
vcon.addDialog(failedJoinDialog);
console.log('\nAdded incomplete dialog (failed join attempt)');

// Step 4: Create the main video conference recording
const conferenceStart = new Date('2025-01-20T10:00:00-08:00');
const conferenceDuration = 3720; // 62 minutes

const videoDialog = new Dialog({
  type: 'recording',
  start: conferenceStart.toISOString(),
  parties: [0, 1, 2, 3, 4],  // All participants
  originator: 0,  // Sarah (host) started the meeting
  duration: conferenceDuration,
  application: 'zoom',
  session_id: { id: 'mtg-98765432', type: 'zoom-meeting-id' }
});

// Add external video reference
videoDialog.addExternalData(
  'https://recordings.company.com/meetings/2025/01/20/roadmap-review.mp4',
  'video/mp4',
  {
    filename: 'q1-roadmap-review-2025-01-20.mp4',
    content_hash: 'sha512-7d865e959b2466918c9863afca942d0fb89d7c9ac0c99bafc3749504ded97730'
  }
);

// Track when participants joined/left
videoDialog.party_history = [
  { party: 0, event: 'joined', time: conferenceStart.toISOString() },
  { party: 1, event: 'joined', time: new Date(conferenceStart.getTime() + 30000).toISOString() },
  { party: 2, event: 'joined', time: new Date(conferenceStart.getTime() + 45000).toISOString() },
  { party: 3, event: 'joined', time: new Date(conferenceStart.getTime() + 180000).toISOString() }, // Raj joined late after retry
  { party: 4, event: 'joined', time: new Date(conferenceStart.getTime() + 60000).toISOString() },
  { party: 2, event: 'left', time: new Date(conferenceStart.getTime() + 3000000).toISOString() }, // Emma left at 50min
  { party: 0, event: 'left', time: new Date(conferenceStart.getTime() + conferenceDuration * 1000).toISOString() },
  { party: 1, event: 'left', time: new Date(conferenceStart.getTime() + conferenceDuration * 1000).toISOString() },
  { party: 3, event: 'left', time: new Date(conferenceStart.getTime() + conferenceDuration * 1000).toISOString() },
  { party: 4, event: 'left', time: new Date(conferenceStart.getTime() + conferenceDuration * 1000).toISOString() }
];

vcon.addDialog(videoDialog);
console.log(`Added video recording dialog (${Math.floor(conferenceDuration / 60)} minutes)`);

// Step 5: Add a screen sharing segment as a separate dialog
const screenShareDialog = new Dialog({
  type: 'recording',
  start: new Date(conferenceStart.getTime() + 600000).toISOString(), // 10 min into meeting
  parties: [0, 1, 2, 3, 4],
  originator: 0, // Sarah shared her screen
  duration: 1200, // 20 minutes of screen share
  mediatype: 'video/webm',
  meta: { content_type: 'screen_share' }
});

screenShareDialog.addExternalData(
  'https://recordings.company.com/meetings/2025/01/20/roadmap-screenshare.webm',
  'video/webm',
  { filename: 'roadmap-screenshare.webm' }
);

vcon.addDialog(screenShareDialog);
console.log('Added screen share recording dialog');

// Step 6: Add attachments

// Presentation slides (inline, base64url encoded)
const presentationAttachment = vcon.addAttachment({
  type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  purpose: 'presentation',
  mediatype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  filename: 'Q1-2025-Product-Roadmap.pptx',
  body: 'UEsDBBQAAAAIAGiC...',  // Truncated base64url content
  encoding: 'base64url',
  party: 0,  // Shared by Sarah
  start: new Date(conferenceStart.getTime() + 300000).toISOString()
});
console.log('\nAdded presentation attachment');

// Meeting notes (external reference)
vcon.addAttachment({
  purpose: 'meeting-notes',
  url: 'https://docs.company.com/meetings/2025-01-20-roadmap-notes.md',
  content_hash: 'sha512-abc123def456...',
  mediatype: 'text/markdown',
  filename: 'meeting-notes.md',
  party: 1  // Mike took notes
});
console.log('Added meeting notes attachment (external)');

// Action items spreadsheet
vcon.addAttachment({
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  purpose: 'action-items',
  url: 'https://docs.company.com/meetings/2025-01-20-action-items.xlsx',
  mediatype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  filename: 'action-items.xlsx',
  dialog: [1, 2]  // Related to main recording and screen share
});
console.log('Added action items spreadsheet');

// Chat transcript
vcon.addAttachment({
  purpose: 'chat-transcript',
  mediatype: 'text/plain',
  filename: 'meeting-chat.txt',
  body: `[10:02] Mike Johnson: Good morning everyone!
[10:02] Emma Wilson: Morning from London!
[10:03] Lisa Kim: Hello from Seoul - it's late here but excited to discuss the roadmap
[10:05] Raj Patel: Sorry I'm late, had connection issues
[10:15] Mike Johnson: Sarah, can you share the timeline slide again?
[10:32] Emma Wilson: The new design system looks great
[10:45] Raj Patel: QA will need at least 2 weeks for the beta testing
[10:50] Emma Wilson: I need to drop off - another meeting. Great discussion!
[11:00] Lisa Kim: Can someone share the recording link after?
[11:01] Sarah Chen: Yes, I'll send it to everyone`,
  encoding: 'none'
});
console.log('Added chat transcript');

// Step 7: Add analysis
vcon.addAnalysis({
  type: 'transcription',
  dialog: 1,  // Main video recording
  vendor: 'assembly-ai',
  product: 'universal-2',
  url: 'https://storage.company.com/transcripts/2025-01-20-roadmap.json',
  content_hash: 'sha512-transcript123...',
  mediatype: 'application/json'
});

vcon.addAnalysis({
  type: 'action-items',
  dialog: 1,
  vendor: 'internal',
  product: 'meeting-ai-v1',
  encoding: 'json',
  body: {
    items: [
      { assignee: 'Mike Johnson', task: 'Finalize API specifications', due: '2025-01-27' },
      { assignee: 'Emma Wilson', task: 'Complete design mockups for mobile', due: '2025-01-31' },
      { assignee: 'Raj Patel', task: 'Set up beta testing environment', due: '2025-02-03' },
      { assignee: 'Lisa Kim', task: 'Prepare launch marketing materials', due: '2025-02-10' },
      { assignee: 'Sarah Chen', task: 'Schedule follow-up meeting', due: '2025-01-22' }
    ],
    total_count: 5
  }
});

vcon.addAnalysis({
  type: 'summary',
  dialog: 1,
  vendor: 'internal',
  product: 'meeting-summarizer-v2',
  encoding: 'json',
  body: {
    executive_summary: 'The team reviewed the Q1 2025 product roadmap, focusing on the new mobile app features and API redesign. Key decisions were made regarding the beta testing timeline and marketing launch strategy.',
    key_decisions: [
      'Beta launch scheduled for February 15, 2025',
      'Design system v2.0 approved for implementation',
      'API v3 will maintain backward compatibility'
    ],
    next_meeting: '2025-01-27T10:00:00-08:00'
  }
});

console.log('Added 3 analysis items (transcription, action-items, summary)');

// Step 8: Add group reference (this meeting is part of a series)
vcon.addGroup({
  uuid: 'meeting-series-roadmap-2025',
  type: 'meeting-series',
  meta: { series_name: 'Q1 2025 Roadmap Reviews', occurrence: 3 }
});
console.log('\nAdded group reference (meeting series)');

// Step 9: Add tags
vcon.addTag('meeting_type', 'roadmap-review');
vcon.addTag('department', 'product');
vcon.addTag('quarter', 'Q1-2025');
vcon.addTag('recording_available', 'true');
vcon.addTag('confidentiality', 'internal');

// Step 10: Display comprehensive summary
console.log('\n--- vCon Summary ---');
console.log(`UUID: ${vcon.uuid}`);
console.log(`Version: ${vcon.vcon}`);
console.log(`Subject: ${vcon.subject}`);
console.log(`Created: ${vcon.created_at}`);
console.log(`Updated: ${vcon.updated_at}`);

console.log('\nParties:');
vcon.parties.forEach((p, i) => {
  console.log(`  [${i}] ${p.name} <${p.mailto}> - ${p.role}`);
});

console.log('\nDialogs:');
vcon.dialog.forEach((d, i) => {
  const partyInfo = Array.isArray(d.parties) ? `parties ${d.parties.join(',')}` : `party ${d.parties}`;
  console.log(`  [${i}] ${d.type} - ${partyInfo}${d.duration ? ` (${d.duration}s)` : ''}`);
});

console.log('\nAttachments:');
vcon.attachments.forEach((a, i) => {
  const location = a.url ? 'external' : 'inline';
  console.log(`  [${i}] ${a.purpose || a.type} - ${a.filename} (${location})`);
});

console.log('\nAnalysis:');
vcon.analysis.forEach((a, i) => {
  const storage = a.url ? 'external' : 'inline';
  console.log(`  [${i}] ${a.type} by ${a.vendor}/${a.product} (${storage})`);
});

console.log('\nExtensions:', vcon.extensions);
console.log('Groups:', vcon.group);
console.log('Tags:', vcon.tags);

// Step 11: Validate dialogs
console.log('\n--- Validation ---');
vcon.dialog.forEach((d, i) => {
  const dialogObj = new Dialog(d as any);
  const result = dialogObj.validate();
  console.log(`Dialog ${i}: ${result.valid ? 'VALID' : 'INVALID'}`);
  if (result.errors.length > 0) {
    result.errors.forEach(e => console.log(`  - ${e}`));
  }
});

// Step 12: Show JSON structure
console.log('\n--- vCon JSON Structure ---');
const json = JSON.parse(vcon.toJson());
console.log(`{
  uuid: "${json.uuid}",
  vcon: "${json.vcon}",
  subject: "${json.subject}",
  created_at: "${json.created_at}",
  parties: [${json.parties.length} parties],
  dialog: [${json.dialog.length} dialogs],
  attachments: [${json.attachments.length} attachments],
  analysis: [${json.analysis.length} analysis items],
  group: [${json.group?.length || 0} groups],
  extensions: ${JSON.stringify(json.extensions)},
  tags: ${JSON.stringify(json.tags)}
}`);

console.log('\n=== Example 3 Complete ===');
