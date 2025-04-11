import { v4 as uuidv4 } from 'uuid';
import { VconData, Attachment, Party, Dialog, Analysis, Encoding } from './types';
import { Attachment as AttachmentClass } from './attachment';
import { Party as PartyClass } from './party';
import { Dialog as DialogClass } from './dialog';

export class Vcon {
  private data: VconData;

  constructor(vconDict: Partial<VconData> = {}) {
    this.data = {
      uuid: vconDict.uuid || uuidv4(),
      created_at: vconDict.created_at || new Date(),
      updated_at: vconDict.updated_at || new Date(),
      parties: vconDict.parties || [],
      dialog: vconDict.dialog || [],
      attachments: vconDict.attachments || [],
      analysis: vconDict.analysis || [],
      tags: vconDict.tags || {},
      ...vconDict
    };
  }

  static buildFromJson(jsonString: string): Vcon {
    try {
      const data = JSON.parse(jsonString);
      return new Vcon(data);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse vCon JSON: ${errorMessage}`);
    }
  }

  static buildNew(): Vcon {
    return new Vcon();
  }

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
    this.data.updated_at = new Date();
  }

  findAttachmentByType(type: string): Attachment | undefined {
    return this.data.attachments?.find(attachment => attachment.type === type);
  }

  addAttachment(type: string, body: any, encoding: Encoding = 'none'): AttachmentClass {
    const attachment = new AttachmentClass(type, body, encoding);
    if (!this.data.attachments) {
      this.data.attachments = [];
    }
    this.data.attachments.push(attachment.toDict());
    this.data.updated_at = new Date();
    return attachment;
  }

  findAnalysisByType(type: string): Analysis | undefined {
    return this.data.analysis?.find(analysis => analysis.type === type);
  }

  addAnalysis(params: {
    type: string;
    dialog: number | number[];
    vendor: string;
    body: Record<string, any> | any[] | string;
    encoding?: Encoding;
    extra?: Record<string, any>;
  }): void {
    const analysis: Analysis = {
      type: params.type,
      dialog: params.dialog,
      vendor: params.vendor,
      body: params.body,
      encoding: params.encoding || 'none',
      extra: params.extra || {}
    };

    if (!this.data.analysis) {
      this.data.analysis = [];
    }
    this.data.analysis.push(analysis);
    this.data.updated_at = new Date();
  }

  addParty(party: PartyClass): void {
    if (!this.data.parties) {
      this.data.parties = [];
    }
    this.data.parties.push(party.toDict());
    this.data.updated_at = new Date();
  }

  findPartyIndex(by: string, val: string): number | undefined {
    return this.data.parties?.findIndex(party => party[by] === val);
  }

  findDialog(by: string, val: any): DialogClass | undefined {
    const dialog = this.data.dialog?.find(d => d[by] === val);
    return dialog ? new DialogClass(dialog) : undefined;
  }

  addDialog(dialog: DialogClass): void {
    if (!this.data.dialog) {
      this.data.dialog = [];
    }
    this.data.dialog.push(dialog.toDict());
    this.data.updated_at = new Date();
  }

  toJson(): string {
    return JSON.stringify(this.toDict());
  }

  toDict(): VconData {
    return { ...this.data };
  }

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
    return this.data.vcon || '';
  }

  get subject(): string | undefined {
    return this.data.subject;
  }

  get created_at(): Date {
    return this.data.created_at!;
  }

  get updated_at(): Date {
    return this.data.updated_at!;
  }

  get redacted(): boolean {
    return this.data.redacted || false;
  }

  get appended(): boolean {
    return this.data.appended || false;
  }

  get group(): string | undefined {
    return this.data.group;
  }

  get meta(): Record<string, any> | undefined {
    return this.data.meta;
  }
} 