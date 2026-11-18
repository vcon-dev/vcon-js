import { Vcon, Party, Dialog, Session } from '../src';

// Create a new vCon
const vcon = Vcon.buildNew();

// Add parties
const caller = new Party({
  tel: '+1234567890',
  name: 'John Doe',
  role: 'customer'
});

const agent = new Party({
  tel: '+0987654321',
  name: 'Jane Smith',
  role: 'agent'
});

vcon.addParty(caller);
vcon.addParty(agent);

// Core-05 groups Dialogs in a Session: the receivers are the Session parties
const session = vcon.addSession(new Session({ start: new Date(), parties: [0, 1] }));

// Add a text dialog (initial request). The sender is the Dialog party.
const textDialog = new Dialog({
  type: 'text',
  start: new Date(),
  parties: [0],
  body: 'I need to schedule a video call for technical support.',
  mediatype: 'text/plain',
  encoding: 'none'
});

vcon.addDialog(textDialog, session);

// Add an audio recording (phone call). Core-05 has one 'recording' type for
// audio and video; the media type says which.
const audioDialog = new Dialog({
  type: 'recording',
  start: new Date(Date.now() + 1000), // 1 second later
  parties: [0, 1],
  duration: 300 // 5 minutes
});

// Add external audio data (url, media type, then options)
audioDialog.addExternalData(
  'https://example.com/recordings/call-recording.wav',
  'audio/wav',
  {
    filename: 'call-recording.wav',
    content_hash: 'sha512-Tf9OoDQfCoI_FdP08BqxLq4OXaV5zLhR-NvZ3-hMWLLN7iZA50Dh7hctp5Om55Vg5ff5vQWKEqKAQz7W-kZRCg'
  }
);

vcon.addDialog(audioDialog, session);

// Add a video recording (screen sharing)
const videoDialog = new Dialog({
  type: 'recording',
  start: new Date(Date.now() + 310000), // 5 minutes and 10 seconds later
  parties: [1], // Jane shares her screen
  duration: 600 // 10 minutes
});

// Add inline video data (base64url encoded)
videoDialog.addInlineData('base64urlEncodedVideoContent', 'video/mp4', {
  encoding: 'base64url',
  filename: 'screen-sharing.mp4'
});

vcon.addDialog(videoDialog, session);

// Add analysis for audio sentiment
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 1, // Analyze the audio dialog (index 1)
  vendor: 'sentiment-analyzer',
  body: {
    score: 0.7,
    label: 'positive',
    segments: [
      { start: 0, end: 60, score: 0.6, label: 'neutral' },
      { start: 60, end: 180, score: 0.8, label: 'positive' },
      { start: 180, end: 300, score: 0.7, label: 'positive' }
    ]
  }
});

// Add analysis for video content
vcon.addAnalysis({
  type: 'content-classification',
  dialog: 2, // Analyze the video dialog
  vendor: 'content-analyzer',
  body: {
    labels: ['screen-sharing', 'technical-support', 'software-demo'],
    confidence: 0.92
  }
});

// Add tags
vcon.addTag('category', 'technical-support');
vcon.addTag('priority', 'high');
vcon.addTag('media-types', 'audio,video');

// Check dialog types
console.log('Text dialog:', textDialog.isText()); // true
console.log('Audio dialog:', audioDialog.isAudio()); // true
console.log('Video dialog:', videoDialog.isVideo()); // true

// Check data storage
console.log('Audio is external:', audioDialog.isExternalData()); // true
console.log('Video is inline:', videoDialog.isInlineData()); // true

// Validate against core-05
console.log('Valid:', vcon.isValid());
// No lawful basis is recorded here; add a purpose "lawful_basis" attachment for real use.
console.log('Has lawful basis:', vcon.hasLawfulBasis());

// Convert to JSON
const json = vcon.toJson();
console.log('vCon JSON length:', json.length);

// Load from JSON
const loadedVcon = Vcon.buildFromJson(json);
console.log('Loaded vCon UUID:', loadedVcon.uuid);
console.log('Loaded vCon parties:', loadedVcon.parties.length);
console.log('Loaded vCon dialogs:', loadedVcon.dialog.length);
console.log('Loaded vCon analysis:', loadedVcon.analysis.length);
console.log('Loaded vCon tags:', loadedVcon.tags); 