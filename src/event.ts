/**
 * Event Object (core-05 section 4.3) and the events array.
 *
 * An Event is a point-in-time occurrence inside one or more Sessions: a party
 * joining or dropping, a key press, a call transfer step, or a change of the
 * parties contributing to a recording channel.
 *
 * The per-type parameter applicability table of section 4.3.1.5 is held in
 * EVENT_PARAMETER_RULES and enforced by validateEvent() and by Vcon.isValid().
 *
 * Rule codes:
 *   M   the parameter MUST be present
 *   O   the parameter is optional
 *   SN  the parameter SHOULD NOT be present (reported as a warning)
 *   X   the parameter MUST NOT be present
 */
import { Event as EventType } from './types';
import { ValidateContext } from './session';
import { isIndex, isPlainObject, parseDateTime, toIso, warn } from './util';

export type RuleCode = 'M' | 'O' | 'SN' | 'X';

export const PARTY_EVENT_TYPES = ['join', 'drop', 'hold', 'unhold', 'mute', 'unmute'];
export const KEY_EVENT_TYPES = ['keydown', 'keyup'];
export const TRANSFER_EVENT_TYPES = [
  'consultation-start',
  'blind-transfer',
  'consultative-transfer',
  'transfer-abandoned'
];
export const CHANNEL_CONTRIBUTORS_EVENT_TYPE = 'channel-contributors';

/** Every Event type token defined by core-05 (section 4.3.1). */
export const CORE_EVENT_TYPES = [
  ...PARTY_EVENT_TYPES,
  ...KEY_EVENT_TYPES,
  ...TRANSFER_EVENT_TYPES,
  CHANNEL_CONTRIBUTORS_EVENT_TYPE
];

/** Event parameters in the order of section 4.3. */
export const EVENT_PARAMETERS = [
  'type',
  'time',
  'sessions',
  'party',
  'dialog',
  'channel',
  'contributors',
  'button',
  'transferee',
  'transfer_target',
  'consultation',
  'target_session'
] as const;

type Rules = Record<(typeof EVENT_PARAMETERS)[number], RuleCode>;

function rules(overrides: Partial<Rules> = {}): Rules {
  return {
    type: 'M',
    time: 'M',
    sessions: 'M',
    party: 'M',
    dialog: 'SN',
    channel: 'X',
    contributors: 'X',
    button: 'X',
    transferee: 'X',
    transfer_target: 'X',
    consultation: 'X',
    target_session: 'X',
    ...overrides
  };
}

/** Parameter applicability by Event type (section 4.3.1.5 tables). */
export const EVENT_PARAMETER_RULES: Record<string, Rules> = {};
for (const t of PARTY_EVENT_TYPES) EVENT_PARAMETER_RULES[t] = rules();
for (const t of KEY_EVENT_TYPES) EVENT_PARAMETER_RULES[t] = rules({ button: 'M' });
EVENT_PARAMETER_RULES['consultation-start'] = rules({
  transferee: 'M',
  transfer_target: 'M',
  consultation: 'M',
  target_session: 'X'
});
EVENT_PARAMETER_RULES['blind-transfer'] = rules({
  transferee: 'M',
  transfer_target: 'M',
  consultation: 'X',
  target_session: 'M'
});
EVENT_PARAMETER_RULES['consultative-transfer'] = rules({
  transferee: 'M',
  transfer_target: 'M',
  consultation: 'M',
  target_session: 'M'
});
EVENT_PARAMETER_RULES['transfer-abandoned'] = rules({
  transferee: 'M',
  transfer_target: 'O',
  consultation: 'O',
  target_session: 'X'
});
EVENT_PARAMETER_RULES[CHANNEL_CONTRIBUTORS_EVENT_TYPE] = {
  type: 'M',
  time: 'M',
  sessions: 'X',
  party: 'X',
  dialog: 'M',
  channel: 'M',
  contributors: 'O',
  button: 'X',
  transferee: 'X',
  transfer_target: 'X',
  consultation: 'X',
  target_session: 'X'
};

function isIndexOrList(value: unknown): boolean {
  return isIndex(value) || (Array.isArray(value) && value.every(isIndex));
}

/**
 * Validate one Event Object against core-05 section 4.3.
 *
 * SN violations are warnings, M and X violations are errors. An Event whose
 * type is not a core token is only checked for `type` and `time` (section 2.5:
 * it belongs to an extension). Index values are range-checked only when the
 * matching count is supplied.
 */
export function validateEvent(
  event: unknown,
  ctx: ValidateContext = {}
): { errors: string[]; warnings: string[] } {
  const { partyCount, dialogCount, sessionCount } = ctx;
  const label = ctx.label ?? 'Event';
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(event)) {
    return { errors: [`${label} must be a dictionary.`], warnings };
  }

  const etype = event.type;
  if (typeof etype !== 'string' || !etype) {
    errors.push(`${label} is missing required field: type`);
  }
  if (!('time' in event)) {
    errors.push(`${label} is missing required field: time`);
  } else if (parseDateTime(event.time) === undefined) {
    errors.push(`${label} has an invalid 'time' format. Must be an ISO 8601 datetime string.`);
  }

  const table = typeof etype === 'string' && Object.prototype.hasOwnProperty.call(EVENT_PARAMETER_RULES, etype)
    ? EVENT_PARAMETER_RULES[etype]
    : undefined;
  if (table) {
    for (const [param, code] of Object.entries(table)) {
      const present = param in event;
      if (code === 'M' && !present) {
        errors.push(`${label} of type '${etype}' is missing required field: ${param}`);
      } else if (code === 'X' && present) {
        errors.push(`${label} of type '${etype}' must not have field: ${param}`);
      } else if (code === 'SN' && present) {
        warnings.push(`${label} of type '${etype}' should not have field: ${param}`);
      }
    }
  }

  const checkIndex = (param: string, count: number | undefined, noun: string): void => {
    if (!(param in event)) return;
    const val = event[param];
    if (!isIndex(val)) {
      errors.push(`${label} field '${param}' must be a non-negative integer.`);
    } else if (count !== undefined && val >= count) {
      errors.push(`${label} references invalid ${noun} index: ${val}`);
    }
  };
  checkIndex('party', partyCount, 'party');
  checkIndex('transferee', partyCount, 'party');
  checkIndex('transfer_target', partyCount, 'party');
  checkIndex('consultation', sessionCount, 'session');
  checkIndex('target_session', sessionCount, 'session');

  if ('dialog' in event) {
    const val = event.dialog;
    let idxs: number[] = [];
    if (isIndex(val)) {
      idxs = [val];
    } else if (
      Array.isArray(val) &&
      typeof etype === 'string' &&
      !CORE_EVENT_TYPES.includes(etype) &&
      val.every(isIndex)
    ) {
      idxs = val as number[]; // extension event types may use an array (4.3.5)
    } else {
      errors.push(`${label} field 'dialog' must be a non-negative integer.`);
    }
    for (const v of idxs) {
      if (dialogCount !== undefined && v >= dialogCount) {
        errors.push(`${label} references invalid dialog index: ${v}`);
      }
    }
  }

  if ('channel' in event && !isIndex(event.channel)) {
    errors.push(`${label} field 'channel' must be a non-negative integer.`);
  }

  if ('sessions' in event) {
    const val = event.sessions;
    if (!isIndexOrList(val)) {
      errors.push(`${label} field 'sessions' must be an index or a list of indices.`);
    } else {
      const idxs: number[] = Array.isArray(val) ? val : [val as number];
      if (typeof etype === 'string' && TRANSFER_EVENT_TYPES.includes(etype) && Array.isArray(val)) {
        errors.push(`${label} of type '${etype}' must reference a single session index in 'sessions'.`);
      }
      for (const v of idxs) {
        if (sessionCount !== undefined && v >= sessionCount) {
          errors.push(`${label} references invalid session index: ${v}`);
        }
      }
    }
  }

  if ('contributors' in event) {
    const val = event.contributors;
    if (val !== null && !isIndexOrList(val)) {
      errors.push(`${label} field 'contributors' must be an index, a list of indices or null.`);
    } else if (val !== null) {
      for (const v of Array.isArray(val) ? val : [val]) {
        if (partyCount !== undefined && v >= partyCount) {
          errors.push(`${label} references invalid party index: ${v}`);
        }
      }
    }
  }

  if ('button' in event && typeof event.button !== 'string') {
    errors.push(`${label} field 'button' must be a string.`);
  }

  return { errors, warnings };
}

export interface EventParams {
  /** Event type token, for example "join" or "blind-transfer". */
  type: string;
  /** When the event occurred. */
  time: Date | string;
  /** Session index or indices (not for channel-contributors). */
  sessions?: number | number[];
  /** Party index (not for channel-contributors). */
  party?: number;
  /** Dialog index (channel-contributors; SHOULD NOT be used otherwise). */
  dialog?: number | number[];
  /** Channel index (channel-contributors only). */
  channel?: number;
  /** Party index, indices, or null for a channel with no contributor (channel-contributors only). */
  contributors?: number | number[] | null;
  /** DTMF digit or key label (keydown and keyup only). */
  button?: string;
  transferee?: number;
  transfer_target?: number;
  consultation?: number;
  target_session?: number;
  /**
   * Apply the parameter applicability table and throw on an M or X violation
   * (default true). SN violations log a warning.
   */
  validate?: boolean;
  /** Parameters defined by a vCon extension. */
  [key: string]: any;
}

/** An Event Object (core-05 section 4.3). */
export class Event {
  type: string;
  time: string;
  sessions?: number | number[];
  party?: number;
  dialog?: number | number[];
  channel?: number;
  contributors?: number | number[] | null;
  button?: string;
  transferee?: number;
  transfer_target?: number;
  consultation?: number;
  target_session?: number;
  /** Extension parameters. */
  extra: Record<string, any>;

  constructor(params: EventParams) {
    const { validate = true, ...rest } = params;
    this.type = rest.type;
    this.time = toIso(rest.time) as string;
    this.sessions = rest.sessions;
    this.party = rest.party;
    this.dialog = rest.dialog;
    this.channel = rest.channel;
    this.contributors = rest.contributors;
    this.button = rest.button;
    this.transferee = rest.transferee;
    this.transfer_target = rest.transfer_target;
    this.consultation = rest.consultation;
    this.target_session = rest.target_session;
    this.extra = {};
    for (const [k, v] of Object.entries(rest)) {
      if (!(EVENT_PARAMETERS as readonly string[]).includes(k) && v !== undefined) this.extra[k] = v;
    }
    if (validate) {
      const { errors, warnings } = validateEvent(this.toDict());
      for (const w of warnings) warn(w, 'VconWarning');
      if (errors.length) throw new Error(errors.join('; '));
    }
  }

  /** Serialize, omitting parameters that are undefined. */
  toDict(): EventType {
    const out: Record<string, any> = {};
    for (const name of EVENT_PARAMETERS) {
      const value = this[name];
      if (value !== undefined) out[name] = value;
    }
    Object.assign(out, this.extra);
    return out as EventType;
  }

  static fromDict(data: Record<string, any>, validate = false): Event {
    return new Event({ ...(data as EventParams), validate });
  }
}
