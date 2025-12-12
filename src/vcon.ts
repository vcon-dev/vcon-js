import { v4 as uuidv4 } from 'uuid';
import {
  VconData,
  Attachment,
  Party,
  Dialog,
  Analysis,
  Encoding,
  Group,
  Redacted,
  Amended,
  VCON_VERSION
} from './types';
import { Attachment as AttachmentClass } from './attachment';
import { Party as PartyClass } from './party';
import { Dialog as DialogClass } from './dialog';

/**
 * Main Vcon class for creating and managing vCon conversation containers.
 * Compliant with IETF draft-ietf-vcon-vcon-core-01
 */
export class Vcon {
  private data: VconData;

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
      tags: vconDict.tags || {},
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

  // Tag methods

  get tags(): Record<string, any> | undefined {
    return this.data.tags;
  }

  getTag(tagName: string): string | undefined {
    return this.data.tags?.[tagName];
  }

  addTag(tagName: string, tagValue: string): void {
    if (!this.data.tags) {
      this.data.tags = {};
    }
    this.data.tags[tagName] = tagValue;
    this.data.updated_at = new Date().toISOString();
  }

  // Attachment methods

  findAttachmentByType(type: string): Attachment | undefined {
    return this.data.attachments?.find(attachment => attachment.type === type);
  }

  findAttachmentByPurpose(purpose: string): Attachment | undefined {
    return this.data.attachments?.find(attachment => attachment.purpose === purpose);
  }

  addAttachment(params: {
    type?: string;
    purpose?: string;
    body?: any;
    encoding?: Encoding;
    url?: string;
    content_hash?: string;
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

  /**
   * @deprecated Use addAttachment with params object instead
   */
  addAttachmentLegacy(type: string, body: any, encoding: Encoding = 'none'): AttachmentClass {
    return this.addAttachment({ type, body, encoding });
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
    body?: Record<string, any> | any[] | string;
    encoding?: Encoding;
    url?: string;
    content_hash?: string;
    mediatype?: string;
    filename?: string;
    extra?: Record<string, any>;
  }): void {
    const analysis: Analysis = { ...params };

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

  // Group methods

  addGroup(group: Group | string): void {
    if (!this.data.group) {
      this.data.group = [];
    }
    (this.data.group as (Group | string)[]).push(group);
    this.data.updated_at = new Date().toISOString();
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
    this.data.redacted = value;
    this.data.updated_at = new Date().toISOString();
  }

  get amended(): Amended | boolean | undefined {
    return this.data.amended;
  }

  set amended(value: Amended | boolean | undefined) {
    this.data.amended = value;
    this.data.updated_at = new Date().toISOString();
  }

  get group(): Group[] | string[] | undefined {
    return this.data.group;
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

  /**
   * @deprecated Use amended instead (vcon-core-01 uses amended, not appended)
   */
  get appended(): boolean {
    return !!this.data.amended;
  }
}
