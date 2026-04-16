import {
  Dialog as DialogType,
  PartyHistory,
  DialogType as DialogTypeEnum,
  DialogDisposition,
  Encoding,
  SessionId
} from './types';
import { PartyHistory as PartyHistoryClass } from './party';

/**
 * Dialog class representing a conversation segment.
 * Compliant with IETF draft-ietf-vcon-vcon-core-02
 */
export class Dialog implements Partial<DialogType> {
  /** Valid dialog types per vcon-core-02 */
  static readonly DIALOG_TYPES: DialogTypeEnum[] = ['recording', 'text', 'transfer', 'incomplete'];

  /** Valid dispositions for incomplete dialogs */
  static readonly DISPOSITIONS: DialogDisposition[] = [
    'no-answer',
    'congestion',
    'failed',
    'busy',
    'hung-up',
    'voicemail-no-message'
  ];

  /** Supported MIME types for media content */
  static readonly MIME_TYPES = [
    'text/plain',
    'audio/x-wav',
    'audio/wav',
    'audio/wave',
    'audio/mpeg',
    'audio/mp3',
    'audio/ogg',
    'audio/webm',
    'audio/x-m4a',
    'audio/aac',
    'video/mp4',
    'video/x-mp4',
    'video/ogg',
    'video/webm',
    'multipart/mixed',
    'message/rfc822',
    'application/json'
  ];

  /** Valid encodings per vcon-core-02 */
  static readonly VALID_ENCODINGS: Encoding[] = ['base64url', 'json', 'none'];

  readonly type: DialogTypeEnum | string;
  readonly start: Date | string;
  parties?: number | number[];
  originator?: number;
  mediatype?: string;
  filename?: string;
  body?: string;
  encoding?: Encoding | string;
  url?: string;
  content_hash?: string | string[];
  duration?: number;
  disposition?: DialogDisposition | string;
  session_id?: SessionId | SessionId[];
  party_history?: PartyHistory[];
  application?: string;
  message_id?: string;

  // Legacy/extension fields
  /** @deprecated Use mediatype instead */
  mimetype?: string;
  alg?: string;
  signature?: string;
  transferee?: number;
  transferor?: number;
  transfer_target?: number;
  original?: number;
  consultation?: number;
  target_dialog?: number;
  campaign?: string;
  interaction?: string;
  skill?: string;
  meta?: Record<string, any>;
  [key: string]: any;

  constructor(params: Partial<DialogType> & { type: DialogTypeEnum | string; start: Date | string }) {
    this.type = params.type;
    this.start = params.start;

    // Copy parties - can be number or number[] per vcon-core-02
    if (params.parties !== undefined) {
      this.parties = params.parties;
    }

    // Copy other properties
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && !['type', 'start', 'parties'].includes(key)) {
        (this as any)[key] = value;
      }
    });

    // Handle mediatype/mimetype compatibility
    if (params.mimetype && !params.mediatype) {
      this.mediatype = params.mimetype;
    }
  }

  toDict(): DialogType {
    const dict: DialogType = {
      type: this.type,
      start: this.start instanceof Date ? this.start.toISOString() : this.start
    };

    // Add parties if defined
    if (this.parties !== undefined) {
      dict.parties = this.parties;
    }

    // Only include properties that are not undefined
    Object.entries(this).forEach(([key, value]) => {
      if (value !== undefined && !['type', 'start', 'parties'].includes(key)) {
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
  addInlineData(body: string, mediatype: string, options?: {
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
   * Check if dialog has external data reference
   */
  isExternalData(): boolean {
    return this.url !== undefined;
  }

  /**
   * Check if dialog has inline data
   */
  isInlineData(): boolean {
    return this.body !== undefined;
  }

  /**
   * Check if dialog is text type
   */
  isText(): boolean {
    return this.type === 'text' || this.mediatype === 'text/plain';
  }

  /**
   * Check if dialog is recording type (audio)
   */
  isRecording(): boolean {
    return this.type === 'recording';
  }

  /**
   * Check if dialog is audio content
   */
  isAudio(): boolean {
    return [
      'audio/x-wav',
      'audio/wav',
      'audio/wave',
      'audio/mpeg',
      'audio/mp3',
      'audio/ogg',
      'audio/webm',
      'audio/x-m4a',
      'audio/aac'
    ].includes(this.mediatype || '');
  }

  /**
   * Check if dialog is video content
   */
  isVideo(): boolean {
    return ['video/mp4', 'video/x-mp4', 'video/ogg', 'video/webm'].includes(this.mediatype || '');
  }

  /**
   * Check if dialog is email content
   */
  isEmail(): boolean {
    return this.mediatype === 'message/rfc822';
  }

  /**
   * Check if dialog is a transfer type
   */
  isTransfer(): boolean {
    return this.type === 'transfer';
  }

  /**
   * Check if dialog is incomplete
   */
  isIncomplete(): boolean {
    return this.type === 'incomplete';
  }

  /**
   * Validate the dialog against vcon-core-02 requirements
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Type is required
    if (!this.type) {
      errors.push('Dialog type is required');
    }

    // Start is required
    if (!this.start) {
      errors.push('Dialog start time is required');
    }

    // If incomplete, disposition should be set
    if (this.type === 'incomplete' && !this.disposition) {
      errors.push('Disposition is required for incomplete dialogs');
    }

    // Validate disposition value if set
    if (this.disposition && !Dialog.DISPOSITIONS.includes(this.disposition as DialogDisposition)) {
      errors.push(`Invalid disposition: ${this.disposition}. Must be one of: ${Dialog.DISPOSITIONS.join(', ')}`);
    }

    // Cannot have both inline and external data
    if (this.body !== undefined && this.url !== undefined) {
      errors.push('Dialog cannot have both inline (body) and external (url) data');
    }

    // Validate encoding if set
    if (this.encoding && !Dialog.VALID_ENCODINGS.includes(this.encoding as Encoding)) {
      errors.push(`Invalid encoding: ${this.encoding}. Must be one of: ${Dialog.VALID_ENCODINGS.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
