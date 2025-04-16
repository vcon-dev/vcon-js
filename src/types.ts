export type Encoding = 'base64' | 'base64url' | 'json' | 'none';

export interface Attachment {
  type: string;
  body: any;
  encoding: Encoding;
}

export interface PartyHistory {
  party: number;
  event: string;
  time: Date;
}

export interface CivicAddress {
  country: string;
  locality: string;
  region: string;
  postcode: string;
  street: string;
}

export interface Party {
  tel?: string;
  stir?: string;
  mailto?: string;
  name?: string;
  validation?: string;
  gmlpos?: string;
  civicaddress?: CivicAddress;
  uuid?: string;
  role?: string;
  contact_list?: string;
  meta?: Record<string, any>;
  [key: string]: any;
}

export interface Dialog {
  type: string;
  start: Date;
  parties: number[];
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
}

export interface Analysis {
  type: string;
  dialog: number | number[];
  vendor: string;
  body: Record<string, any> | any[] | string;
  encoding?: Encoding;
  extra?: Record<string, any>;
}

// New interface for JWS signature components
export interface Signature {
  protected: string;
  signature: string;
  header?: Record<string, any>;
}

export interface VconData {
  uuid?: string;
  vcon?: string;
  subject?: string;
  created_at?: Date;
  updated_at?: Date;
  redacted?: boolean;
  appended?: boolean;
  group?: string;
  meta?: Record<string, any>;
  parties?: Party[];
  dialog?: Dialog[];
  attachments?: Attachment[];
  analysis?: Analysis[];
  tags?: Record<string, any>;
  
  // Original signature property
  signature?: {
    alg: string;
    signature: string;
  };
  
  // New JWS signature properties
  signatures?: Signature[];
  payload?: string;
}