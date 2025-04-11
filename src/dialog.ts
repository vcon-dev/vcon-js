import { Dialog as DialogType, PartyHistory } from './types';
import { PartyHistory as PartyHistoryClass } from './party';

export class Dialog implements DialogType {
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
    'multipart/mixed',
    'message/rfc822'
  ];

  readonly type: string;
  readonly start: Date;
  readonly parties: number[];
  originator?: number;
  mimetype?: string;
  filename?: string;
  body?: string;
  encoding?: string;
  url?: string;
  alg?: string;
  signature?: string;
  disposition?: string;
  party_history?: PartyHistory[];
  transferee?: number;
  transferor?: number;
  transfer_target?: number;
  original?: number;
  consultation?: number;
  target_dialog?: number;
  campaign?: string;
  interaction?: string;
  skill?: string;
  duration?: number;
  meta?: Record<string, any>;
  [key: string]: any;

  constructor(params: Partial<DialogType> & { type: string; start: Date; parties: number[] }) {
    this.type = params.type;
    this.start = params.start;
    this.parties = params.parties;
    
    // Copy other properties
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && !['type', 'start', 'parties'].includes(key)) {
        (this as any)[key] = value;
      }
    });
  }

  toDict(): DialogType {
    const dict: DialogType = {
      type: this.type,
      start: this.start,
      parties: this.parties
    };

    // Only include properties that are not undefined
    Object.entries(this).forEach(([key, value]) => {
      if (value !== undefined && !['type', 'start', 'parties'].includes(key)) {
        dict[key] = value;
      }
    });

    return dict;
  }

  addExternalData(url: string, filename: string, mimetype: string): void {
    if (!Dialog.MIME_TYPES.includes(mimetype)) {
      throw new Error(`Invalid MIME type: ${mimetype}`);
    }

    this.url = url;
    this.filename = filename;
    this.mimetype = mimetype;
    this.body = undefined;
    this.encoding = undefined;
  }

  addInlineData(body: string, filename: string, mimetype: string): void {
    if (!Dialog.MIME_TYPES.includes(mimetype)) {
      throw new Error(`Invalid MIME type: ${mimetype}`);
    }

    this.body = body;
    this.filename = filename;
    this.mimetype = mimetype;
    this.url = undefined;
  }

  isExternalData(): boolean {
    return this.url !== undefined;
  }

  isInlineData(): boolean {
    return this.body !== undefined;
  }

  isText(): boolean {
    return this.mimetype === 'text/plain';
  }

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
    ].includes(this.mimetype || '');
  }

  isVideo(): boolean {
    return ['video/mp4', 'video/x-mp4', 'video/ogg'].includes(this.mimetype || '');
  }

  isEmail(): boolean {
    return this.mimetype === 'message/rfc822';
  }
} 