import { Party as PartyType, CivicAddress, PartyHistory as PartyHistoryType } from './types';
import { Event } from './event';
import { warn } from './util';

/**
 * Party class representing a conversation participant.
 * Compliant with IETF draft-ietf-vcon-vcon-core
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
   * Validate the party against vcon-core recommendations
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
 * PartyHistory class: the 0.4.0 party history entry of a Dialog.
 *
 * @deprecated core-05 removed `party_history` from the Dialog. A party history
 * entry is an Event Object whose `sessions` lists the Session(s) it applies to.
 * Constructing a PartyHistory warns; convert it with toEvent().
 */
export class PartyHistory implements PartyHistoryType {
  /** Valid party history events per vcon-core Section 4.3.11.1 */
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
    warn('PartyHistory is deprecated: core-05 has no Dialog party_history; use an Event (PartyHistory.toEvent).');
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
   * Convert to plain object with ISO timestamp (the 0.4.0 shape)
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
   * Convert to a core-05 Event. `sessions` is the Session index or indices the
   * entry applies to (the Sessions that list the Dialog it came from).
   */
  toEvent(sessions: number | number[]): Event {
    return new Event({
      type: this.event,
      time: this.time,
      sessions,
      party: this.party,
      ...(this.button !== undefined ? { button: this.button } : {})
    });
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
