import { Attachment as AttachmentType, Encoding } from './types';

const SHA512_CONTENT_HASH_RE = /^sha512-[A-Za-z0-9_-]{86}={0,2}$/;
function isValidContentHash(value: string): boolean {
  return SHA512_CONTENT_HASH_RE.test(value);
}

/**
 * Attachment class for representing attached files in a vCon.
 * Compliant with draft-ietf-vcon-vcon-core-05.
 *
 * An attachment has `party` plus `dialog` (a single index) or `session` (an
 * index or list). The class never defaults the scope: the right index depends
 * on the vCon. Vcon.addAttachment() defaults it only when the vCon has
 * exactly one Session.
 */
export class Attachment implements Partial<AttachmentType> {
  /** Valid encodings per vcon-core */
  static readonly VALID_ENCODINGS: Encoding[] = ['base64url', 'json', 'none'];

  purpose?: string;
  start?: Date | string;
  party?: number;
  dialog?: number;
  session?: number | number[];
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

    // party defaults to 0 (the tags convention). dialog and session are NOT
    // defaulted: core-05 needs at least one of them, and the right value
    // depends on the vCon.
    if (this.party === undefined) this.party = 0;

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

    if (!this.purpose) {
      errors.push('Attachment must have a purpose');
    }

    if (!this.start) {
      errors.push('Attachment.start is required');
    }
    if (this.party === undefined) {
      errors.push('Attachment.party is required');
    }
    if (this.dialog === undefined && this.session === undefined) {
      errors.push('Attachment needs at least one of dialog or session');
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
