import { Dialog } from '../dialog';

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

    const dialog = new Dialog({
      type: 'text',
      start,
      parties: [0, 1],
      mediatype: 'text/plain',
      filename: 'conversation.txt',
      body: 'Hello!',
      encoding: 'none',
      alg: 'sha256',
      signature: 'signature',
      disposition: 'no-answer',
      campaign: 'support',
      interaction: 'call',
      skill: 'sales',
      duration: 300,
      redacted_segments: [{ start: 0, end: 3 }],
      meta: { key: 'value' }
    });

    expect(dialog.type).toBe('text');
    expect(dialog.start).toBe(start);
    expect(dialog.parties).toEqual([0, 1]);
    expect(dialog.mediatype).toBe('text/plain');
    expect(dialog.filename).toBe('conversation.txt');
    expect(dialog.body).toBe('Hello!');
    expect(dialog.encoding).toBe('none');
    expect(dialog.alg).toBe('sha256');
    expect(dialog.signature).toBe('signature');
    expect(dialog.disposition).toBe('no-answer');
    expect(dialog.campaign).toBe('support');
    expect(dialog.interaction).toBe('call');
    expect(dialog.skill).toBe('sales');
    expect(dialog.duration).toBe(300);
    expect(dialog.redacted_segments).toEqual([{ start: 0, end: 3 }]);
    expect(dialog.meta).toEqual({ key: 'value' });
  });

  it.each([
    'originator',
    'party_history',
    'transferee',
    'transferor',
    'transfer_target',
    'original',
    'consultation',
    'target_dialog',
    'recordings',
    'recording_set'
  ])('rejects the 0.4.0 parameter %s', key => {
    expect(() => new Dialog({ type: 'recording', start: new Date(), [key]: 0 })).toThrow(/removed in vCon 0.5.0/);
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

  it('should check dialog types per vcon-core', () => {
    const textDialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0]
    });
    expect(textDialog.isText()).toBe(true);
    expect(textDialog.isRecording()).toBe(false);
    expect(textDialog.isIncomplete()).toBe(false);

    const recordingDialog = new Dialog({
      type: 'recording',
      start: new Date(),
      parties: [0]
    });
    expect(recordingDialog.isRecording()).toBe(true);
    expect(recordingDialog.isText()).toBe(false);

    // isTransfer() is deprecated and always false: transfers are Events now.
    expect(textDialog.isTransfer()).toBe(false);

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
    expect(Dialog.DIALOG_TYPES).toEqual(['recording', 'text', 'incomplete']);
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

  it('should support single party integer per vcon-core', () => {
    const dialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: 0
    });

    expect(dialog.parties).toBe(0);
    const dict = dialog.toDict();
    expect(dict.parties).toBe(0);
  });

  it('should support message_id parameter (vcon-core)', () => {
    const dialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0, 1],
      mediatype: 'message/rfc822',
      message_id: '<abc123@example.com>',
      body: 'Email content'
    });

    expect(dialog.message_id).toBe('<abc123@example.com>');
    
    const dict = dialog.toDict();
    expect(dict.message_id).toBe('<abc123@example.com>');
  });

  it('should support array content_hash (vcon-core)', () => {
    const dialog = new Dialog({
      type: 'recording',
      start: new Date(),
      parties: [0, 1]
    });

    dialog.addExternalData(
      'https://example.com/audio.wav',
      'audio/wav',
      { content_hash: ['sha512-abc123', 'sha256-def456'] }
    );

    expect(dialog.content_hash).toEqual(['sha512-abc123', 'sha256-def456']);
    
    const dict = dialog.toDict();
    expect(dict.content_hash).toEqual(['sha512-abc123', 'sha256-def456']);
  });

  it('should support SessionId with local and remote (vcon-core)', () => {
    const dialog = new Dialog({
      type: 'recording',
      start: new Date(),
      parties: [0, 1],
      session_id: {
        local: '550e8400-e29b-41d4-a716-446655440000',
        remote: '550e8400-e29b-41d4-a716-446655440001'
      }
    });

    expect(dialog.session_id).toEqual({
      local: '550e8400-e29b-41d4-a716-446655440000',
      remote: '550e8400-e29b-41d4-a716-446655440001'
    });
  });

  it('builds an empty placeholder Dialog that serializes as {}', () => {
    const d = Dialog.placeholder();
    expect(d.isPlaceholder()).toBe(true);
    expect(d.toDict()).toEqual({});
    expect(d.validate().valid).toBe(true);
  });

  it('builds a recording Dialog for the legacy audio and video types and warns', () => {
    const spy = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      expect(new Dialog({ type: 'audio', start: new Date() }).type).toBe('recording');
      expect(new Dialog({ type: 'video', start: new Date() }).type).toBe('recording');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('accepts null and nested entries in parties', () => {
    const d = new Dialog({ type: 'recording', start: new Date(), parties: [[0, 2], null, 1] });
    expect(d.toDict().parties).toEqual([[0, 2], null, 1]);
  });

  it('rejects content on an incomplete Dialog', () => {
    const d = new Dialog({ type: 'incomplete', start: new Date(), disposition: 'busy', body: 'x', mediatype: 'text/plain' });
    const { valid, errors } = d.validate();
    expect(valid).toBe(false);
    expect(errors).toContain('Incomplete dialog MUST NOT include body');
    expect(errors).toContain('Incomplete dialog MUST NOT include mediatype');
  });

  it('Dialog.fromDict wraps a legacy Dialog without throwing', () => {
    const d = Dialog.fromDict({ type: 'transfer', start: '2025-01-01T00:00:00Z', transferor: 0 });
    expect(d.type).toBe('transfer');
  });
});
