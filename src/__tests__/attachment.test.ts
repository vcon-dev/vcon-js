import { Attachment } from '../attachment';
import { Encoding } from '../types';

describe('Attachment', () => {
  it('should create an attachment with purpose and body', () => {
    const attachment = new Attachment({
      purpose: 'document',
      mediatype: 'application/pdf',
      body: 'content'
    });

    expect(attachment.purpose).toBe('document');
    expect(attachment.mediatype).toBe('application/pdf');
    expect(attachment.body).toBe('content');
    expect(attachment.encoding).toBe('none');
  });

  it('should create an attachment with purpose', () => {
    const attachment = new Attachment({
      purpose: 'transcript',
      body: 'content',
      mediatype: 'text/plain'
    });

    expect(attachment.purpose).toBe('transcript');
    expect(attachment.mediatype).toBe('text/plain');
    expect(attachment.encoding).toBe('none');
  });

  it('should create an attachment with base64url encoding', () => {
    const attachment = new Attachment({
      purpose: 'document',
      mediatype: 'application/pdf',
      body: 'base64urlcontent',
      encoding: 'base64url'
    });

    expect(attachment.purpose).toBe('document');
    expect(attachment.body).toBe('base64urlcontent');
    expect(attachment.encoding).toBe('base64url');
  });

  it('should create an attachment with json encoding', () => {
    const attachment = new Attachment({
      purpose: 'tags',
      mediatype: 'application/json',
      body: '{"key": "value"}',
      encoding: 'json'
    });

    expect(attachment.purpose).toBe('tags');
    expect(attachment.encoding).toBe('json');
  });

  it('should throw error for invalid encoding', () => {
    expect(() => {
      new Attachment({
        purpose: 'document',
        body: 'content',
        encoding: 'base64' as Encoding // base64 is not valid, only base64url
      });
    }).toThrow('Invalid encoding: base64. Must be one of base64url, json, none');
  });

  it('should default party to 0 but never default dialog or session', () => {
    const attachment = new Attachment({ purpose: 'tags', body: '{}' });

    expect(attachment.party).toBe(0);
    expect(attachment.dialog).toBeUndefined();
    expect(attachment.session).toBeUndefined();
    expect(attachment.validate().errors).toContain('Attachment needs at least one of dialog or session');
  });

  it('should accept a session index or list as the scope', () => {
    const a = new Attachment({ purpose: 'note', start: '2026-01-01T00:00:00Z', session: [0, 1], body: 'x' });
    expect(a.validate().valid).toBe(true);
    expect(a.toDict().session).toEqual([0, 1]);
  });

  it('should have valid encodings constant', () => {
    expect(Attachment.VALID_ENCODINGS).toEqual(['base64url', 'json', 'none']);
  });

  it('should handle external data', () => {
    const attachment = new Attachment({ purpose: 'avatar', mediatype: 'image/png' });

    attachment.addExternalData(
      'https://example.com/image.png',
      'image/png',
      { filename: 'image.png', content_hash: 'sha512-xyz789' }
    );

    expect(attachment.isExternalData()).toBe(true);
    expect(attachment.isInlineData()).toBe(false);
    expect(attachment.url).toBe('https://example.com/image.png');
    expect(attachment.mediatype).toBe('image/png');
    expect(attachment.filename).toBe('image.png');
    expect(attachment.content_hash).toBe('sha512-xyz789');
  });

  it('should handle inline data', () => {
    const attachment = new Attachment({ purpose: 'note', mediatype: 'text/plain' });

    attachment.addInlineData(
      'Hello World',
      'text/plain',
      { encoding: 'none', filename: 'greeting.txt' }
    );

    expect(attachment.isExternalData()).toBe(false);
    expect(attachment.isInlineData()).toBe(true);
    expect(attachment.body).toBe('Hello World');
    expect(attachment.mediatype).toBe('text/plain');
    expect(attachment.filename).toBe('greeting.txt');
    expect(attachment.encoding).toBe('none');
  });

  it('should support all vcon-core fields', () => {
    const start = new Date('2025-01-15T10:00:00Z');
    const attachment = new Attachment({
      purpose: 'contract',
      start,
      party: 0,
      dialog: 1,
      session: [0, 1],
      mediatype: 'application/pdf',
      filename: 'contract.pdf',
      body: 'base64content',
      encoding: 'base64url'
    });

    expect(attachment.purpose).toBe('contract');
    expect(attachment.start).toBe(start);
    expect(attachment.party).toBe(0);
    expect(attachment.dialog).toBe(1);
    expect(attachment.session).toEqual([0, 1]);
    expect(attachment.mediatype).toBe('application/pdf');
    expect(attachment.filename).toBe('contract.pdf');
  });

  it('should convert to dict with ISO date strings', () => {
    const start = new Date('2025-01-15T10:00:00Z');
    const attachment = new Attachment({
      purpose: 'document',
      start,
      body: 'content'
    });

    const dict = attachment.toDict();
    expect(dict.start).toBe('2025-01-15T10:00:00.000Z');
  });

  it('should validate attachment correctly', () => {
    // Valid attachment: purpose, start, party (defaults to 0) and a scope
    const validWithPurpose = new Attachment({ purpose: 'transcript', body: 'content', start: '2026-01-01T00:00:00Z', dialog: 0 });
    expect(validWithPurpose.validate().valid).toBe(true);

    // Invalid - no purpose
    const noPurpose = new Attachment({ body: 'content', start: '2026-01-01T00:00:00Z', dialog: 0 });
    const result1 = noPurpose.validate();
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContain('Attachment must have a purpose');

    // Invalid - both inline and external data
    const bothData = new Attachment({
      purpose: 'document',
      body: 'content',
      url: 'https://example.com'
    });
    const result2 = bothData.validate();
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContain('Attachment cannot have both inline (body) and external (url) data');
  });

  it('should support single dialog integer', () => {
    const attachment = new Attachment({
      purpose: 'document',
      dialog: 0,
      body: 'content'
    });

    expect(attachment.dialog).toBe(0);
    const dict = attachment.toDict();
    expect(dict.dialog).toBe(0);
  });

  it('should support array content_hash (vcon-core)', () => {
    const attachment = new Attachment({ purpose: 'avatar', mediatype: 'image/png' });

    attachment.addExternalData(
      'https://example.com/image.png',
      'image/png',
      { content_hash: ['sha512-abc123', 'sha256-def456'] }
    );

    expect(attachment.content_hash).toEqual(['sha512-abc123', 'sha256-def456']);

    const dict = attachment.toDict();
    expect(dict.content_hash).toEqual(['sha512-abc123', 'sha256-def456']);
  });
});
