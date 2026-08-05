/**
 * vCon Type Definitions
 * Compliant with the current IETF vCon core draft (draft-ietf-vcon-vcon-core,
 * -latest; syntax parameter "0.4.0"). Tracks the authoritative
 * vcon_json_schema.json in the draft repo.
 * https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core
 */

/** Valid encoding types for inline content */
export type Encoding = 'base64url' | 'json' | 'none';

/** Dialog types as defined in the vCon core draft (incl. recording-set) */
export type DialogType = 'recording' | 'text' | 'transfer' | 'incomplete' | 'recording-set';

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

/** Party history event for tracking party state changes */
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

/** Dialog object representing a conversation segment */
export interface Dialog {
  /** Dialog type: 'recording', 'text', 'transfer', 'incomplete', or 'recording-set' */
  type: DialogType | string;
  /** Start time of dialog segment (RFC3339 format) */
  start: Date | string;
  /** Party indices contributing to dialog */
  parties?: number | number[];
  /** Originator party index if not first in parties list */
  originator?: number;
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
  /** Party event history */
  party_history?: PartyHistory[];
  /** Application identifier */
  application?: string;
  /** Message identifier for cross-referencing (e.g., SMTP message-id) */
  message_id?: string;
  /** recording-set: indices of the recording Dialog Objects in this set */
  recordings?: number[];
  /** Index of the recording-set Dialog Object this recording belongs to */
  recording_set?: number;

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
  /** Transfer target party index */
  transferee?: number;
  /** Transfer source party index */
  transferor?: number;
  /** Transfer target party index/indices */
  transfer_target?: number | number[];
  /** Original dialog index/indices */
  original?: number | number[];
  /** Consultation dialog index/indices */
  consultation?: number | number[];
  /** Target dialog index/indices */
  target_dialog?: number | number[];
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

/** Analysis object for analytical results */
export interface Analysis {
  /** Analysis type identifier (e.g., report, sentiment, summary, transcript, translation, tts) */
  type: string;
  /** Dialog index/indices analyzed (optional; analysis may key off `attachment` instead) */
  dialog?: number | number[];
  /** Attachment index/indices this analysis is based on */
  attachment?: number | number[];
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
 * Per draft-ietf-vcon-vcon-core §4.5, core attachments use `purpose`
 * (not `type`); `party` and `dialog` indices are REQUIRED. For vCon-level
 * attachments where no specific party/dialog applies, use 0/0.
 *
 * One spec-defined exception: the `lawful_basis` extension attachment
 * (draft-howe-vcon-lawful-basis) uses `type: "lawful_basis"`. Callers
 * needing that shape must attach it via the catch-all index signature.
 */
export interface Attachment {
  /** Purpose/category of attachment (e.g. "tags", "transcript", "consent") */
  purpose?: string;
  /** Reference time */
  start?: Date | string;
  /** Related party index (REQUIRED; use 0 for vCon-level) */
  party?: number;
  /** Related dialog index (REQUIRED; use 0 for vCon-level) */
  dialog?: number | number[];
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

  /** Allow additional properties for extensions (incl. the lawful_basis `type` field) */
  [key: string]: any;
}

/** Redacted object reference per Section 4.1.8.1 */
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

/** Amended object reference per Section 4.1.9.1 */
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
  /** vCon version string (deprecated in favor of extensions) */
  vcon?: string;
  /** Conversation subject */
  subject?: string;
  /** Creation timestamp (RFC3339 format, mandatory, immutable) */
  created_at?: Date | string;
  /** Last modification timestamp (RFC3339 format) */
  updated_at?: Date | string;
  /** Array of parties in the conversation (mandatory) */
  parties?: Party[];
  /** Array of dialog segments */
  dialog?: Dialog[];
  /** Array of attachments */
  attachments?: Attachment[];
  /** Array of analysis results */
  analysis?: Analysis[];
  /** Reference to redacted version */
  redacted?: Redacted | boolean;
  /** Reference to amended version */
  amended?: Amended | boolean;
  /** Names of non-core extensions used */
  extensions?: string[];
  /** Incompatible extension names requiring explicit support */
  critical?: string[];
  /** Additional metadata */
  meta?: Record<string, any>;
}

/** vCon version constant for vcon-core (note: vcon parameter is DEPRECATED per Section 4.1.1) */
export const VCON_VERSION = '0.4.0';
