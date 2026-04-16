import { Vcon } from '../vcon';
import { Party } from '../party';
import { Dialog } from '../dialog';
import { Attachment } from '../attachment';
import { VCON_VERSION } from '../types';
import { loadTestVcon, getAllTestVcons, getTestVconsByDirectory } from './utils';

describe('Vcon', () => {
  it('should create a new vCon with default values', () => {
    const vcon = Vcon.buildNew();

    expect(vcon.uuid).toBeDefined();
    expect(vcon.vcon).toBe(VCON_VERSION);
    expect(typeof vcon.created_at).toBe('string');
    expect(vcon.updated_at).toBeUndefined();
    expect(vcon.parties).toEqual([]);
    expect(vcon.dialog).toEqual([]);
    expect(vcon.attachments).toEqual([]);
    expect(vcon.analysis).toEqual([]);
    expect(vcon.tags).toEqual({});
  });

  it('should create a vCon from JSON', () => {
    const json = JSON.stringify({
      uuid: 'test-uuid',
      vcon: '0.0.1',
      created_at: '2025-01-15T10:00:00Z',
      parties: [],
      dialog: [],
      attachments: [],
      analysis: [],
      tags: {}
    });

    const vcon = Vcon.buildFromJson(json);

    expect(vcon.uuid).toBe('test-uuid');
    expect(vcon.vcon).toBe('0.0.1');
    expect(vcon.parties).toEqual([]);
    expect(vcon.dialog).toEqual([]);
  });

  it('should add and find parties', () => {
    const vcon = Vcon.buildNew();
    const party = new Party({
      tel: '+1234567890',
      name: 'John Doe'
    });

    vcon.addParty(party);

    expect(vcon.parties.length).toBe(1);
    expect(vcon.parties[0].tel).toBe('+1234567890');
    expect(vcon.parties[0].name).toBe('John Doe');

    const partyIndex = vcon.findPartyIndex('tel', '+1234567890');
    expect(partyIndex).toBe(0);
  });

  it('should return undefined for non-existent party', () => {
    const vcon = Vcon.buildNew();
    const partyIndex = vcon.findPartyIndex('tel', '+1234567890');
    expect(partyIndex).toBeUndefined();
  });

  it('should add and find dialogs', () => {
    const vcon = Vcon.buildNew();
    const dialog = new Dialog({
      type: 'text',
      start: new Date(),
      parties: [0],
      body: 'Hello!',
      mediatype: 'text/plain'
    });

    vcon.addDialog(dialog);

    expect(vcon.dialog.length).toBe(1);
    expect(vcon.dialog[0].body).toBe('Hello!');

    const foundDialog = vcon.findDialog('body', 'Hello!');
    expect(foundDialog).toBeDefined();
    expect(foundDialog?.body).toBe('Hello!');
  });

  it('should add attachments with new API', () => {
    const vcon = Vcon.buildNew();
    const attachment = vcon.addAttachment({
      type: 'application/pdf',
      body: 'base64EncodedContent',
      encoding: 'base64url'
    });

    expect(vcon.attachments.length).toBe(1);
    expect(vcon.attachments[0].type).toBe('application/pdf');

    const foundAttachment = vcon.findAttachmentByType('application/pdf');
    expect(foundAttachment).toBeDefined();
    expect(foundAttachment?.type).toBe('application/pdf');
  });

  it('should find attachments by purpose', () => {
    const vcon = Vcon.buildNew();
    vcon.addAttachment({
      purpose: 'transcript',
      body: 'Transcript content',
      mediatype: 'text/plain'
    });

    const foundAttachment = vcon.findAttachmentByPurpose('transcript');
    expect(foundAttachment).toBeDefined();
    expect(foundAttachment?.purpose).toBe('transcript');
  });

  it('should add and find analysis', () => {
    const vcon = Vcon.buildNew();

    vcon.addAnalysis({
      type: 'sentiment',
      dialog: 0,
      vendor: 'sentiment-analyzer',
      body: {
        score: 0.8,
        label: 'positive'
      }
    });

    expect(vcon.analysis.length).toBe(1);
    expect(vcon.analysis[0].type).toBe('sentiment');

    const foundAnalysis = vcon.findAnalysisByType('sentiment');
    expect(foundAnalysis).toBeDefined();
    expect(foundAnalysis?.type).toBe('sentiment');
  });

  it('should add and get tags', () => {
    const vcon = Vcon.buildNew();

    vcon.addTag('category', 'support');

    expect(vcon.tags).toEqual({ category: 'support' });
    expect(vcon.getTag('category')).toBe('support');
    expect(vcon.updated_at).toBeDefined();
  });

  it('should convert to JSON and back', () => {
    const vcon = Vcon.buildNew();
    const party = new Party({
      tel: '+1234567890',
      name: 'John Doe'
    });
    vcon.addParty(party);

    const json = vcon.toJson();
    const newVcon = Vcon.buildFromJson(json);

    expect(newVcon.parties.length).toBe(1);
    expect(newVcon.parties[0].tel).toBe('+1234567890');
    expect(newVcon.parties[0].name).toBe('John Doe');
  });

  it('should handle subject property', () => {
    const vcon = Vcon.buildNew();
    expect(vcon.subject).toBeUndefined();

    vcon.subject = 'Test conversation';
    expect(vcon.subject).toBe('Test conversation');
    expect(vcon.updated_at).toBeDefined();
  });

  it('should handle meta property', () => {
    const vcon = Vcon.buildNew();
    expect(vcon.meta).toBeUndefined();

    vcon.meta = { custom: 'data' };
    expect(vcon.meta).toEqual({ custom: 'data' });
    expect(vcon.updated_at).toBeDefined();
  });
});

describe('Vcon extensions (vcon-core-02)', () => {
  it('should add and check extensions', () => {
    const vcon = Vcon.buildNew();

    vcon.addExtension('contact_center');
    expect(vcon.hasExtension('contact_center')).toBe(true);
    expect(vcon.hasExtension('other')).toBe(false);
    expect(vcon.extensions).toContain('contact_center');
  });

  it('should not duplicate extensions', () => {
    const vcon = Vcon.buildNew();

    vcon.addExtension('contact_center');
    vcon.addExtension('contact_center');

    expect(vcon.extensions?.length).toBe(1);
  });

  it('should add critical extensions', () => {
    const vcon = Vcon.buildNew();

    vcon.addCriticalExtension('encrypted');
    expect(vcon.hasExtension('encrypted')).toBe(true);
    expect(vcon.isCriticalExtension('encrypted')).toBe(true);
    expect(vcon.critical).toContain('encrypted');
  });

  it('should handle redacted property', () => {
    const vcon = Vcon.buildNew();
    expect(vcon.redacted).toBeUndefined();

    vcon.redacted = { uuid: 'original-uuid' };
    expect(vcon.redacted).toEqual({ uuid: 'original-uuid' });

    vcon.redacted = true;
    expect(vcon.redacted).toBe(true);
  });

  it('should handle amended property', () => {
    const vcon = Vcon.buildNew();
    expect(vcon.amended).toBeUndefined();

    vcon.amended = { uuid: 'amended-uuid' };
    expect(vcon.amended).toEqual({ uuid: 'amended-uuid' });
  });

  it('should add groups', () => {
    const vcon = Vcon.buildNew();

    vcon.addGroup({ uuid: 'group-uuid', type: 'thread' });
    expect(vcon.group?.length).toBe(1);

    vcon.addGroup('another-group-uuid');
    expect(vcon.group?.length).toBe(2);
  });
});

describe('Vcon with synthetic data', () => {
  it('should load and parse synthetic vcons correctly', () => {
    const vcons = getAllTestVcons();
    expect(vcons.length).toBeGreaterThan(0);

    // Test the first vcon
    const vcon = vcons[0];
    expect(vcon.uuid).toBeDefined();
    expect(typeof vcon.created_at).toBe('string');
    expect(new Date(vcon.created_at as string)).toBeInstanceOf(Date);
    expect(vcon.parties).toBeDefined();
    expect(vcon.dialog).toBeDefined();
  });

  it('should handle real-world conversation scenarios', () => {
    const vcons = getTestVconsByDirectory('01');
    expect(vcons.length).toBeGreaterThan(0);

    const vcon = vcons[0];

    // Test party information
    expect(vcon.parties.length).toBeGreaterThan(0);
    const agent = vcon.parties.find(p => p.role === 'agent');
    const contact = vcon.parties.find(p => p.role === 'contact');

    expect(agent).toBeDefined();
    expect(contact).toBeDefined();
    expect(agent?.mailto).toBeDefined();
    expect(contact?.tel).toBeDefined();

    // Test dialog content
    expect(vcon.dialog.length).toBeGreaterThan(0);
    const firstMessage = vcon.dialog[0];
    expect(firstMessage.type).toBe('text');
    expect(firstMessage.body).toBeDefined();
    expect(firstMessage.parties).toBeDefined();
    expect(firstMessage.originator).toBeDefined();
  });

  it('should maintain conversation flow and timing', () => {
    const vcons = getTestVconsByDirectory('01');
    const vcon = vcons[0];

    // Test chronological order
    for (let i = 1; i < vcon.dialog.length; i++) {
      const current = new Date(vcon.dialog[i].start as string);
      const previous = new Date(vcon.dialog[i - 1].start as string);
      expect(current.getTime()).toBeGreaterThanOrEqual(previous.getTime());
    }

    // Test conversation flow
    const messages = vcon.dialog.map(d => d.body).filter((m): m is string => m !== undefined);
    expect(messages.some(m => m.includes('Hello'))).toBeTruthy();
    expect(messages.some(m => m.includes('thank'))).toBeTruthy();
  });

  it('should handle different vcon versions', () => {
    const vcons = getAllTestVcons();
    const versions = new Set(vcons.map(v => v.vcon));

    expect(versions.size).toBeGreaterThan(0);
    versions.forEach(version => {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});

describe('Vcon analysis with vcon-core-02 fields', () => {
  it('should add analysis with product and schema', () => {
    const vcon = Vcon.buildNew();

    vcon.addAnalysis({
      type: 'transcription',
      dialog: [0, 1],
      vendor: 'whisper',
      product: 'whisper-large-v3',
      schema: 'urn:ietf:params:vcon:analysis:transcription',
      body: {
        text: 'Hello, how can I help you?',
        confidence: 0.95
      },
      encoding: 'json'
    });

    expect(vcon.analysis.length).toBe(1);
    expect(vcon.analysis[0].product).toBe('whisper-large-v3');
    expect(vcon.analysis[0].schema).toBe('urn:ietf:params:vcon:analysis:transcription');
  });

  it('should add analysis with external reference', () => {
    const vcon = Vcon.buildNew();

    vcon.addAnalysis({
      type: 'transcription',
      dialog: 0,
      vendor: 'cloud-service',
      url: 'https://example.com/transcription.json',
      content_hash: 'sha512-abc123xyz',
      mediatype: 'application/json'
    });

    expect(vcon.analysis[0].url).toBe('https://example.com/transcription.json');
    expect(vcon.analysis[0].content_hash).toBe('sha512-abc123xyz');
  });

  it('should add analysis with array content_hash (vcon-core-02)', () => {
    const vcon = Vcon.buildNew();

    vcon.addAnalysis({
      type: 'transcription',
      dialog: 0,
      vendor: 'cloud-service',
      url: 'https://example.com/transcription.json',
      content_hash: ['sha512-abc123xyz', 'sha256-def456'],
      mediatype: 'application/json'
    });

    expect(vcon.analysis[0].content_hash).toEqual(['sha512-abc123xyz', 'sha256-def456']);
  });
});

describe('Vcon vcon-core-02 specific features', () => {
  it('should have VCON_VERSION as 0.4.0', () => {
    expect(VCON_VERSION).toBe('0.4.0');
  });

  it('should handle redacted with type and content_hash (vcon-core-02)', () => {
    const vcon = Vcon.buildNew();
    
    vcon.redacted = { 
      uuid: 'original-uuid',
      type: 'pii-masked',
      url: 'https://example.com/original.vcon',
      content_hash: 'sha512-abc123'
    };
    
    expect(vcon.redacted).toEqual({ 
      uuid: 'original-uuid',
      type: 'pii-masked',
      url: 'https://example.com/original.vcon',
      content_hash: 'sha512-abc123'
    });
  });

  it('should handle amended with url and content_hash (vcon-core-02)', () => {
    const vcon = Vcon.buildNew();
    
    vcon.amended = { 
      uuid: 'prior-uuid',
      url: 'https://example.com/prior.vcon',
      content_hash: ['sha512-abc', 'sha256-def']
    };
    
    expect(vcon.amended).toEqual({ 
      uuid: 'prior-uuid',
      url: 'https://example.com/prior.vcon',
      content_hash: ['sha512-abc', 'sha256-def']
    });
  });
});
