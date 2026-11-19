import { v4 as uuidv4 } from 'uuid';
import * as nodeCrypto from 'crypto';
import {
  VconData,
  Attachment,
  Party,
  Dialog,
  Analysis,
  Session as SessionType,
  Event as EventType,
  Encoding,
  Redacted,
  Amended,
  RedactedString,
  VCON_VERSION,
  LEGACY_VCON_VERSION
} from './types';
import { Attachment as AttachmentClass } from './attachment';
import { Party as PartyClass } from './party';
import { Dialog as DialogClass } from './dialog';
import { Session as SessionClass } from './session';
import { Event as EventClass } from './event';
import { migrate040To050, MigrationReport } from './migration';
import { encryptedForm, signedForm, signedPayload, validateVconDict } from './validation';
import { validateLawfulBasisAttachment } from './lawful-basis';
import { base64UrlDecodeToString, clone, decodeJsonPayload, isPlainObject, warn } from './util';

/** A JWS used `alg` "none" (forbidden by core-05) or an unsupported algorithm. */
export class AlgorithmNotPermittedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlgorithmNotPermittedError';
    Object.setPrototypeOf(this, AlgorithmNotPermittedError.prototype);
  }
}

/**
 * JWS algorithms accepted for signing and verifying. "none" is excluded:
 * core-05 section 6.2.2, "The alg parameter MUST NOT have the value none".
 */
export const PERMITTED_JWS_ALGORITHMS = [
  'RS256', 'RS384', 'RS512',
  'PS256', 'PS384', 'PS512',
  'ES256', 'ES384', 'ES512',
  'EdDSA'
] as const;

export type JwsAlgorithm = (typeof PERMITTED_JWS_ALGORITHMS)[number];

/** Key material accepted by sign() and verify(): a PEM string or buffer, or a KeyObject. */
export type KeyInput = string | Buffer | nodeCrypto.KeyObject;

export interface VconOptions {
  /**
   * Migrate a 0.4.0 vCon to 0.5.0 on load (default true). When false the 0.4.0
   * object is kept untouched and isValid() reports it as not 0.5.0.
   */
  migrateLegacy?: boolean;
  /** Passed to the migration as `strict`: throw when a required field has no source. */
  strictMigration?: boolean;
}

/** True if the object declares syntax 0.4.0, directly or in a signed payload. */
function isLegacy040(dict: any): boolean {
  if (!isPlainObject(dict)) return false;
  if (dict.vcon === LEGACY_VCON_VERSION) return true;
  if (!('vcon' in dict) && typeof dict.payload === 'string' && 'signatures' in dict) {
    try {
      const payload = decodeJsonPayload(dict.payload);
      return isPlainObject(payload) && payload.vcon === LEGACY_VCON_VERSION;
    } catch {
      return false;
    }
  }
  return false;
}

const HASHES: Record<string, string> = { '256': 'sha256', '384': 'sha384', '512': 'sha512' };

function jwsParams(alg: string): { hash: string | null; padding?: number; saltLength?: number; dsaEncoding?: 'ieee-p1363' } {
  if (alg === 'EdDSA') return { hash: null };
  const hash = HASHES[alg.slice(2)];
  if (alg.startsWith('RS')) return { hash };
  if (alg.startsWith('PS')) {
    return {
      hash,
      padding: nodeCrypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: nodeCrypto.constants.RSA_PSS_SALTLEN_DIGEST
    };
  }
  return { hash, dsaEncoding: 'ieee-p1363' };
}

function b64url(input: string | Buffer): string {
  return (typeof input === 'string' ? Buffer.from(input, 'utf8') : input).toString('base64url');
}

function assertPermittedAlg(alg: unknown): asserts alg is JwsAlgorithm {
  if (typeof alg !== 'string' || alg.trim().toLowerCase() === 'none') {
    throw new AlgorithmNotPermittedError('JWS alg "none" is not permitted (core-05 section 6.2.2)');
  }
  if (!(PERMITTED_JWS_ALGORITHMS as readonly string[]).includes(alg)) {
    throw new AlgorithmNotPermittedError(
      `JWS alg ${JSON.stringify(alg)} is not supported; use one of ${PERMITTED_JWS_ALGORITHMS.join(', ')}`
    );
  }
}

/**
 * Main Vcon class for creating and managing vCon conversation containers.
 * Compliant with draft-ietf-vcon-vcon-core-05 (syntax "0.5.0").
 */
export class Vcon {
  data: VconData;

  /**
   * MigrationReport when the input was migrated from 0.4.0 on load, else
   * undefined.
   */
  migrationReport?: MigrationReport;

  /**
   * @param vconDict A vCon object. An object that declares `"vcon": "0.4.0"`
   *   is migrated to 0.5.0 here, using migrate040To050(); the report is kept in
   *   `migrationReport`. A signed vCon whose payload is 0.4.0 is NOT migrated
   *   on load, because migrating drops the signature: verify it, then call
   *   Vcon.migrate040To050(). Any other (or no) `vcon` value is taken as is.
   */
  constructor(vconDict: Partial<VconData> | Record<string, any> = {}, options: VconOptions = {}) {
    const { migrateLegacy = true, strictMigration = false } = options;
    let input: Record<string, any> = vconDict;

    const legacy = isLegacy040(input);
    const signedLegacy = legacy && !('vcon' in input);
    if (signedLegacy) {
      // Migrating rewrites the payload, which drops the signature. Doing that
      // implicitly would make verify() impossible and, on a load-and-save path,
      // overwrite a signed record with an unsigned one. Keep it signed; migrate
      // explicitly with Vcon.migrate040To050() after verifying.
      warn('Signed 0.4.0 vCon loaded unmigrated; verify it, then call Vcon.migrate040To050() (the result must be signed again)', 'VconWarning');
    } else if (migrateLegacy && legacy) {
      const { vcon: migrated, report } = migrate040To050(input, { strict: strictMigration });
      this.migrationReport = report;
      warn(`Migrated vCon ${migrated.uuid} from 0.4.0 to 0.5.0 on load (${report.summary()})`, 'VconWarning');
      input = migrated;
    }

    if (legacy && !this.migrationReport) {
      // An unmigrated 0.4.0 (or signed 0.4.0) object is kept as is: no defaults
      // are added, so legacy parameters and the signature survive.
      this.data = clone(input) as VconData;
      return;
    }

    if (signedForm(input) || encryptedForm(input)) {
      // A JWS or JWE container (core-05 sections 6.2, 6.3) is kept exactly as
      // given: adding uuid, created_at or empty arrays would change (and for
      // JWS, invalidate) the document. isValid() checks it.
      this.data = clone(input) as VconData;
      return;
    }

    const created = input.created_at instanceof Date ? input.created_at.toISOString() : input.created_at;
    this.data = {
      uuid: input.uuid || uuidv4(),
      // An empty constructor builds a new 0.5.0 vCon. Input that is not empty and
      // has no `vcon` stays as it is: the parameter is optional in 0.5.0.
      vcon: input.vcon ?? (Object.keys(input).length === 0 ? VCON_VERSION : undefined),
      created_at: created || new Date().toISOString(),
      updated_at: input.updated_at,
      parties: input.parties || [],
      dialog: input.dialog || [],
      attachments: input.attachments || [],
      analysis: input.analysis || [],
      ...input
    } as VconData;
    // A string is kept exactly as written (rewriting it would change the
    // document and break a signature over it); a missing or empty value gets now.
    this.data.created_at = created || new Date().toISOString();
    if (this.data.vcon === undefined) delete this.data.vcon;
  }

  /**
   * Create a Vcon from a JSON string. A 0.4.0 vCon is migrated (see the constructor).
   */
  static buildFromJson(jsonString: string, options: VconOptions = {}): Vcon {
    let data: any;
    try {
      data = JSON.parse(jsonString);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse vCon JSON: ${errorMessage}`);
    }
    return new Vcon(data, options);
  }

  /**
   * Create a new empty Vcon with default values
   */
  static buildNew(): Vcon {
    return new Vcon();
  }

  /**
   * Explicitly migrate a 0.4.0 vCon (object or JSON string) and return a Vcon.
   * The report is available as `vcon.migrationReport`. Unlike the implicit
   * migration on load, this also accepts input with no `vcon` parameter and a
   * signed vCon (migrated as its unsigned payload; the result must be signed again).
   */
  static migrate040To050(source: string | Record<string, any>, options: { strict?: boolean } = {}): Vcon {
    const { vcon, report } = migrate040To050(source, options);
    const obj = new Vcon(vcon, { migrateLegacy: false });
    obj.migrationReport = report;
    return obj;
  }

  // Tag methods — tags are stored as a single attachment with purpose="tags",
  // party=0, encoding="json", and a JSON-string body. We keep an in-memory
  // dictionary API but always read from / write through that attachment.

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

  /**
   * Work out the `dialog` / `session` scope for a new attachment.
   *
   * Core-05 section 4.6 needs at least one of the two. The caller's values are
   * used as given and a dialog index is never widened to a Session. With
   * neither given, the scope is defaulted only when it is unambiguous: the vCon
   * has exactly one Session, which is then the whole conversation. Otherwise
   * this throws, because picking a Session (or adding a placeholder one) would
   * invent the scope.
   *
   * `wholeVcon` is for library metadata that describes the whole vCon
   * (addTag): every Session is listed, and an empty placeholder Session is
   * added when there is none.
   */
  private resolveAttachmentScope(
    dialog?: number,
    session?: number | number[],
    wholeVcon = false
  ): { dialog?: number; session?: number | number[] } {
    const scope: { dialog?: number; session?: number | number[] } = {};
    if (dialog !== undefined) scope.dialog = dialog;
    if (session !== undefined) scope.session = session;
    if (Object.keys(scope).length) return scope;
    if (wholeVcon) {
      if (!this.data.sessions || this.data.sessions.length === 0) {
        this.data.sessions = [...(this.data.sessions || []), {}];
        warn('Added an empty placeholder Session to scope the tags attachment', 'VconWarning');
      }
      return { session: this.data.sessions.map((_, i) => i) };
    }
    const count = this.data.sessions?.length ?? 0;
    if (count === 1) return { session: 0 };
    throw new Error(
      `An attachment needs dialog or session (core-05 section 4.6). The vCon has ${count} Sessions, ` +
        'so no default can be chosen; pass dialog or session (add a Session first with addSession() if the vCon has none).'
    );
  }

  addTag(tagName: string, tagValue: string): void {
    const next = { ...this.decodeTags(), [tagName]: tagValue };
    const serialized = JSON.stringify(next);

    if (!this.data.attachments) this.data.attachments = [];
    const existing = this.getTagsAttachment();
    if (existing) {
      existing.body = serialized;
      existing.encoding = 'json';
      // Backfill start on a legacy tags attachment that predates this field.
      if (existing.start === undefined) existing.start = new Date().toISOString();
    } else {
      const scope = this.resolveAttachmentScope(undefined, undefined, true);
      this.data.attachments.push({
        purpose: 'tags',
        // `start` is REQUIRED on every attachment per the core schema.
        start: new Date().toISOString(),
        party: 0,
        ...scope,
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
   * Add an attachment. Core-05 needs `party` plus `dialog` or `session`.
   * `party` defaults to 0 and `start` to the vCon's `created_at`. With neither
   * `dialog` nor `session`, the attachment is scoped to the only Session when
   * the vCon has exactly one; otherwise this throws rather than inventing a scope.
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
    dialog?: number;
    session?: number | number[];
  }): AttachmentClass {
    const scope = this.resolveAttachmentScope(params.dialog, params.session);
    const attachment = new AttachmentClass({
      ...params,
      ...scope,
      // The schema requires start on every attachment.
      start: params.start ?? this.data.created_at,
      mediatype: params.mediatype ?? (params.encoding === 'json' ? 'application/json' : undefined)
    });
    if (!this.data.attachments) {
      this.data.attachments = [];
    }
    this.data.attachments.push(attachment.toDict());
    this.data.updated_at = new Date().toISOString();
    return attachment;
  }

  /** Lawful basis attachments (`purpose: "lawful_basis"`), optionally for one party. */
  findLawfulBasisAttachments(party?: number): Attachment[] {
    return (this.data.attachments ?? []).filter(
      a => a.purpose === 'lawful_basis' && (party === undefined || a.party === party)
    );
  }

  /** True if the vCon carries at least one `purpose: "lawful_basis"` attachment. */
  hasLawfulBasis(): boolean {
    return this.findLawfulBasisAttachments().length > 0;
  }

  // Analysis methods

  findAnalysisByType(type: string): Analysis | undefined {
    return this.data.analysis?.find(analysis => analysis.type === type);
  }

  addAnalysis(params: {
    type: string;
    /** Dialog index/indices; optional */
    dialog?: number | number[];
    /** Session index/indices the analysis is based on */
    sessions?: number | number[];
    /** Attachment index/indices the analysis is based on */
    attachment?: number | number[];
    /** Other Analysis index/indices the analysis is based on (never itself) */
    analysis?: number | number[];
    vendor?: string;
    product?: string;
    schema?: string;
    body?: string | Record<string, any> | any[];
    encoding?: Encoding;
    url?: string;
    content_hash?: string | string[];
    mediatype?: string;
    filename?: string;
    provenance?: Record<string, any>;
  }): void {
    // The analysis body MUST be a string. When callers hand us an object or
    // array we serialize and force encoding="json" so the emitted vCon validates.
    const { body, encoding, ...rest } = params;
    const analysis: Analysis = { ...rest };

    if (body !== undefined) {
      if (typeof body === 'string') {
        analysis.body = body;
        // inline content needs an encoding (schema); a plain string is "none"
        analysis.encoding = encoding ?? 'none';
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
    return dialog ? DialogClass.fromDict(dialog) : undefined;
  }

  findDialogsByType(type: string): Dialog[] {
    return (this.data.dialog ?? []).filter(d => d.type === type);
  }

  /**
   * Add a Dialog and return its index in the `dialog` array. Use
   * Dialog.placeholder() to add an empty Dialog Object (`{}`) that holds a position.
   *
   * @param session Optional index of an existing Session; the new Dialog's
   *   index is appended to that Session's `dialog` list. Core-05 requires at
   *   least one Session when the vCon has Dialogs, so add Sessions with addSession().
   */
  addDialog(dialog: DialogClass, session?: number): number {
    if (session !== undefined) {
      const count = this.data.sessions?.length ?? 0;
      if (!Number.isInteger(session) || session < 0 || session >= count) {
        throw new Error(`Invalid session index: ${session}`);
      }
    }
    if (!this.data.dialog) {
      this.data.dialog = [];
    }
    this.data.dialog.push(dialog.toDict());
    const index = this.data.dialog.length - 1;
    if (session !== undefined) {
      const s = this.data.sessions![session];
      (s.dialog = s.dialog ?? []).push(index);
    }
    this.data.updated_at = new Date().toISOString();
    return index;
  }

  /**
   * Add an `incomplete` Dialog (a conversation that failed to be set up) and
   * return its index. An incomplete Dialog has no content; `details` is kept in
   * `meta.details`. `parties` is the party that attempted the conversation.
   */
  addIncompleteDialog(params: {
    start: Date | string;
    disposition: string;
    details?: Record<string, any>;
    parties?: number[];
    meta?: Record<string, any>;
    session?: number;
  }): number {
    const meta: Record<string, any> = { ...(params.meta ?? {}) };
    if (params.details) meta.details = params.details;
    const dialog = new DialogClass({
      type: 'incomplete',
      start: params.start,
      parties: params.parties ?? [],
      disposition: params.disposition,
      ...(Object.keys(meta).length ? { meta } : {})
    });
    return this.addDialog(dialog, params.session);
  }

  // Session and Event methods

  /**
   * Add a Session Object and return its index in the `sessions` array. With no
   * argument an empty placeholder Session (`{}`) is added, which core-05 permits.
   */
  addSession(session?: SessionClass | SessionType): number {
    let dict: SessionType;
    if (session === undefined) dict = {};
    else if (session instanceof SessionClass) dict = session.toDict();
    else dict = clone(session) as SessionType;
    if (!this.data.sessions) this.data.sessions = [];
    this.data.sessions.push(dict);
    this.data.updated_at = new Date().toISOString();
    return this.data.sessions.length - 1;
  }

  /**
   * Add an Event Object and return its index in the `events` array. An `Event`
   * is checked against the per-type parameter table when it is built; a plain
   * object is checked by isValid().
   */
  addEvent(event: EventClass | EventType): number {
    const dict = event instanceof EventClass ? event.toDict() : (clone(event) as EventType);
    if (!this.data.events) this.data.events = [];
    this.data.events.push(dict);
    this.data.updated_at = new Date().toISOString();
    return this.data.events.length - 1;
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

  // Extension methods

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

  // Validation

  /**
   * Validate the vCon against the core-05 rules.
   *
   * Checks required fields and types, that `vcon` (if present) is "0.5.0",
   * that Sessions, Events, Dialogs, attachments and analysis reference existing
   * objects, the per-event-type parameter table, that at least one Session
   * exists when there are Dialogs or Events, that attachments have `party` and
   * `dialog` or `session`, that `redacted_from` and `amended_from` are
   * exclusive, that `extensions` lists every extension in use (and every
   * `critical` entry), that every `__REDACTED_REF_#` has a `redacted_strings`
   * entry, that every `url` has a `content_hash` and every `content_hash` is
   * well formed, and the body of every `lawful_basis` attachment.
   *
   * SHOULD-level findings are not errors; see getValidationWarnings().
   */
  isValid(): { valid: boolean; errors: string[] } {
    const { errors } = this.validateAll();
    return { valid: errors.length === 0, errors };
  }

  /** SHOULD-level findings (for example SHOULD NOT parameters on Events). */
  getValidationWarnings(): string[] {
    return this.validateAll().warnings;
  }

  /** Core rules plus the body of every lawful_basis attachment. */
  private validateAll(): { errors: string[]; warnings: string[] } {
    const data = clone(this.data) as Record<string, any>;
    const { errors, warnings } = validateVconDict(data);
    // For a signed vCon the attachments are in the payload; an encrypted one cannot be read.
    let content: unknown = signedForm(data) ? signedPayload(data) : data;
    if (encryptedForm(data) || !isPlainObject(content)) content = {};
    const body = content as Record<string, any>;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    attachments.forEach((attachment: unknown, i: number) => {
      if (!isPlainObject(attachment) || attachment.purpose !== 'lawful_basis') return;
      if (isPlainObject(body.redacted_from) && !('body' in attachment)) return;
      // Scope (party, dialog/session) is checked by the core rules above.
      const result = validateLawfulBasisAttachment(attachment);
      errors.push(...result.errors.map(e => `Attachment at index ${i} (lawful_basis): ${e}`));
      warnings.push(
        ...result.warnings
          .filter(w => !w.includes('no party') && !w.includes('no session'))
          .map(w => `Attachment at index ${i} (lawful_basis): ${w}`)
      );
    });
    return { errors, warnings };
  }

  // Signing (JWS, general serialization with one signature)

  /**
   * Generate an RSA 2048 key pair for signing vCons.
   */
  static generateKeyPair(): { privateKey: nodeCrypto.KeyObject; publicKey: nodeCrypto.KeyObject } {
    return nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  }

  /**
   * Sign the vCon using JWS: adds `payload` (the base64url vCon JSON) and
   * `signatures` to the object.
   *
   * @param alg JWS algorithm (default "RS256", the value core-05 says SHOULD be
   *   used). "none" is rejected (6.2.2).
   * @throws AlgorithmNotPermittedError if `alg` is "none" (any case) or is not a permitted algorithm.
   */
  sign(privateKey: KeyInput, alg: JwsAlgorithm | string = 'RS256'): void {
    assertPermittedAlg(alg);
    const body: Record<string, any> = { ...this.data };
    delete body.payload;
    delete body.signatures;
    const header = b64url(JSON.stringify({ alg, typ: 'JWS' }));
    const payload = b64url(JSON.stringify(body));
    const { hash, padding, saltLength, dsaEncoding } = jwsParams(alg);
    const key: any = { key: privateKey };
    if (padding !== undefined) {
      key.padding = padding;
      key.saltLength = saltLength;
    }
    if (dsaEncoding) key.dsaEncoding = dsaEncoding;
    const signature = nodeCrypto.sign(hash, Buffer.from(`${header}.${payload}`), key);
    this.data.signatures = [{ protected: header, signature: b64url(signature) }];
    this.data.payload = payload;
  }

  /**
   * Verify the JWS signature of the vCon.
   *
   * @returns true if the signature is valid, false otherwise (including when no
   *   `alg` is declared, or the signature does not match).
   * @throws Error if the vCon is not signed.
   * @throws AlgorithmNotPermittedError if the signature declares `alg` "none"
   *   (in the protected header or the signature's header). Verification is
   *   refused rather than skipped.
   */
  verify(publicKey: KeyInput): boolean {
    if (!this.data.signatures || !this.data.payload) {
      throw new Error('vCon is not signed');
    }
    // Refuse alg "none" before anything else, from either header location.
    const sig0 = this.data.signatures[0] ?? {};
    const declared: unknown[] = [];
    try {
      if (sig0.protected) declared.push(JSON.parse(base64UrlDecodeToString(sig0.protected)).alg);
    } catch {
      return false; // protected header is not valid base64url JSON
    }
    if (isPlainObject(sig0.header) && 'alg' in sig0.header) declared.push(sig0.header.alg);
    for (const a of declared) {
      if (typeof a === 'string' && a.trim().toLowerCase() === 'none') {
        throw new AlgorithmNotPermittedError('JWS alg "none" is not permitted (core-05 section 6.2.2)');
      }
    }
    if (declared.length === 0) return false; // fails closed: no alg declared
    const alg = declared[0];
    if (typeof alg !== 'string' || !(PERMITTED_JWS_ALGORITHMS as readonly string[]).includes(alg)) return false;
    try {
      const { hash, padding, saltLength, dsaEncoding } = jwsParams(alg);
      const key: any = { key: publicKey };
      if (padding !== undefined) {
        key.padding = padding;
        key.saltLength = saltLength;
      }
      if (dsaEncoding) key.dsaEncoding = dsaEncoding;
      const data = Buffer.from(`${sig0.protected}.${this.data.payload}`);
      return nodeCrypto.verify(hash, data, key, Buffer.from(sig0.signature, 'base64url'));
    } catch {
      return false;
    }
  }

  // Property getters

  get parties(): Party[] {
    return this.data.parties || [];
  }

  get dialog(): Dialog[] {
    return this.data.dialog || [];
  }

  get sessions(): SessionType[] {
    return this.data.sessions || [];
  }

  get events(): EventType[] {
    return this.data.events || [];
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

  /** Syntax version, `"0.5.0"` for vCons this library writes; undefined if the input had none. */
  get vcon(): string | undefined {
    return this.data.vcon;
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

  get redacted_from(): Redacted | undefined {
    return this.data.redacted_from;
  }

  set redacted_from(value: Redacted | undefined) {
    if (value !== undefined && this.data.amended_from !== undefined) {
      throw new Error('vCon cannot set redacted_from while amended_from is set; the two are mutually exclusive.');
    }
    this.data.redacted_from = value;
    this.data.updated_at = new Date().toISOString();
  }

  get amended_from(): Amended | undefined {
    return this.data.amended_from;
  }

  set amended_from(value: Amended | undefined) {
    if (value !== undefined && this.data.redacted_from !== undefined) {
      throw new Error('vCon cannot set amended_from while redacted_from is set; the two are mutually exclusive.');
    }
    this.data.amended_from = value;
    this.data.updated_at = new Date().toISOString();
  }

  /** @deprecated 0.4.0 name; use redacted_from. */
  get redacted(): Redacted | undefined {
    warn('Vcon.redacted is deprecated; use Vcon.redacted_from (core-05)');
    return this.redacted_from;
  }

  set redacted(value: Redacted | undefined) {
    warn('Vcon.redacted is deprecated; use Vcon.redacted_from (core-05)');
    this.redacted_from = value;
  }

  /** @deprecated 0.4.0 name; use amended_from. */
  get amended(): Amended | undefined {
    warn('Vcon.amended is deprecated; use Vcon.amended_from (core-05)');
    return this.amended_from;
  }

  set amended(value: Amended | undefined) {
    warn('Vcon.amended is deprecated; use Vcon.amended_from (core-05)');
    this.amended_from = value;
  }

  get redacted_strings(): RedactedString[] {
    return this.data.redacted_strings || [];
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
