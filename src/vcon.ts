import { v4 as uuidv4 } from 'uuid';
import {
  VconData,
  Attachment,
  Party,
  Dialog,
  Analysis,
  Encoding,
  Redacted,
  Amended,
  VCON_VERSION
} from './types';
import { Attachment as AttachmentClass } from './attachment';
import { Party as PartyClass } from './party';
import { Dialog as DialogClass } from './dialog';
import * as crypto from 'crypto';

/**
 * Main Vcon class for creating and managing vCon conversation containers.
 * Compliant with IETF draft-ietf-vcon-vcon-core-02
 */
export class Vcon {
  data: VconData;

  constructor(vconDict: Partial<VconData> = {}) {
    this.data = {
      uuid: vconDict.uuid || uuidv4(),
      vcon: vconDict.vcon || VCON_VERSION,
      created_at: vconDict.created_at || new Date().toISOString(),
      updated_at: vconDict.updated_at,
      parties: vconDict.parties || [],
      dialog: vconDict.dialog || [],
      attachments: vconDict.attachments || [],
      analysis: vconDict.analysis || [],
      ...vconDict
    };
  }

  /**
   * Create a Vcon from a JSON string
   */
  static buildFromJson(jsonString: string): Vcon {
    try {
      const data = JSON.parse(jsonString);
      return new Vcon(data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse vCon JSON: ${errorMessage}`);
    }
  }

  /**
   * Create a new empty Vcon with default values
   */
  static buildNew(): Vcon {
    return new Vcon();
  }

  // Tag methods — per speckit, tags are stored as a single attachment with
  // purpose="tags", party=0, dialog=0, encoding="json", and a JSON-string
  // body. We keep an in-memory dictionary API but always read from / write
  // through that attachment.

  private getTagsAttachment(): Attachment | undefined {
    return this.data.attachments?.find(a => a.purpose === 'tags');
  }

  private decodeTags(): Record<string, any> {
    const att = this.getTagsAttachment();
    if (!att || typeof att.body !== 'string') return {};
    try {
      const parsed = JSON.parse(att.body);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  get tags(): Record<string, any> {
    return this.decodeTags();
  }

  getTag(tagName: string): string | undefined {
    return this.decodeTags()[tagName];
  }

  addTag(tagName: string, tagValue: string): void {
    const next = { ...this.decodeTags(), [tagName]: tagValue };
    const serialized = JSON.stringify(next);

    if (!this.data.attachments) this.data.attachments = [];
    const existing = this.getTagsAttachment();
    if (existing) {
      existing.body = serialized;
      existing.encoding = 'json';
    } else {
      this.data.attachments.push({
        purpose: 'tags',
        party: 0,
        dialog: 0,
        body: serialized,
        encoding: 'json',
        mediatype: 'application/json'
      });
    }
    this.data.updated_at = new Date().toISOString();
  }

  // Attachment methods

  findAttachmentByPurpose(purpose: string): Attachment | undefined {
    return this.data.attachments?.find(attachment => attachment.purpose === purpose);
  }

  /**
   * Add an attachment. Per draft-ietf-vcon-vcon-core-02 §4.5, `purpose`,
   * `party`, and `dialog` are required; party/dialog default to 0 when omitted.
   */
  addAttachment(params: {
    purpose: string;
    body?: any;
    encoding?: Encoding;
    url?: string;
    content_hash?: string | string[];
    mediatype?: string;
    filename?: string;
    start?: Date | string;
    party?: number;
    dialog?: number | number[];
  }): AttachmentClass {
    const attachment = new AttachmentClass(params);
    if (!this.data.attachments) {
      this.data.attachments = [];
    }
    this.data.attachments.push(attachment.toDict());
    this.data.updated_at = new Date().toISOString();
    return attachment;
  }

  // Analysis methods

  findAnalysisByType(type: string): Analysis | undefined {
    return this.data.analysis?.find(analysis => analysis.type === type);
  }

  addAnalysis(params: {
    type: string;
    dialog: number | number[];
    vendor?: string;
    product?: string;
    schema?: string;
    body?: string | Record<string, any> | any[];
    encoding?: Encoding;
    url?: string;
    content_hash?: string | string[];
    mediatype?: string;
    filename?: string;
  }): void {
    // Per draft-ietf-vcon-vcon-core-02 §4.4 the analysis body MUST be a
    // string. When callers hand us an object or array we serialize and
    // force encoding="json" so the emitted vCon validates.
    const { body, encoding, ...rest } = params;
    const analysis: Analysis = { ...rest };

    if (body !== undefined) {
      if (typeof body === 'string') {
        analysis.body = body;
        if (encoding) analysis.encoding = encoding;
      } else {
        analysis.body = JSON.stringify(body);
        analysis.encoding = 'json';
      }
    } else if (encoding) {
      analysis.encoding = encoding;
    }

    if (!this.data.analysis) {
      this.data.analysis = [];
    }
    this.data.analysis.push(analysis);
    this.data.updated_at = new Date().toISOString();
  }

  // Party methods

  addParty(party: PartyClass): void {
    if (!this.data.parties) {
      this.data.parties = [];
    }
    this.data.parties.push(party.toDict());
    this.data.updated_at = new Date().toISOString();
  }

  findPartyIndex(by: string, val: string): number | undefined {
    const index = this.data.parties?.findIndex(party => party[by] === val);
    return index !== undefined && index >= 0 ? index : undefined;
  }

  // Dialog methods

  findDialog(by: string, val: any): DialogClass | undefined {
    const dialog = this.data.dialog?.find(d => d[by] === val);
    return dialog ? new DialogClass(dialog) : undefined;
  }

  addDialog(dialog: DialogClass): void {
    if (!this.data.dialog) {
      this.data.dialog = [];
    }
    this.data.dialog.push(dialog.toDict());
    this.data.updated_at = new Date().toISOString();
  }

  // Serialization methods

  /**
   * Convert vCon to JSON string
   */
  toJson(): string {
    return JSON.stringify(this.toDict());
  }

  /**
   * Convert vCon to plain object
   */
  toDict(): VconData {
    return { ...this.data };
  }

  // Extension methods (vcon-core-01)

  /**
   * Add an extension name to the extensions array
   */
  addExtension(name: string): void {
    if (!this.data.extensions) {
      this.data.extensions = [];
    }
    if (!this.data.extensions.includes(name)) {
      this.data.extensions.push(name);
      this.data.updated_at = new Date().toISOString();
    }
  }

  /**
   * Add a critical extension name
   */
  addCriticalExtension(name: string): void {
    if (!this.data.critical) {
      this.data.critical = [];
    }
    if (!this.data.critical.includes(name)) {
      this.data.critical.push(name);
      this.addExtension(name);
    }
  }

  /**
   * Check if an extension is used
   */
  hasExtension(name: string): boolean {
    return this.data.extensions?.includes(name) ?? false;
  }

  /**
   * Check if an extension is critical
   */
  isCriticalExtension(name: string): boolean {
    return this.data.critical?.includes(name) ?? false;
  }

  // Property getters

  get parties(): Party[] {
    return this.data.parties || [];
  }

  get dialog(): Dialog[] {
    return this.data.dialog || [];
  }

  get attachments(): Attachment[] {
    return this.data.attachments || [];
  }

  get analysis(): Analysis[] {
    return this.data.analysis || [];
  }

  get uuid(): string {
    return this.data.uuid!;
  }

  get vcon(): string {
    return this.data.vcon || VCON_VERSION;
  }

  get subject(): string | undefined {
    return this.data.subject;
  }

  set subject(value: string | undefined) {
    this.data.subject = value;
    this.data.updated_at = new Date().toISOString();
  }

  get created_at(): Date | string {
    return this.data.created_at!;
  }

  get updated_at(): Date | string | undefined {
    return this.data.updated_at;
  }

  get redacted(): Redacted | boolean | undefined {
    return this.data.redacted;
  }

  set redacted(value: Redacted | boolean | undefined) {
    if (value !== undefined && this.data.amended !== undefined) {
      throw new Error('vCon cannot set redacted while amended is set; the two are mutually exclusive (draft-ietf-vcon-vcon-core-02 §4.1.8/§4.1.9).');
    }
    this.data.redacted = value;
    this.data.updated_at = new Date().toISOString();
  }

  get amended(): Amended | boolean | undefined {
    return this.data.amended;
  }

  set amended(value: Amended | boolean | undefined) {
    if (value !== undefined && this.data.redacted !== undefined) {
      throw new Error('vCon cannot set amended while redacted is set; the two are mutually exclusive (draft-ietf-vcon-vcon-core-02 §4.1.8/§4.1.9).');
    }
    this.data.amended = value;
    this.data.updated_at = new Date().toISOString();
  }

  get extensions(): string[] | undefined {
    return this.data.extensions;
  }

  get critical(): string[] | undefined {
    return this.data.critical;
  }

  get meta(): Record<string, any> | undefined {
    return this.data.meta;
  }

  set meta(value: Record<string, any> | undefined) {
    this.data.meta = value;
    this.data.updated_at = new Date().toISOString();
  }
}
