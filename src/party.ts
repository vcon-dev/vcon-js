import { Party as PartyType, CivicAddress } from './types';

export class Party implements PartyType {
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

  constructor(params: Partial<PartyType> = {}) {
    Object.assign(this, params);
  }

  toDict(): PartyType {
    const dict: PartyType = {};
    
    // Only include properties that are not undefined
    Object.entries(this).forEach(([key, value]) => {
      if (value !== undefined) {
        dict[key] = value;
      }
    });

    return dict;
  }
}

export class PartyHistory {
  readonly party: number;
  readonly event: string;
  readonly time: Date;

  constructor(party: number, event: string, time: Date) {
    this.party = party;
    this.event = event;
    this.time = time;
  }

  toDict() {
    return {
      party: this.party,
      event: this.event,
      time: this.time.toISOString()
    };
  }
} 