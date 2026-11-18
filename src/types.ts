/**
 * vCon Type Definitions
 * Compliant with draft-ietf-vcon-vcon-core-05 (syntax parameter "0.5.0").
 * Tracks the Appendix C JSON Schema of that draft.
 * https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core
 */

/** Valid encoding types for inline content */
export type Encoding = 'base64url' | 'json' | 'none';

/** Dialog types defined by core-05. Transfers and recording sets are Events and Sessions now. */
export type DialogType = 'recording' | 'text' | 'incomplete';

/** Disposition values for incomplete dialogs */
export type DialogDisposition = 'no-answer' | 'congestion' | 'failed' | 'busy' | 'hung-up' | 'voicemail-no-message';

/** Content hash for externally referenced files (algorithm-hash format) */
export interface ContentHash {
  alg: string;
  value: string;
}

/** Session identifier object per RFC 7989 section 5 */
export interface SessionId {
  /** Local UUID as defined in RFC 7989 */
  local: string;
  /** Remote UUID as defined in RFC 7989 */
  remote: string;
}

/**
 * Party history entry of a 0.4.0 Dialog.
 * @deprecated Removed from the Dialog in 0.5.0; use an Event (see PartyHistory.toEvent).
 */
export interface PartyHistory {
  /** Index of the party for this event */
  party: number;
  /** Event type: join, drop, hold, unhold, mute, unmute, keydown, keyup */
  event: string;
  /** Time at which this event occurred */
  time: Date | string;
  /** DTMF digit or button label (required for keydown/keyup events) */
  button?: string;
}

/** Civic address for geographic location per RFC 5139 */
export interface CivicAddress {
  country?: string;
  a1?: string; // state/province
  a2?: string; // county
  a3?: string; // city
  a4?: string; // city division
  a5?: string; // neighborhood
  a6?: string; // street
  prd?: string; // leading street direction
  pod?: string; // trailing street suffix
  sts?: string; // street suffix
  hno?: string; // house number
  hns?: string; // house number suffix
  lmk?: string; // landmark
  loc?: string; // additional location info
  nam?: string; // name (residence/office)
  pc?: string; // postal code
  bld?: string; // building
  unit?: string; // unit
  flr?: string; // floor
  room?: string; // room
  plc?: string; // place type
  pcn?: string; // postal community name
  pobox?: string; // post office box
  addcode?: string; // additional code
  seat?: string; // seat
  rd?: string; // road
  rdsec?: string; // road section
  rdbr?: string; // road branch
  rdsubbr?: string; // road sub-branch
  prm?: string; // primary road name
  pom?: string; // post office name
  // Legacy fields for backward compatibility
  locality?: string;
  region?: string;
  postcode?: string;
  street?: string;
}

/** Party object representing a conversation participant */
export interface Party {
  /** Telephone URL (TEL format) */
  tel?: string;
  /** SIP address (addr-spec format) */
  sip?: string;
  /** Email address */
  mailto?: string;
  /** STIR PASSporT (JWS Compact Serialization) */
  stir?: string;
  /** Decentralized Identifier */
  did?: string;
  /** Free-form name string */
  name?: string;
  /** Participant identifier */
  uuid?: string;
  /** Identity validation method indicator */
  validation?: string;
  /** Geographic location (GML position format) */
  gmlpos?: string;
  /** Civic address object */
  civicaddress?: CivicAddress;
  /** Location timezone */
  timezone?: string;
  /** Participant type (schema-defined free-form token) */
  type?: string;
  /** Organization the party belongs to */
  org?: string;
  /** Department the party belongs to */
  dept?: string;
  /** Role in conversation (e.g., 'agent', 'contact', 'customer') */
  role?: string;
  /** Contact list reference */
  contact_list?: string;
  /** Additional metadata */
  meta?: Record<string, any>;
  /** Party identifier (for contact center scenarios) */
  id?: string;
  /** Allow additional properties for extensions */
  [key: string]: any;
}

/** Redacted segment of a Dialog's content (core-05 section 4.5) */
export interface RedactedSegment {
  /** Start of the redacted segment (offset into the content) */
  start: number;
  /** End of the redacted segment (offset into the content) */
  end: number;
  [key: string]: any;
}

/**
 * Dialog object representing a conversation segment.
 *
 * Under core-05 an empty Dialog (`{}`) is a valid placeholder that holds an
 * array position, so `type` is optional on the wire; the Dialog class always
 * sets it unless built with Dialog.placeholder().
 */
export interface Dialog {
  /** Dialog type: 'recording', 'text' or 'incomplete' (or an extension value) */
  type?: DialogType | string;
  /** Start time of dialog segment (RFC3339 format) */
  start?: Date | string;
  /**
   * Contributing party indices. An entry may be an index, a list of indices
   * (several contributors on one channel) or null (a channel with no
   * contributor). The receivers are the `parties` of the Session.
   */
  parties?: number | Array<number | number[] | null>;
  /** Media type string (MIME type) */
  mediatype?: string;
  /** Original filename */
  filename?: string;
  /** Duration in seconds */
  duration?: number;
  /** Disposition for incomplete type dialogs */
  disposition?: DialogDisposition | string;
  /** Session identifier object(s) */
  session_id?: SessionId | SessionId[];
  /** Application identifier */
  application?: string;
  /** Message identifier for cross-referencing (e.g., SMTP message-id) */
  message_id?: string;
  /** Segments of the content that were redacted */
  redacted_segments?: RedactedSegment[];

  // Inline content (mutually exclusive with url/content_hash)
  /** Inline content body */
  body?: string;
  /** Content encoding: 'base64url', 'json', or 'none' */
  encoding?: Encoding | string;

  // External content (mutually exclusive with body/encoding)
  /** External URL reference */
  url?: string;
  /** Content hash for externally referenced files (single or array for multiple algorithms) */
  content_hash?: string | string[];

  // Legacy/extension fields
  /** @deprecated Use mediatype instead */
  mimetype?: string;
  /** Signature algorithm */
  alg?: string;
  /** Digital signature */
  signature?: string;
  /** Generation provenance (draft-howe-vcon-provenance) for machine-generated dialog */
  provenance?: Record<string, any>;
  /** Campaign identifier (contact center extension) */
  campaign?: string;
  /** Interaction identifier (contact center extension) */
  interaction?: string;
  /** Skill identifier (contact center extension) */
  skill?: string;
  /** Additional metadata */
  meta?: Record<string, any>;
  /** Allow additional properties for extensions */
  [key: string]: any;
}

/** Relationship types between Sessions (core-05 section 4.2.8.2) */
export type SessionReferenceType = 'child' | 'peer' | 'precursor' | 'breakout';

/** Session_Reference Object: how another Session relates to this one */
export interface SessionReference {
  /** Index of the referenced Session */
  session: number;
  /** child, peer, precursor, breakout, or a value defined by an extension */
  type: SessionReferenceType | string;
  description?: string;
}

/**
 * Session Object (core-05 section 4.2). A Session with no parameters is valid.
 * The Dialog and Event Objects of a conversation hang off a Session.
 */
export interface Session {
  /** Start of the session (SHOULD be present) */
  start?: Date | string;
  /** Duration in seconds; absent means the session has no end */
  duration?: number;
  /** Receivers. The first party is the implied originator. */
  parties?: number[];
  /** Originator index, only when it is not the first party */
  originator?: number;
  session_id?: SessionId;
  /** Relationships to other Sessions */
  sessions?: SessionReference[];
  /** Indices of the Dialog Objects in the session */
  dialog?: number[];
  [key: string]: any;
}

/** Event types defined by core-05 (section 4.3.1) */
export type EventType =
  | 'join' | 'drop' | 'hold' | 'unhold' | 'mute' | 'unmute'
  | 'keydown' | 'keyup'
  | 'consultation-start' | 'blind-transfer' | 'consultative-transfer' | 'transfer-abandoned'
  | 'channel-contributors';

/** Event Object (core-05 section 4.3). Per-type parameter rules are in event.ts. */
export interface Event {
  /** Event type token, or a value defined by an extension */
  type: EventType | string;
  /** When the event occurred (RFC3339) */
  time: Date | string;
  /** Session index or indices the event applies to (not for channel-contributors) */
  sessions?: number | number[];
  /** Party index (the Transferor for transfer types) */
  party?: number;
  /** Dialog index (channel-contributors; SHOULD NOT be present otherwise) */
  dialog?: number | number[];
  /** Channel index (channel-contributors) */
  channel?: number;
  /** Contributing party index, indices, or null for no contributor (channel-contributors) */
  contributors?: number | number[] | null;
  /** DTMF digit or key label (keydown, keyup) */
  button?: string;
  /** Party index of the Transferee (transfer types) */
  transferee?: number;
  /** Party index of the Transfer Target (transfer types) */
  transfer_target?: number;
  /** Session index of the consultation call */
  consultation?: number;
  /** Session index of the target call */
  target_session?: number;
  /** Parameters defined by an extension */
  [key: string]: any;
}

/** Analysis object for analytical results */
export interface Analysis {
  /** Analysis type identifier (e.g., report, sentiment, summary, transcript, translation, tts) */
  type: string;
  /** Dialog index/indices analyzed (optional; analysis may key off `attachment` instead) */
  dialog?: number | number[];
  /** Session index/indices this analysis is based on */
  sessions?: number | number[];
  /** Attachment index/indices this analysis is based on */
  attachment?: number | number[];
  /** Other Analysis index/indices this analysis is based on (never itself) */
  analysis?: number | number[];
  /** Vendor name (REQUIRED per core schema) */
  vendor?: string;
  /** Product name */
  product?: string;
  /** Schema reference */
  schema?: string;
  /** Media type */
  mediatype?: string;
  /** Original filename */
  filename?: string;

  // Inline content (mutually exclusive with url/content_hash)
  /**
   * Analysis body content. Per draft-ietf-vcon-vcon-core §4.4 the body
   * MUST be a string; for JSON payloads, JSON.stringify the value and pair
   * with encoding="json". `addAnalysis` does this automatically when given
   * an object or array.
   */
  body?: string;
  /** Content encoding */
  encoding?: Encoding | string;

  // External content (mutually exclusive with body/encoding)
  /** External URL reference */
  url?: string;
  /** Content hash for externally referenced files (single or array for multiple algorithms) */
  content_hash?: string | string[];

  /** Generation provenance (draft-howe-vcon-provenance) describing the model call */
  provenance?: Record<string, any>;

  /**
   * Allow additional properties for extensions. Every extension parameter
   * (lawful_basis, wtf, sip-signaling, lifecycle, etc.) round-trips through
   * this catch-all untyped; only params registered directly on core objects
   * (e.g. `provenance`) are given named fields above.
   */
  [key: string]: any;
}

/**
 * Attachment object for related files.
 *
 * Per core-05 section 4.6, `purpose`, `start` and `party` are set, plus at
 * least one of `dialog` (a single index) or `session` (an index or list).
 * The library never invents the scope: Vcon.addAttachment() defaults it only
 * when the vCon has exactly one Session.
 *
 * The lawful_basis extension attachment (draft-howe-vcon-lawful-basis) uses
 * `purpose: "lawful_basis"`, scoped with `party` plus `session`.
 */
export interface Attachment {
  /** Purpose/category of attachment (e.g. "tags", "transcript", "consent") */
  purpose?: string;
  /** Reference time */
  start?: Date | string;
  /** Index of the party that contributed the attachment */
  party?: number;
  /** Related dialog index */
  dialog?: number;
  /** Related Session index or indices */
  session?: number | number[];
  /** Media type */
  mediatype?: string;
  /** Original filename */
  filename?: string;

  // Inline content (mutually exclusive with url/content_hash)
  /** Attachment body content */
  body?: any;
  /** Content encoding */
  encoding?: Encoding | string;

  // External content (mutually exclusive with body/encoding)
  /** External URL reference */
  url?: string;
  /** Content hash for externally referenced files (single or array for multiple algorithms) */
  content_hash?: string | string[];

  /** Allow additional properties for extensions */
  [key: string]: any;
}

/** redacted_from object: reference to the unredacted vCon (core-05 section 4.1.8) */
export interface Redacted {
  /** UUID of original unredacted vCon */
  uuid?: string;
  /** Type of redaction performed (indicates what information was redacted) */
  type?: string;
  /** URL to original vCon (access should be restricted) */
  url?: string;
  /** Content hash for integrity (single or array for multiple algorithms) */
  content_hash?: string | string[];
}

/** amended_from object: reference to the prior vCon version (core-05 section 4.1.9) */
export interface Amended {
  /** UUID of prior vCon instance version */
  uuid?: string;
  /** URL to prior vCon version */
  url?: string;
  /** Content hash for integrity (single or array for multiple algorithms) */
  content_hash?: string | string[];
}

export interface VconData {
  /** Globally unique identifier (preferably UUID v8) */
  uuid?: string;
  /** vCon syntax version. Optional; "0.5.0" for vCons this library writes. */
  vcon?: string;
  /** Conversation subject */
  subject?: string;
  /** Creation timestamp (RFC3339 format, mandatory, immutable) */
  created_at?: Date | string;
  /** Last modification timestamp (RFC3339 format) */
  updated_at?: Date | string;
  /** Array of parties in the conversation (mandatory) */
  parties?: Party[];
  /** Array of Session Objects; at least one when dialog or events are non-empty */
  sessions?: Session[];
  /** Array of Event Objects */
  events?: Event[];
  /** Array of dialog segments. An empty object is a valid placeholder. */
  dialog?: Dialog[];
  /** Array of attachments */
  attachments?: Attachment[];
  /** Array of analysis results */
  analysis?: Analysis[];
  /** Reference to the unredacted vCon (exclusive with amended_from) */
  redacted_from?: Redacted;
  /** Reference to the prior vCon version (exclusive with redacted_from) */
  amended_from?: Amended;
  /** Redacted substrings, referenced as __REDACTED_REF_n in text */
  redacted_strings?: RedactedString[];
  /** Names of non-core extensions used. MUST list every extension in use. */
  extensions?: string[];
  /** Incompatible extension names requiring explicit support */
  critical?: string[];
  /** Additional metadata */
  meta?: Record<string, any>;
  /** JWS general serialization: base64url payload, set by Vcon.sign() */
  payload?: string;
  /** JWS signatures, set by Vcon.sign() */
  signatures?: JwsSignature[];
}

/** One signature of a JWS general serialization */
export interface JwsSignature {
  /** base64url JWS protected header */
  protected?: string;
  /** Unprotected header */
  header?: Record<string, any>;
  /** base64url signature */
  signature: string;
}

/** Entry of redacted_strings (core-05 section 4.1.16) */
export interface RedactedString {
  /** Reference number, 1 to 99999 */
  ref: number;
  [key: string]: any;
}

/** vCon syntax version this library writes. Readers also accept "0.4.0" and migrate it. */
export const VCON_VERSION = '0.5.0';

/** Syntax version of the previous core draft, accepted on read and migrated. */
export const LEGACY_VCON_VERSION = '0.4.0';
