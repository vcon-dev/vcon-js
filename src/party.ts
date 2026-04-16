import { Party as PartyType, CivicAddress, PartyHistory as PartyHistoryType } from './types';

/**
 * Party class representing a conversation participant.
 * Compliant with IETF draft-ietf-vcon-vcon-core-02
 */
export class Party implements PartyType {
  tel?: string;
  sip?: string;
  mailto?: string;
  stir?: string;
  did?: string;
  name?: string;
  uuid?: string;
  validation?: string;
  gmlpos?: string;
  civicaddress?: CivicAddress;
  timezone?: string;
  role?: string;
  contact_list?: string;
  meta?: Record<string, any>;
  id?: string;
  [key: string]: any;

  constructor(params: Partial<PartyType> = {}) {
    Object.assign(this, params);
  }

  /**
   * Convert party to plain object, excluding undefined properties
   */
  toDict(): PartyType {
    const dict: PartyType = {};

    Object.entries(this).forEach(([key, value]) => {
      if (value !== undefined) {
        dict[key] = value;
      }
    });

    return dict;
  }

  /**
   * Check if party has any identifier set
   */
  hasIdentifier(): boolean {
    return !!(this.tel || this.sip || this.mailto || this.stir || this.did || this.uuid);
  }

  /**
   * Get the primary identifier for this party
   */
  getPrimaryIdentifier(): string | undefined {
    return this.tel || this.sip || this.mailto || this.did || this.uuid;
  }

  /**
   * Validate the party against vcon-core-02 recommendations
   */
  validate(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Warn if no identifier is set
    if (!this.hasIdentifier()) {
      warnings.push('Party has no identifier (tel, sip, mailto, stir, did, or uuid)');
    }

    return {
      valid: true, // Parties don't have strict requirements
      warnings
    };
  }
}

/**
 * PartyHistory class for tracking party state changes within a dialog.
 * Compliant with IETF draft-ietf-vcon-vcon-core-02
 */
export class PartyHistory implements PartyHistoryType {
  /** Valid party history events per vcon-core-02 Section 4.3.11.1 */
  static readonly VALID_EVENTS = [
    'join',
    'drop',
    'hold',
    'unhold',
    'mute',
    'unmute',
    'keydown',
    'keyup'
  ];

  readonly party: number;
  readonly event: string;
  readonly time: Date | string;
  readonly button?: string;

  constructor(party: number, event: string, time: Date | string, button?: string) {
    this.party = party;
    this.event = event;
    this.time = time;
    if (button !== undefined) {
      this.button = button;
    }
  }

  /**
   * Create a PartyHistory from a plain object
   */
  static fromDict(data: PartyHistoryType): PartyHistory {
    return new PartyHistory(data.party, data.event, data.time, data.button);
  }

  /**
   * Convert to plain object with ISO timestamp
   */
  toDict(): PartyHistoryType {
    const result: PartyHistoryType = {
      party: this.party,
      event: this.event,
      time: this.time instanceof Date ? this.time.toISOString() : this.time
    };
    if (this.button !== undefined) {
      result.button = this.button;
    }
    return result;
  }

  /**
   * Validate the party history event
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!PartyHistory.VALID_EVENTS.includes(this.event)) {
      errors.push(`Invalid event: ${this.event}. Must be one of: ${PartyHistory.VALID_EVENTS.join(', ')}`);
    }

    // button is required for keydown/keyup events
    if ((this.event === 'keydown' || this.event === 'keyup') && !this.button) {
      errors.push(`button parameter is required for ${this.event} events`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
