import { Dialog } from '../dialog';
import { PartyHistory } from '../party';

describe('Dialog', () => {
  it('should create a dialog with minimal properties', () => {
    const start = new Date();
    const dialog = new Dialog({
      type: 'text/plain',
      start,
      parties: [0, 1]
    });
    
    expect(dialog.type).toBe('text/plain');
    expect(dialog.start).toBe(start);
    expect(dialog.parties).toEqual([0, 1]);
    expect(dialog.toDict()).toEqual({
      type: 'text/plain',
      start,
      parties: [0, 1]
    });
  });

  it('should create a dialog with all properties', () => {
    const start = new Date();
    const partyHistory = new PartyHistory(0, 'joined', start);
    
    const dialog = new Dialog({
      type: 'text/plain',
      start,
      parties: [0, 1],
      originator: 0,
      mimetype: 'text/plain',
      filename: 'conversation.txt',
      body: 'Hello!',
      encoding: 'utf-8',
      url: 'https://example.com/audio.wav',
      alg: 'sha256',
      signature: 'signature',
      disposition: 'inline',
      party_history: [partyHistory],
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
    
    expect(dialog.type).toBe('text/plain');
    expect(dialog.start).toBe(start);
    expect(dialog.parties).toEqual([0, 1]);
    expect(dialog.originator).toBe(0);
    expect(dialog.mimetype).toBe('text/plain');
    expect(dialog.filename).toBe('conversation.txt');
    expect(dialog.body).toBe('Hello!');
    expect(dialog.encoding).toBe('utf-8');
    expect(dialog.url).toBe('https://example.com/audio.wav');
    expect(dialog.alg).toBe('sha256');
    expect(dialog.signature).toBe('signature');
    expect(dialog.disposition).toBe('inline');
    expect(dialog.party_history).toEqual([partyHistory]);
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

  it('should handle external data', () => {
    const dialog = new Dialog({
      type: 'text/plain',
      start: new Date(),
      parties: [0]
    });
    
    dialog.addExternalData(
      'https://example.com/audio.wav',
      'audio.wav',
      'audio/wav'
    );
    
    expect(dialog.isExternalData()).toBe(true);
    expect(dialog.isInlineData()).toBe(false);
    expect(dialog.url).toBe('https://example.com/audio.wav');
    expect(dialog.filename).toBe('audio.wav');
    expect(dialog.mimetype).toBe('audio/wav');
    expect(dialog.body).toBeUndefined();
    expect(dialog.encoding).toBeUndefined();
  });

  it('should handle inline data', () => {
    const dialog = new Dialog({
      type: 'text/plain',
      start: new Date(),
      parties: [0]
    });
    
    dialog.addInlineData(
      'Hello!',
      'message.txt',
      'text/plain'
    );
    
    expect(dialog.isExternalData()).toBe(false);
    expect(dialog.isInlineData()).toBe(true);
    expect(dialog.body).toBe('Hello!');
    expect(dialog.filename).toBe('message.txt');
    expect(dialog.mimetype).toBe('text/plain');
    expect(dialog.url).toBeUndefined();
  });

  it('should validate MIME types', () => {
    const dialog = new Dialog({
      type: 'text/plain',
      start: new Date(),
      parties: [0]
    });
    
    expect(() => {
      dialog.addExternalData(
        'https://example.com/file',
        'file',
        'invalid/mime'
      );
    }).toThrow('Invalid MIME type');
    
    expect(() => {
      dialog.addInlineData(
        'content',
        'file',
        'invalid/mime'
      );
    }).toThrow('Invalid MIME type');
  });

  it('should check content types', () => {
    const dialog = new Dialog({
      type: 'text/plain',
      start: new Date(),
      parties: [0],
      mimetype: 'text/plain'
    });
    
    expect(dialog.isText()).toBe(true);
    expect(dialog.isAudio()).toBe(false);
    expect(dialog.isVideo()).toBe(false);
    expect(dialog.isEmail()).toBe(false);
    
    dialog.mimetype = 'audio/wav';
    expect(dialog.isText()).toBe(false);
    expect(dialog.isAudio()).toBe(true);
    
    dialog.mimetype = 'video/mp4';
    expect(dialog.isVideo()).toBe(true);
    
    dialog.mimetype = 'message/rfc822';
    expect(dialog.isEmail()).toBe(true);
  });
}); 