import { Vcon, Party, Dialog } from '../src';

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

// Add a text dialog (initial request)
const textDialog = new Dialog({
  type: 'text/plain',
  start: new Date(),
  parties: [0, 1],
  originator: 0,
  body: 'I need to schedule a video call for technical support.',
  mimetype: 'text/plain'
});

vcon.addDialog(textDialog);

// Add an audio dialog (phone call)
const audioDialog = new Dialog({
  type: 'audio/wav',
  start: new Date(Date.now() + 1000), // 1 second later
  parties: [0, 1],
  originator: 0,
  mimetype: 'audio/wav',
  filename: 'call-recording.wav',
  duration: 300 // 5 minutes
});

// Add external audio data
audioDialog.addExternalData(
  'https://example.com/recordings/call-recording.wav',
  'call-recording.wav',
  'audio/wav'
);

vcon.addDialog(audioDialog);

// Add a video dialog (screen sharing)
const videoDialog = new Dialog({
  type: 'video/mp4',
  start: new Date(Date.now() + 310000), // 5 minutes and 10 seconds later
  parties: [0, 1],
  originator: 1,
  mimetype: 'video/mp4',
  filename: 'screen-sharing.mp4',
  duration: 600 // 10 minutes
});

// Add inline video data (base64 encoded)
videoDialog.addInlineData(
  'base64EncodedVideoContent',
  'screen-sharing.mp4',
  'video/mp4'
);

vcon.addDialog(videoDialog);

// Add analysis for audio sentiment
vcon.addAnalysis({
  type: 'sentiment',
  dialog: 1, // Analyze the audio dialog
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