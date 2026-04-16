import { Vcon, Party, Dialog } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Deepgram } from '@deepgram/sdk';

// Load environment variables from .env file
const envResult = dotenv.config();
if (envResult.error) {
  console.error('Error loading .env file:', envResult.error);
} else {
  console.log('.env file loaded successfully');
}

// Check if Deepgram API key is available
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
console.log('Deepgram API Key available:', DEEPGRAM_API_KEY ? 'Yes (first 5 chars: ' + DEEPGRAM_API_KEY.substring(0, 5) + '...)' : 'No');

if (!DEEPGRAM_API_KEY) {
  console.error('Error: DEEPGRAM_API_KEY environment variable is not set.');
  console.error('Please create a .env file with your Deepgram API key:');
  console.error('DEEPGRAM_API_KEY=your_api_key_here');
  process.exit(1);
}

// Initialize Deepgram client
const deepgram = new Deepgram(DEEPGRAM_API_KEY);

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: ts-node inline-recording.ts <input_wav_file>');
  process.exit(1);
}

const inputWavFile = args[0];
if (!fs.existsSync(inputWavFile)) {
  console.error(`Error: File not found: ${inputWavFile}`);
  process.exit(1);
}

// Create a new vCon
const vcon = Vcon.buildNew();

// Add parties
const customer = new Party({
  tel: '+11419968401',
  mailto: 'emma.gonzalez@gmail.com',
  name: 'Emma Gonzalez',
  role: 'customer',
  meta: { role: 'customer' },
  id: '+11419968401_emma.gonzalez@gmail.com_1100'
});

const agent = new Party({
  tel: '+18948199979',
  mailto: 'steven.davis@lasertagarena.com',
  name: 'Steven Davis',
  role: 'agent',
  meta: { 
    role: 'agent', 
    extension: '2212', 
    cxm_user_id: '891' 
  },
  id: 'steven.davis@lasertagarena.com'
});

vcon.addParty(customer);
vcon.addParty(agent);

// Get file information
const fileStats = fs.statSync(inputWavFile);
const fileName = path.basename(inputWavFile);
const fileExtension = path.extname(fileName).toLowerCase();

// Determine MIME type based on file extension
let mimeType = 'audio/x-wav';
if (fileExtension === '.mp3') {
  mimeType = 'audio/mpeg';
} else if (fileExtension === '.wav') {
  mimeType = 'audio/x-wav';
} else if (fileExtension === '.ogg') {
  mimeType = 'audio/ogg';
} else if (fileExtension === '.webm') {
  mimeType = 'audio/webm';
} else if (fileExtension === '.m4a') {
  mimeType = 'audio/x-m4a';
} else if (fileExtension === '.aac') {
  mimeType = 'audio/aac';
}

// Add an audio dialog with inline recording
const audioDialog = new Dialog({
  type: 'recording',
  start: new Date(),
  parties: [1, 0], // Agent (1) and Customer (0)
  mimetype: mimeType,
  filename: fileName,
  duration: 0, // Will be updated if available from Deepgram
  meta: {
    disposition: 'ANSWERED',
    direction: 'out',
    agent_selected_disposition: 'VM Left',
    is_dealer_manually_set: false,
    engaged: false
  }
});

// Read the audio file and convert it to base64
const audioFileBuffer = fs.readFileSync(inputWavFile);
const base64AudioContent = audioFileBuffer.toString('base64');

// Add inline audio data (base64 encoded)
audioDialog.addInlineData(
  base64AudioContent,
  fileName,
  mimeType
);

vcon.addDialog(audioDialog);

// Function to transcribe audio using Deepgram
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    console.log('Transcribing audio with Deepgram...');
    console.log('Using API key:', DEEPGRAM_API_KEY ? DEEPGRAM_API_KEY.substring(0, 5) + '...' : 'Not available');
    
    // Log audio file details
    console.log('Audio file size:', audioBuffer.length, 'bytes');
    console.log('Audio MIME type:', mimeType);
    
    const source = {
      buffer: audioBuffer,
      mimetype: mimeType,
    };
    
    console.log('Attempting transcription with Deepgram...');
    const response = await deepgram.transcription.preRecorded(source, {
      smart_format: true,
      model: 'general',
      language: 'en-US',
      punctuate: true
    });
    
    console.log('Transcription completed successfully.');
    
    // Log the complete response structure
    console.log('Complete Deepgram response:', JSON.stringify(response, null, 2));
    
    // Check if we have a valid response with transcript
    if (!response.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
      console.error('Warning: No transcript found in the response');
      console.log('Response structure:', response);
    }
    
    // We'll set a default duration if we can't get it from the API
    audioDialog.duration = response.metadata?.duration || 0;
    
    return response.results?.channels[0]?.alternatives[0]?.transcript || '';
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    
    // Check for authentication errors
    if (error.message && error.message.includes('INVALID_AUTH')) {
      console.error('\nAuthentication Error: Your Deepgram API key is invalid or not properly set up.');
      console.error('Please make sure you have:');
      console.error('1. Created a .env file in the project root');
      console.error('2. Added your Deepgram API key to the .env file:');
      console.error('   DEEPGRAM_API_KEY=your_actual_api_key_here');
      console.error('3. Obtained a valid API key from https://console.deepgram.com/');
    } else {
      // Log additional error details if available
      if (error.response) {
        console.error('Deepgram API Response:', error.response);
      }
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      });
    }
    
    throw error;
  }
}

// Main function to process the audio file
async function processAudioFile() {
  try {
    // Transcribe the audio file
    const transcript = await transcribeAudio(audioFileBuffer);
    
    // Add analysis for transcript
    vcon.addAnalysis({
      type: 'transcript',
      dialog: 0, // Analyze the audio dialog
      vendor: 'deepgram',
      body: {
        transcript: transcript,
        confidence: 0.99, // This would ideally come from Deepgram
        detected_language: 'en'
      },
      encoding: 'none'
    });
    
    // Add analysis for summary
    vcon.addAnalysis({
      type: 'summary',
      dialog: 0,
      vendor: 'openai',
      body: "Summary of the conversation would be generated here.",
      encoding: 'none'
    });
    
    // Add analysis for diarized transcript
    vcon.addAnalysis({
      type: 'diarized',
      dialog: 0,
      vendor: 'openai',
      body: transcript,
      encoding: 'none'
    });
    
    // Convert to JSON
    const json = vcon.toJson();
    console.log('vCon JSON length:', json.length);
    
    // Save the vCon JSON to a file
    const outputFileName = `${path.parse(fileName).name}.vcon.json`;
    const outputFilePath = path.join(path.dirname(inputWavFile), outputFileName);
    fs.writeFileSync(outputFilePath, json);
    console.log(`vCon JSON saved to: ${outputFilePath}`);
    
    // Load from JSON
    const loadedVcon = Vcon.buildFromJson(json);
    console.log('Loaded vCon UUID:', loadedVcon.uuid);
    console.log('Loaded vCon parties:', loadedVcon.parties.length);
    console.log('Loaded vCon dialogs:', loadedVcon.dialog.length);
    console.log('Loaded vCon analysis:', loadedVcon.analysis.length);
    
    // Check if the audio dialog has inline data
    console.log('Audio is inline:', audioDialog.isInlineData()); // true
    
  } catch (error) {
    console.error('Error processing audio file:', error);
    
    // If we have a transcript despite the error, still save the vCon
    if (audioDialog.isInlineData()) {
      try {
        // Convert to JSON
        const json = vcon.toJson();
        
        // Save the vCon JSON to a file
        const outputFileName = `${path.parse(fileName).name}.vcon.json`;
        const outputFilePath = path.join(path.dirname(inputWavFile), outputFileName);
        fs.writeFileSync(outputFilePath, json);
        console.log(`\nDespite the error, vCon JSON was saved to: ${outputFilePath}`);
      } catch (saveError) {
        console.error('Error saving vCon despite transcription error:', saveError);
      }
    }
  }
}

// Run the main function
processAudioFile(); 