import {
  Dialog as DialogType,
  DialogType as DialogTypeEnum,
  DialogDisposition,
  Encoding,
  SessionId,
  RedactedSegment
} from './types';
import { DIALOG_MIME_TYPES, LEGACY_DIALOG_PARAMS, mediatypeOk } from './validation';
import { parseDateTime, warn } from './util';

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

/** Parameters of the Dialog constructor. */
export type DialogParams = Partial<DialogType> & {
  type: DialogTypeEnum | string;
  start: Date | string;
};

/**
 * Parameters that core-05 moved off the Dialog (to Session and Event Objects).
 * Passing one to the Dialog constructor throws, so a 0.4.0 shaped Dialog cannot
 * be built by accident. `transfer` is the 0.4.0 transfer details object.
 */
const REMOVED_PARAMS = [...LEGACY_DIALOG_PARAMS, 'transfer'];

/** Legacy media Dialog types: built as `recording`. */
const MEDIA_TYPE_ALIASES = ['audio', 'video'];

/**
 * Dialog class representing a conversation segment.
 * Compliant with draft-ietf-vcon-vcon-core-05.
 *
 * Under core-05 a Dialog is a recording, text or incomplete (failed setup)
 * segment. Transfers, party history and recording sets moved to Event and
 * Session Objects. An empty Dialog (`{}`, see Dialog.placeholder()) holds an
 * array position so Dialog indices stay stable.
 */
export class Dialog implements Partial<DialogType> {
  /** Valid dialog types per core-05 */
  static readonly DIALOG_TYPES: DialogTypeEnum[] = ['recording', 'text', 'incomplete'];

  /** Valid dispositions for incomplete dialogs */
  static readonly DISPOSITIONS: DialogDisposition[] = [
    'no-answer',
    'congestion',
    'failed',
    'busy',
    'hung-up',
    'voicemail-no-message'
  ];

  /** Supported MIME types for media content (text/*, message/* and multipart/* subtypes are also accepted) */
  static readonly MIME_TYPES: string[] = DIALOG_MIME_TYPES;

  /** Valid encodings per vcon-core */
  static readonly VALID_ENCODINGS: Encoding[] = ['base64url', 'json', 'none'];

  readonly type?: DialogTypeEnum | string;
  readonly start?: Date | string;
  /** Contributing parties (the Session lists the receivers) */
  parties?: number | Array<number | number[] | null>;
  mediatype?: string;
  filename?: string;
  body?: string;
  encoding?: Encoding | string;
  url?: string;
  content_hash?: string | string[];
  duration?: number;
  disposition?: DialogDisposition | string;
  session_id?: SessionId | SessionId[];
  application?: string;
  message_id?: string;
  redacted_segments?: RedactedSegment[];

  // Legacy/extension fields
  /** @deprecated Use mediatype instead */
  mimetype?: string;
  alg?: string;
  signature?: string;
  provenance?: Record<string, any>;
  campaign?: string;
  interaction?: string;
  skill?: string;
  meta?: Record<string, any>;
  [key: string]: any;

  constructor(params: DialogParams) {
    const removed = REMOVED_PARAMS.filter(k => params[k] !== undefined);
    if (removed.length) {
      throw new Error(
        `Dialog parameter(s) ${removed.join(', ')} were removed in vCon 0.5.0: put the receivers and originator ` +
          'on the Session, and record party history and transfers as Event Objects (see Event and PartyHistory.toEvent).'
      );
    }

    let type = params.type;
    if (typeof type === 'string' && MEDIA_TYPE_ALIASES.includes(type)) {
      warn(`Dialog type '${type}' is not defined by core-05; building a 'recording' Dialog.`);
      type = 'recording';
    }
    this.type = type;
    this.start = params.start;

    // Copy parties - number, list, nested list or null entries per core-05
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

  /**
   * An empty Dialog Object (`{}`), which core-05 permits as a placeholder that
   * holds an array position so that Dialog indices do not shift.
   */
  static placeholder(): Dialog {
    return Object.create(Dialog.prototype) as Dialog;
  }

  /**
   * Wrap an existing Dialog Object (for reading). Unlike the constructor this
   * does not reject 0.4.0 parameters, so it can wrap a Dialog from an
   * unmigrated vCon.
   */
  static fromDict(data: DialogType): Dialog {
    return Object.assign(Object.create(Dialog.prototype), data) as Dialog;
  }

  /** True for an empty placeholder Dialog. */
  isPlaceholder(): boolean {
    return Object.keys(this.toDict()).length === 0;
  }

  toDict(): DialogType {
    const dict: DialogType = {};
    if (this.type !== undefined) dict.type = this.type;
    if (this.start !== undefined) dict.start = this.start instanceof Date ? this.start.toISOString() : this.start;

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
   * @deprecated The transfer Dialog type was removed in 0.5.0; transfers are
   * Events. Always returns false.
   */
  isTransfer(): boolean {
    warn('Dialog.isTransfer() is deprecated: core-05 has no transfer Dialog; use transfer Events.');
    return false;
  }

  /**
   * Check if dialog is incomplete
   */
  isIncomplete(): boolean {
    return this.type === 'incomplete';
  }

  /**
   * Validate the dialog against core-05 requirements
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.isPlaceholder()) {
      return { valid: true, errors };
    }

    if (!this.type) {
      errors.push('Dialog type is required');
    } else if (!Dialog.DIALOG_TYPES.includes(this.type as DialogTypeEnum)) {
      errors.push(`Invalid dialog type: ${this.type}. Must be one of: ${Dialog.DIALOG_TYPES.join(', ')}`);
    }

    if (!this.start) {
      errors.push('Dialog start time is required');
    } else if (parseDateTime(this.start instanceof Date ? this.start.toISOString() : this.start) === undefined) {
      errors.push('Dialog start must be an ISO 8601 datetime');
    }

    if (this.type === 'incomplete') {
      if (!this.disposition) {
        errors.push('Disposition is required for incomplete dialogs');
      }
      // An incomplete Dialog has no content (core-05 section 4.5).
      for (const key of ['mediatype', 'filename', 'body', 'encoding', 'url', 'content_hash', 'message_id', 'redacted_segments']) {
        if (this[key] !== undefined) errors.push(`Incomplete dialog MUST NOT include ${key}`);
      }
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

    if (this.mediatype !== undefined && !mediatypeOk(this.mediatype, Dialog.MIME_TYPES)) {
      errors.push(`Invalid mediatype: ${this.mediatype}`);
    }

    // A url without a content_hash is allowed (WG direction on core issue #40);
    // a content_hash that is present MUST be well formed.
    if (this.url !== undefined && this.content_hash !== undefined) {
      const hashes = Array.isArray(this.content_hash) ? this.content_hash : [this.content_hash];
      const bad = hashes.filter(h => !isValidContentHash(h));
      if (bad.length > 0) {
        errors.push(
          `Invalid content_hash format: ${bad.join(', ')}. Expected sha512-<base64url-of-SHA-512-digest>`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
