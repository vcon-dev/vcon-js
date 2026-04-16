import { Attachment as AttachmentType, Encoding } from './types';

/**
 * Attachment class for representing attached files in a vCon.
 * Compliant with IETF draft-ietf-vcon-vcon-core-02
 */
export class Attachment implements Partial<AttachmentType> {
  /** Valid encodings per vcon-core-02 */
  static readonly VALID_ENCODINGS: Encoding[] = ['base64url', 'json', 'none'];

  type?: string;
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
    // Validate encoding if provided
    if (params.encoding && !Attachment.VALID_ENCODINGS.includes(params.encoding as Encoding)) {
      throw new Error(
        `Invalid encoding: ${params.encoding}. Must be one of ${Attachment.VALID_ENCODINGS.join(', ')}`
      );
    }

    // Copy all properties
    Object.assign(this, params);

    // Set default encoding for inline data
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
   * Validate the attachment against vcon-core-02 requirements
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Must have either type or purpose
    if (!this.type && !this.purpose) {
      errors.push('Attachment must have either type or purpose');
    }

    // Cannot have both inline and external data
    if (this.body !== undefined && this.url !== undefined) {
      errors.push('Attachment cannot have both inline (body) and external (url) data');
    }

    // Validate encoding if set
    if (this.encoding && !Attachment.VALID_ENCODINGS.includes(this.encoding as Encoding)) {
      errors.push(`Invalid encoding: ${this.encoding}. Must be one of: ${Attachment.VALID_ENCODINGS.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
