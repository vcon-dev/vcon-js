import { Vcon } from '../vcon';
import { Party } from '../party';
import { Dialog } from '../dialog';
import { Attachment } from '../attachment';
import { loadTestVcon, getAllTestVcons, getTestVconsByDirectory } from './utils';

describe('Vcon', () => {
  it('should create a new vCon with default values', () => {
    const vcon = Vcon.buildNew();
    
    expect(vcon.uuid).toBeDefined();
    expect(vcon.created_at).toBeInstanceOf(Date);
    expect(vcon.updated_at).toBeInstanceOf(Date);
    expect(vcon.parties).toEqual([]);
    expect(vcon.dialog).toEqual([]);
    expect(vcon.attachments).toEqual([]);
    expect(vcon.analysis).toEqual([]);
    expect(vcon.tags).toEqual({});
  });

  it('should create a vCon from JSON', () => {
    const json = JSON.stringify({
      uuid: 'test-uuid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      parties: [],
      dialog: [],
      attachments: [],
      analysis: [],
      tags: {}
    });
    
    const vcon = Vcon.buildFromJson(json);
    
    expect(vcon.uuid).toBe('test-uuid');
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

  it('should add and find dialogs', () => {
    const vcon = Vcon.buildNew();
    const dialog = new Dialog({
      type: 'text/plain',
      start: new Date(),
      parties: [0],
      body: 'Hello!',
      mimetype: 'text/plain'
    });
    
    vcon.addDialog(dialog);
    
    expect(vcon.dialog.length).toBe(1);
    expect(vcon.dialog[0].body).toBe('Hello!');
    
    const foundDialog = vcon.findDialog('body', 'Hello!');
    expect(foundDialog).toBeDefined();
    expect(foundDialog?.body).toBe('Hello!');
  });

  it('should add and find attachments', () => {
    const vcon = Vcon.buildNew();
    const attachment = vcon.addAttachment(
      'application/pdf',
      'base64EncodedContent',
      'base64'
    );
    
    expect(vcon.attachments.length).toBe(1);
    expect(vcon.attachments[0].type).toBe('application/pdf');
    
    const foundAttachment = vcon.findAttachmentByType('application/pdf');
    expect(foundAttachment).toBeDefined();
    expect(foundAttachment?.type).toBe('application/pdf');
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
});

describe('Vcon with synthetic data', () => {
  it('should load and parse synthetic vcons correctly', () => {
    const vcons = getAllTestVcons();
    expect(vcons.length).toBeGreaterThan(0);
    
    // Test the first vcon
    const vcon = vcons[0];
    expect(vcon.uuid).toBeDefined();
    expect(typeof vcon.created_at).toBe('string');
    expect(new Date(vcon.created_at)).toBeInstanceOf(Date); // Verify it's a valid date string
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
      const current = new Date(vcon.dialog[i].start);
      const previous = new Date(vcon.dialog[i-1].start);
      expect(current.getTime()).toBeGreaterThanOrEqual(previous.getTime());
    }
    
    // Test conversation flow
    const messages = vcon.dialog.map(d => d.body).filter((m): m is string => m !== undefined);
    expect(messages.some(m => m.includes('Hello'))).toBeTruthy();
    expect(messages.some(m => m.includes('thank you'))).toBeTruthy();
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