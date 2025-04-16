import { v4 as uuidv4 } from 'uuid';
import { VconData, Attachment, Party, Dialog, Analysis, Encoding } from './types';
import { Attachment as AttachmentClass } from './attachment';
import { Party as PartyClass } from './party';
import { Dialog as DialogClass } from './dialog';
import * as jose from 'jose';
import * as crypto from 'crypto';

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
      encoding: params.encoding || 'none'
    };

    if (params.extra) {
      analysis.extra = params.extra;
    }

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

  /**
   * Sign the vCon using JWS (JSON Web Signature).
   * 
   * This method signs the vCon using the provided private key, adding the signature
   * information to the vCon. The signature can later be verified using the
   * corresponding public key.
   * 
   * @param privateKey - The RSA private key in PEM format or as a crypto.KeyObject
   * @throws Error - If there is an error during the signing process
   * 
   * @example
   * ```typescript
   * import * as crypto from 'crypto';
   * const { privateKey } = crypto.generateKeyPairSync('rsa', {
   *   modulusLength: 2048,
   *   publicKeyEncoding: { type: 'spki', format: 'pem' },
   *   privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
   * });
   * const vcon = Vcon.buildNew();
   * vcon.sign(privateKey);
   * ```
   */
  async sign(privateKey: string | crypto.KeyObject): Promise<void> {
    try {
      console.log("Signing vCon with JWS");
      
      // Convert the vCon to a JSON string for signing
      const payload = this.toJson();
      
      // Create the protected header
      const protectedHeader = { alg: 'RS256', typ: 'JWS' };
      
      // Convert private key to key object if it's a string
      let keyObject: crypto.KeyObject;
      if (typeof privateKey === 'string') {
        keyObject = crypto.createPrivateKey(privateKey);
      } else {
        keyObject = privateKey;
      }
      
      // Create a JWS signer
      const privateJwk = await jose.exportJWK(keyObject);
      
      // Sign the payload
      const jws = await new jose.CompactSign(
        new TextEncoder().encode(payload)
      )
        .setProtectedHeader(protectedHeader)
        .sign(keyObject);
      
      // Split the compact JWS into its components
      const [header, payloadB64, signature] = jws.split('.');
      
      // Update the vCon with the signature information
      this.data.signatures = [{ protected: header, signature }];
      this.data.payload = payloadB64;
      
      // Remove the original vCon properties that are now in the payload
      // to match the signed vCon format
      Object.keys(this.data).forEach(key => {
        if (!['signatures', 'payload'].includes(key)) {
          delete this.data[key as keyof VconData];
        }
      });
      
      console.log("Successfully signed vCon");
    } catch (error) {
      console.error("Failed to sign vCon:", error);
      throw error;
    }
  }

  /**
   * Verify the JWS signature of the vCon.
   * 
   * This method verifies the vCon's signature using the provided public key.
   * The vCon must have been previously signed using the corresponding private key.
   * 
   * @param publicKey - The RSA public key in PEM format or as a crypto.KeyObject
   * @returns true if the signature is valid, false otherwise
   * @throws Error - If the vCon is not signed
   * 
   * @example
   * ```typescript
   * import * as crypto from 'crypto';
   * const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
   *   modulusLength: 2048,
   *   publicKeyEncoding: { type: 'spki', format: 'pem' },
   *   privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
   * });
   * const vcon = Vcon.buildNew();
   * await vcon.sign(privateKey);
   * const isValid = await vcon.verify(publicKey);
   * console.log(isValid);  // Prints true
   * ```
   */
  async verify(publicKey: string | crypto.KeyObject): Promise<boolean> {
    if (!this.data.signatures || !this.data.payload) {
      console.error("Cannot verify: vCon is not signed");
      throw new Error("vCon is not signed");
    }
    
    try {
      console.log("Verifying vCon signature");
      
      // Reconstruct the compact JWS
      const { protected: protectedHeader, signature } = this.data.signatures[0];
      const compactJws = `${protectedHeader}.${this.data.payload}.${signature}`;
      
      // Convert public key to key object if it's a string
      let keyObject: crypto.KeyObject;
      if (typeof publicKey === 'string') {
        keyObject = crypto.createPublicKey(publicKey);
      } else {
        keyObject = publicKey;
      }
      
      // Verify the signature
      await jose.compactVerify(compactJws, keyObject);
      
      console.log("Successfully verified vCon signature");
      return true;
    } catch (error) {
      console.warn("Invalid signature detected:", error);
      return false;
    }
  }

  /**
   * Generate a new RSA key pair for signing vCons.
   * 
   * This method generates a new RSA key pair that can be used for signing
   * and verifying vCons.
   * 
   * @returns A tuple containing the private key and public key as PEM strings
   * 
   * @example
   * ```typescript
   * const [privateKey, publicKey] = Vcon.generateKeyPair();
   * const vcon = Vcon.buildNew();
   * await vcon.sign(privateKey);
   * const isValid = await vcon.verify(publicKey);
   * console.log(isValid);  // Prints true
   * ```
   */
  static generateKeyPair(): [string, string] {
    console.log("Generating new RSA key pair");
    
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    console.log("Successfully generated RSA key pair");
    return [privateKey, publicKey];
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