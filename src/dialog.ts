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
 * Matches a spec-compliant content_hash: "sha512-" + base64url-encoded
 * SHA-512 digest. Base64url of 64 raw bytes is 86 chars; padding is optional
 * (RFC 4648 §5 forbids '=' in URL-safe contexts, but the spec corpus and
 * sibling libraries emit both forms, so we accept 0–2 '=' chars at the end).
 */
const SHA512_CONTENT_HASH_RE = /^sha512-[A-Za-z0-9_-]{86}={0,2}$/;

function isValidContentHash(value: string): boolean {
  return SHA512_CONTENT_HASH_RE.test(value);
}

/**
 * Dialog class representing a conversation segment.
 * Compliant with the current IETF vCon core draft (draft-ietf-vcon-vcon-core).
 */
export class Dialog implements Partial<DialogType> {
  /** Valid dialog types per the vCon core draft */
  static readonly DIALOG_TYPES: DialogTypeEnum[] = ['recording', 'text', 'transfer', 'incomplete', 'recording-set'];

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

  /** Valid encodings per vcon-core */
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
  recordings?: number[];
  recording_set?: number;

  // Legacy/extension fields
  /** @deprecated Use mediatype instead */
  mimetype?: string;
  alg?: string;
  signature?: string;
  transferee?: number;
  transferor?: number;
  transfer_target?: number | number[];
  original?: number | number[];
  consultation?: number | number[];
  target_dialog?: number | number[];
  provenance?: Record<string, any>;
  campaign?: string;
  interaction?: string;
  skill?: string;
  meta?: Record<string, any>;
  [key: string]: any;

  constructor(params: Partial<DialogType> & { type: DialogTypeEnum | string; start: Date | string }) {
    this.type = params.type;
    this.start = params.start;

    // Copy parties - can be number or number[] per vcon-core
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
   * Check if dialog is a recording-set (a collection referencing recording dialogs)
   */
  isRecordingSet(): boolean {
    return this.type === 'recording-set';
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
   * Validate the dialog against vcon-core requirements
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.type) {
      errors.push('Dialog type is required');
    }

    if (!this.start) {
      errors.push('Dialog start time is required');
    }

    if (this.type === 'incomplete' && !this.disposition) {
      errors.push('Disposition is required for incomplete dialogs');
    }

    if (this.disposition && !Dialog.DISPOSITIONS.includes(this.disposition as DialogDisposition)) {
      errors.push(`Invalid disposition: ${this.disposition}. Must be one of: ${Dialog.DISPOSITIONS.join(', ')}`);
    }

    if (this.body !== undefined && this.url !== undefined) {
      errors.push('Dialog cannot have both inline (body) and external (url) data');
    }

    if (this.encoding && !Dialog.VALID_ENCODINGS.includes(this.encoding as Encoding)) {
      errors.push(`Invalid encoding: ${this.encoding}. Must be one of: ${Dialog.VALID_ENCODINGS.join(', ')}`);
    }

    // External media MUST carry content_hash (spec §4.3.x) and the hash
    // format MUST be sha512-<base64url>.
    if (this.url !== undefined) {
      if (this.content_hash === undefined) {
        errors.push('Dialog with external url MUST include content_hash');
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

    // transfer-type dialogs MUST NOT carry party-conversation fields or content
    // (draft-ietf-vcon-vcon-core §4.3 transfer subtype).
    if (this.type === 'transfer') {
      const forbidden: Array<keyof DialogType> = ['parties', 'originator', 'mediatype', 'filename', 'body', 'url'];
      for (const key of forbidden) {
        if (this[key as string] !== undefined) {
          errors.push(`Transfer dialog MUST NOT include ${String(key)}`);
        }
      }
    }

    if (this.party_history) {
      this.party_history.forEach((entry, i) => {
        if (!PartyHistoryClass.VALID_EVENTS.includes(entry.event)) {
          errors.push(
            `Invalid party_history[${i}].event: ${entry.event}. Must be one of: ${PartyHistoryClass.VALID_EVENTS.join(', ')}`
          );
        }
        if ((entry.event === 'keydown' || entry.event === 'keyup') && !entry.button) {
          errors.push(`party_history[${i}]: button is required for ${entry.event} events`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
