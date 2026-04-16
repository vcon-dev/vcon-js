import { Attachment } from '../attachment';
import { Encoding } from '../types';

describe('Attachment', () => {
  it('should create an attachment with type and body', () => {
    const attachment = new Attachment({
      type: 'application/pdf',
      body: 'content'
    });

    expect(attachment.type).toBe('application/pdf');
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
      type: 'application/pdf',
      body: 'base64urlcontent',
      encoding: 'base64url'
    });

    expect(attachment.type).toBe('application/pdf');
    expect(attachment.body).toBe('base64urlcontent');
    expect(attachment.encoding).toBe('base64url');
  });

  it('should create an attachment with json encoding', () => {
    const attachment = new Attachment({
      type: 'application/json',
      body: '{"key": "value"}',
      encoding: 'json'
    });

    expect(attachment.type).toBe('application/json');
    expect(attachment.encoding).toBe('json');
  });

  it('should throw error for invalid encoding', () => {
    expect(() => {
      new Attachment({
        type: 'application/pdf',
        body: 'content',
        encoding: 'base64' as Encoding // base64 is not valid, only base64url
      });
    }).toThrow('Invalid encoding: base64. Must be one of base64url, json, none');
  });

  it('should have valid encodings constant', () => {
    expect(Attachment.VALID_ENCODINGS).toEqual(['base64url', 'json', 'none']);
  });

  it('should handle external data', () => {
    const attachment = new Attachment({ type: 'image/png' });

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
    const attachment = new Attachment({ type: 'text/plain' });

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

  it('should support all vcon-core-02 fields', () => {
    const start = new Date('2025-01-15T10:00:00Z');
    const attachment = new Attachment({
      type: 'document',
      purpose: 'contract',
      start,
      party: 0,
      dialog: [0, 1],
      mediatype: 'application/pdf',
      filename: 'contract.pdf',
      body: 'base64content',
      encoding: 'base64url'
    });

    expect(attachment.type).toBe('document');
    expect(attachment.purpose).toBe('contract');
    expect(attachment.start).toBe(start);
    expect(attachment.party).toBe(0);
    expect(attachment.dialog).toEqual([0, 1]);
    expect(attachment.mediatype).toBe('application/pdf');
    expect(attachment.filename).toBe('contract.pdf');
  });

  it('should convert to dict with ISO date strings', () => {
    const start = new Date('2025-01-15T10:00:00Z');
    const attachment = new Attachment({
      type: 'document',
      start,
      body: 'content'
    });

    const dict = attachment.toDict();
    expect(dict.start).toBe('2025-01-15T10:00:00.000Z');
  });

  it('should validate attachment correctly', () => {
    // Valid attachment with type
    const validWithType = new Attachment({ type: 'document', body: 'content' });
    expect(validWithType.validate().valid).toBe(true);

    // Valid attachment with purpose
    const validWithPurpose = new Attachment({ purpose: 'transcript', body: 'content' });
    expect(validWithPurpose.validate().valid).toBe(true);

    // Invalid - no type or purpose
    const noTypeOrPurpose = new Attachment({ body: 'content' });
    const result1 = noTypeOrPurpose.validate();
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContain('Attachment must have either type or purpose');

    // Invalid - both inline and external data
    const bothData = new Attachment({
      type: 'document',
      body: 'content',
      url: 'https://example.com'
    });
    const result2 = bothData.validate();
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContain('Attachment cannot have both inline (body) and external (url) data');
  });

  it('should support single dialog integer', () => {
    const attachment = new Attachment({
      type: 'document',
      dialog: 0,
      body: 'content'
    });

    expect(attachment.dialog).toBe(0);
    const dict = attachment.toDict();
    expect(dict.dialog).toBe(0);
  });

  it('should support array content_hash (vcon-core-02)', () => {
    const attachment = new Attachment({ type: 'image/png' });

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
