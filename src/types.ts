/**
 * vCon Type Definitions
 * Compliant with IETF draft-ietf-vcon-vcon-core-01
 * https://datatracker.ietf.org/doc/html/draft-ietf-vcon-vcon-core-01
 */

/** Valid encoding types for inline content */
export type Encoding = 'base64url' | 'json' | 'none';

/** Dialog types as defined in vcon-core-01 */
export type DialogType = 'recording' | 'text' | 'transfer' | 'incomplete';

/** Disposition values for incomplete dialogs */
export type DialogDisposition = 'no-answer' | 'congestion' | 'failed' | 'busy' | 'hung-up' | 'voicemail-no-message';

/** Content hash for externally referenced files (algorithm-hash format) */
export interface ContentHash {
  alg: string;
  value: string;
}

/** Session identifier object */
export interface SessionId {
  id: string;
  type?: string;
}

/** Party history event for tracking party state changes */
export interface PartyHistory {
  party: number;
  event: string;
  time: Date | string;
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
  /** Dialog type: 'recording', 'text', 'transfer', or 'incomplete' */
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

  // Inline content (mutually exclusive with url/content_hash)
  /** Inline content body */
  body?: string;
  /** Content encoding: 'base64url', 'json', or 'none' */
  encoding?: Encoding | string;

  // External content (mutually exclusive with body/encoding)
  /** External URL reference */
  url?: string;
  /** Content hash for externally referenced files */
  content_hash?: string;

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
  /** Transfer target reference */
  transfer_target?: number;
  /** Original dialog reference */
  original?: number;
  /** Consultation dialog reference */
  consultation?: number;
  /** Target dialog reference */
  target_dialog?: number;
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
  /** Analysis type identifier */
  type: string;
  /** Dialog indices analyzed */
  dialog: number | number[];
  /** Vendor name */
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
  /** Analysis body content */
  body?: Record<string, any> | any[] | string;
  /** Content encoding */
  encoding?: Encoding | string;

  // External content (mutually exclusive with body/encoding)
  /** External URL reference */
  url?: string;
  /** Content hash for externally referenced files */
  content_hash?: string;

  /** Additional properties */
  extra?: Record<string, any>;
  /** Allow additional properties for extensions */
  [key: string]: any;
}

/** Attachment object for related files */
export interface Attachment {
  /** Attachment type/purpose (MIME type or category) */
  type?: string;
  /** Purpose/category of attachment */
  purpose?: string;
  /** Reference time */
  start?: Date | string;
  /** Related party index */
  party?: number;
  /** Related dialog indices */
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
  /** Content hash for externally referenced files */
  content_hash?: string;

  /** Allow additional properties for extensions */
  [key: string]: any;
}

/** Group object for linking related vCons */
export interface Group {
  /** Group identifier */
  uuid: string;
  /** Group type/purpose */
  type?: string;
  /** Additional metadata */
  meta?: Record<string, any>;
}

/** Redacted object reference */
export interface Redacted {
  /** UUID of original unredacted vCon */
  uuid?: string;
  /** Additional redaction metadata */
  [key: string]: any;
}

/** Amended object reference */
export interface Amended {
  /** UUID of amended vCon */
  uuid?: string;
  /** Additional amendment metadata */
  [key: string]: any;
}

/**
 * Interface for JWS signature components according to the vCon specification.
 * Used in the signatures array of a signed vCon.
 */
export interface Signature {
  /**
   * The protected header in base64url encoding
   */
  protected: string;
  
  /**
   * The JWS signature in base64url encoding
   */
  signature: string;
  
  /**
   * Optional unprotected header
   */
  header?: Record<string, any>;
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
  /** Array of group references */
  group?: Group[] | string[];
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
  /** Tags for classification */
  tags?: Record<string, any>;
  
  /**
   * Original signature property - kept for backward compatibility
   */
  signature?: {
    alg: string;
    signature: string;
  };
  
  /**
   * JWS signature array according to the JWS JSON Serialization
   * Added when a vCon is signed using the sign() method
   */
  signatures?: Signature[];
  
  /**
   * Base64url encoded payload containing the original vCon data
   * Added when a vCon is signed using the sign() method
   */
  payload?: string;
}

/** vCon version constant for vcon-core-01 */
export const VCON_VERSION = '0.0.1';
