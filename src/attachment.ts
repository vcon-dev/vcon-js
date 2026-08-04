import { Attachment as AttachmentType, Encoding } from './types';

const SHA512_CONTENT_HASH_RE = /^sha512-[A-Za-z0-9_-]{86}={0,2}$/;
function isValidContentHash(value: string): boolean {
  return SHA512_CONTENT_HASH_RE.test(value);
}

/**
 * Attachment class for representing attached files in a vCon.
 * Compliant with IETF draft-ietf-vcon-vcon-core
 */
export class Attachment implements Partial<AttachmentType> {
  /** Valid encodings per vcon-core */
  static readonly VALID_ENCODINGS: Encoding[] = ['base64url', 'json', 'none'];

  purpose?: string;
  start?: Date | string;
  party?: number;
  dialog?: number | number[];
  mediatype?: string;
  filename?: string;
  body?: any;
  encoding?: Encoding | string;
  url?: string;
  content_hash?: string | string[];
  [key: string]: any;

  constructor(params: Partial<AttachmentType> = {}) {
    if (params.encoding && !Attachment.VALID_ENCODINGS.includes(params.encoding as Encoding)) {
      throw new Error(
        `Invalid encoding: ${params.encoding}. Must be one of ${Attachment.VALID_ENCODINGS.join(', ')}`
      );
    }

    Object.assign(this, params);

    // Default party/dialog to 0 (vCon-level) when omitted — spec requires
    // both indices on every attachment.
    if (this.party === undefined) this.party = 0;
    if (this.dialog === undefined) this.dialog = 0;

    if (params.body !== undefined && !params.encoding) {
      this.encoding = 'none';
    }
  }

  /**
   * Convert attachment to plain object
   */
  toDict(): AttachmentType {
    const dict: AttachmentType = {};

    Object.entries(this).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convert Date objects to ISO strings
        if (value instanceof Date) {
          dict[key] = value.toISOString();
        } else {
          dict[key] = value;
        }
      }
    });

    return dict;
  }

  /**
   * Add external data reference (url + content_hash)
   */
  addExternalData(url: string, mediatype: string, options?: {
    filename?: string;
    content_hash?: string | string[];
  }): void {
    this.url = url;
    this.mediatype = mediatype;
    if (options?.filename) {
      this.filename = options.filename;
    }
    if (options?.content_hash) {
      this.content_hash = options.content_hash;
    }
    // Clear inline data
    this.body = undefined;
    this.encoding = undefined;
  }

  /**
   * Add inline data (body + encoding)
   */
  addInlineData(body: any, mediatype: string, options?: {
    encoding?: Encoding;
    filename?: string;
  }): void {
    this.body = body;
    this.mediatype = mediatype;
    this.encoding = options?.encoding || 'none';
    if (options?.filename) {
      this.filename = options.filename;
    }
    // Clear external data
    this.url = undefined;
    this.content_hash = undefined;
  }

  /**
   * Check if attachment has external data reference
   */
  isExternalData(): boolean {
    return this.url !== undefined;
  }

  /**
   * Check if attachment has inline data
   */
  isInlineData(): boolean {
    return this.body !== undefined;
  }

  /**
   * Validate the attachment against vcon-core requirements
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Core spec requires `purpose`. The one extension exception is the
    // lawful_basis attachment (draft-howe-vcon-lawful-basis), which uses
    // `type: "lawful_basis"`.
    const extType = (this as any).type;
    const isLawfulBasisExt = extType === 'lawful_basis';
    if (!this.purpose && !isLawfulBasisExt) {
      errors.push('Attachment must have a purpose (or be the lawful_basis extension)');
    }

    if (this.party === undefined) {
      errors.push('Attachment.party is required (use 0 for vCon-level)');
    }
    if (this.dialog === undefined) {
      errors.push('Attachment.dialog is required (use 0 for vCon-level)');
    }

    // Cannot have both inline and external data
    if (this.body !== undefined && this.url !== undefined) {
      errors.push('Attachment cannot have both inline (body) and external (url) data');
    }

    // Validate encoding if set
    if (this.encoding && !Attachment.VALID_ENCODINGS.includes(this.encoding as Encoding)) {
      errors.push(`Invalid encoding: ${this.encoding}. Must be one of: ${Attachment.VALID_ENCODINGS.join(', ')}`);
    }

    // External media MUST carry content_hash in spec-compliant format.
    if (this.url !== undefined) {
      if (this.content_hash === undefined) {
        errors.push('Attachment with external url MUST include content_hash');
      } else {
        const hashes = Array.isArray(this.content_hash) ? this.content_hash : [this.content_hash];
        const bad = hashes.filter(h => !isValidContentHash(h));
        if (bad.length > 0) {
          errors.push(
            `Invalid content_hash format: ${bad.join(', ')}. Expected sha512-<base64url-of-SHA-512-digest>`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
