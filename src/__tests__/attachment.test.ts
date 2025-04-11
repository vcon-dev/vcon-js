import { Attachment } from '../attachment';
import { Encoding } from '../types';

describe('Attachment', () => {
  it('should create an attachment with default encoding', () => {
    const attachment = new Attachment('application/pdf', 'content');
    
    expect(attachment.type).toBe('application/pdf');
    expect(attachment.body).toBe('content');
    expect(attachment.encoding).toBe('none');
    expect(attachment.toDict()).toEqual({
      type: 'application/pdf',
      body: 'content',
      encoding: 'none'
    });
  });

  it('should create an attachment with base64 encoding', () => {
    const attachment = new Attachment('application/pdf', 'base64content', 'base64');
    
    expect(attachment.type).toBe('application/pdf');
    expect(attachment.body).toBe('base64content');
    expect(attachment.encoding).toBe('base64');
    expect(attachment.toDict()).toEqual({
      type: 'application/pdf',
      body: 'base64content',
      encoding: 'base64'
    });
  });

  it('should create an attachment with base64url encoding', () => {
    const attachment = new Attachment('application/pdf', 'base64urlcontent', 'base64url');
    
    expect(attachment.type).toBe('application/pdf');
    expect(attachment.body).toBe('base64urlcontent');
    expect(attachment.encoding).toBe('base64url');
    expect(attachment.toDict()).toEqual({
      type: 'application/pdf',
      body: 'base64urlcontent',
      encoding: 'base64url'
    });
  });

  it('should throw error for invalid encoding', () => {
    expect(() => {
      new Attachment('application/pdf', 'content', 'invalid' as Encoding);
    }).toThrow('Invalid encoding: invalid. Must be one of base64, base64url, none');
  });

  it('should have valid encodings constant', () => {
    expect(Attachment.VALID_ENCODINGS).toEqual(['base64', 'base64url', 'none']);
  });
}); 