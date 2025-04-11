import { Attachment as AttachmentType, Encoding } from './types';

export class Attachment implements AttachmentType {
  readonly type: string;
  readonly body: any;
  readonly encoding: Encoding;

  static readonly VALID_ENCODINGS: Encoding[] = ['base64', 'base64url', 'none'];

  constructor(type: string, body: any, encoding: Encoding = 'none') {
    if (!Attachment.VALID_ENCODINGS.includes(encoding)) {
      throw new Error(`Invalid encoding: ${encoding}. Must be one of ${Attachment.VALID_ENCODINGS.join(', ')}`);
    }

    this.type = type;
    this.body = body;
    this.encoding = encoding;
  }

  toDict(): AttachmentType {
    return {
      type: this.type,
      body: this.body,
      encoding: this.encoding
    };
  }
} 