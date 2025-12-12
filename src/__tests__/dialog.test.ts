import { Dialog } from '../dialog';
import { PartyHistory } from '../party';

describe('Dialog', () => {
  it('should create a dialog with minimal properties', () => {
    const start = new Date();
    const dialog = new Dialog({
      type: 'text',
      start,
      parties: [0, 1]
    });

    expect(dialog.type).toBe('text');
    expect(dialog.start).toBe(start);
    expect(dialog.parties).toEqual([0, 1]);
  });

  it('should serialize start date to ISO string in toDict', () => {
    const start = new Date('2025-01-15T10:00:00Z');
    const dialog = new Dialog({
      type: 'text',
      start,
      parties: [0]
    });

    const dict = dialog.toDict();
    expect(dict.start).toBe('2025-01-15T10:00:00.000Z');
  });

  it('should accept string start dates', () => {
    const startStr = '2025-01-15T10:00:00Z';
    const dialog = new Dialog({
      type: 'text',
      start: startStr,
      parties: [0]
    });

    expect(dialog.start).toBe(startStr);
  });

  it('should create a dialog with all properties', () => {
    const start = new Date();
    const partyHistory = new PartyHistory(0, 'joined', start);

    const dialog = new Dialog({
      type: 'text',
      start,
      parties: [0, 1],
      originator: 0,
      mediatype: 'text/plain',
      filename: 'conversation.txt',
      body: 'Hello!',
      encoding: 'none',
      alg: 'sha256',
      signature: 'signature',
      disposition: 'no-answer',
      party_history: [partyHistory.toDict()],
      transferee: 1,
      transferor: 0,
      transfer_target: 2,
      original: 0,
      consultation: 1,
      target_dialog: 0,
      campaign: 'support',
      interaction: 'call',
      skill: 'sales',
      duration: 300,
      meta: { key: 'value' }
    });

    expect(dialog.type).toBe('text');
    expect(dialog.start).toBe(start);
    expect(dialog.parties).toEqual([0, 1]);
    expect(dialog.originator).toBe(0);
    expect(dialog.mediatype).toBe('text/plain');
    expect(dialog.filename).toBe('conversation.txt');
    expect(dialog.body).toBe('Hello!');
    expect(dialog.encoding).toBe('none');
    expect(dialog.alg).toBe('sha256');
    expect(dialog.signature).toBe('signature');
    expect(dialog.disposition).toBe('no-answer');
    expect(dialog.party_history).toBeDefined();
    expect(dialog.transferee).toBe(1);
    expect(dialog.transferor).toBe(0);
    expect(dialog.transfer_target).toBe(2);
    expect(dialog.original).toBe(0);
    expect(dialog.consultation).toBe(1);
    expect(dialog.target_dialog).toBe(0);
    expect(dialog.campaign).toBe('support');
    expect(dialog.interaction).toBe('call');
    expect(dialog.skill).toBe('sales');
    expect(dialog.duration).toBe(300);
    expect(dialog.meta).toEqual({ key: 'value' });
  });

  it('should handle external data with new API', () => {
    const dialog = new Dialog({
      type: 'recording',
      start: new Date(),
      parties: [0]
    });

    dialog.addExternalData(
      'https://example.com/audio.wav',
      'audio/wav',
      { filename: 'audio.wav', content_hash: 'sha512-abc123' }
    );

    expect(dialog.isExternalData()).toBe(true);
    expect(dialog.isInlineData()).toBe(false);
    expect(dialog.url).toBe('https://example.com/audio.wav');
    expect(dialog.filename).toBe('audio.wav');
    expect(dialog.mediatype).toBe('audio/wav');
    expect(dialog.content_hash).toBe('sha512-abc123');
    expect(dialog.body).toBeUndefined();
    expect(dialog.encoding).toBeUndefined();
  });

  it('should handle inline data with new API', () => {
    const dialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0]
    });

    dialog.addInlineData(
      'Hello!',
      'text/plain',
      { encoding: 'none', filename: 'message.txt' }
    );

    expect(dialog.isExternalData()).toBe(false);
    expect(dialog.isInlineData()).toBe(true);
    expect(dialog.body).toBe('Hello!');
    expect(dialog.filename).toBe('message.txt');
    expect(dialog.mediatype).toBe('text/plain');
    expect(dialog.encoding).toBe('none');
    expect(dialog.url).toBeUndefined();
  });

  it('should check dialog types per vcon-core-01', () => {
    const textDialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0]
    });
    expect(textDialog.isText()).toBe(true);
    expect(textDialog.isRecording()).toBe(false);
    expect(textDialog.isTransfer()).toBe(false);
    expect(textDialog.isIncomplete()).toBe(false);

    const recordingDialog = new Dialog({
      type: 'recording',
      start: new Date(),
      parties: [0]
    });
    expect(recordingDialog.isRecording()).toBe(true);
    expect(recordingDialog.isText()).toBe(false);

    const transferDialog = new Dialog({
      type: 'transfer',
      start: new Date(),
      parties: [0]
    });
    expect(transferDialog.isTransfer()).toBe(true);

    const incompleteDialog = new Dialog({
      type: 'incomplete',
      start: new Date(),
      parties: [0],
      disposition: 'no-answer'
    });
    expect(incompleteDialog.isIncomplete()).toBe(true);
  });

  it('should check content types based on mediatype', () => {
    const dialog = new Dialog({
      type: 'recording',
      start: new Date(),
      parties: [0],
      mediatype: 'audio/wav'
    });

    expect(dialog.isAudio()).toBe(true);
    expect(dialog.isVideo()).toBe(false);
    expect(dialog.isEmail()).toBe(false);

    dialog.mediatype = 'video/mp4';
    expect(dialog.isVideo()).toBe(true);
    expect(dialog.isAudio()).toBe(false);

    dialog.mediatype = 'message/rfc822';
    expect(dialog.isEmail()).toBe(true);
  });

  it('should validate dialog correctly', () => {
    // Valid text dialog
    const validDialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0],
      body: 'Hello'
    });
    expect(validDialog.validate().valid).toBe(true);

    // Incomplete dialog without disposition
    const incompleteNoDisposition = new Dialog({
      type: 'incomplete',
      start: new Date(),
      parties: [0]
    });
    const result1 = incompleteNoDisposition.validate();
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContain('Disposition is required for incomplete dialogs');

    // Dialog with both inline and external data
    const bothData = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0],
      body: 'test',
      url: 'https://example.com'
    });
    const result2 = bothData.validate();
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContain('Dialog cannot have both inline (body) and external (url) data');
  });

  it('should have valid dialog types constant', () => {
    expect(Dialog.DIALOG_TYPES).toEqual(['recording', 'text', 'transfer', 'incomplete']);
  });

  it('should have valid dispositions constant', () => {
    expect(Dialog.DISPOSITIONS).toEqual([
      'no-answer',
      'congestion',
      'failed',
      'busy',
      'hung-up',
      'voicemail-no-message'
    ]);
  });

  it('should have valid encodings constant', () => {
    expect(Dialog.VALID_ENCODINGS).toEqual(['base64url', 'json', 'none']);
  });

  it('should handle mimetype to mediatype compatibility', () => {
    const dialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0],
      mimetype: 'text/plain'
    });

    expect(dialog.mediatype).toBe('text/plain');
  });

  it('should support single party integer per vcon-core-01', () => {
    const dialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: 0
    });

    expect(dialog.parties).toBe(0);
    const dict = dialog.toDict();
    expect(dict.parties).toBe(0);
  });
});
