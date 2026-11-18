/**
 * Session Object and Session_Reference Object (core-05 sections 4.2 and 4.2.8).
 *
 * A Session groups the Dialog and Event Objects of one conversation (or part of
 * one) and records its receivers. A Session Object with no parameters is allowed.
 */
import { SessionId, SessionReference as SessionReferenceType, Session as SessionType } from './types';
import { isIndex, isPlainObject, parseDateTime, toIso } from './util';

/** Session_Reference `type` tokens defined by core-05 (4.2.8.2). Extension values are also allowed. */
export const SESSION_REFERENCE_TYPES = ['child', 'peer', 'precursor', 'breakout'];

export const SESSION_PARAMETERS = [
  'start',
  'duration',
  'parties',
  'originator',
  'session_id',
  'sessions',
  'dialog'
] as const;

export class SessionReference implements SessionReferenceType {
  session: number;
  type: string;
  description?: string;

  constructor(session: number, type: string, description?: string) {
    if (!isIndex(session)) {
      throw new Error("Session_Reference 'session' must be a non-negative integer");
    }
    if (typeof type !== 'string' || !type) {
      throw new Error("Session_Reference 'type' is required");
    }
    this.session = session;
    this.type = type;
    this.description = description;
  }

  toDict(): SessionReferenceType {
    const out: SessionReferenceType = { session: this.session, type: this.type };
    if (this.description !== undefined) out.description = this.description;
    return out;
  }
}

export interface SessionParams {
  /** Session start. SHOULD be present. */
  start?: Date | string;
  /** Duration in seconds. Absent means the session has no end. */
  duration?: number;
  /** Receivers. The first one is the implied originator. */
  parties?: number[];
  /** Originator index, only when it is not the first party. */
  originator?: number;
  session_id?: SessionId;
  sessions?: Array<SessionReference | SessionReferenceType>;
  /** Indices of the Dialog Objects in the session. */
  dialog?: number[];
}

/** A Session Object. */
export class Session {
  start?: string;
  duration?: number;
  parties?: number[];
  originator?: number;
  session_id?: SessionId;
  sessions?: Array<SessionReference | SessionReferenceType>;
  dialog?: number[];

  constructor(params: SessionParams = {}) {
    this.start = toIso(params.start) as string | undefined;
    this.duration = params.duration;
    this.parties = params.parties ? [...params.parties] : undefined;
    this.originator = params.originator;
    this.session_id = params.session_id;
    this.sessions = params.sessions ? [...params.sessions] : undefined;
    this.dialog = params.dialog ? [...params.dialog] : undefined;
  }

  /** Serialize, omitting parameters that are undefined. An empty Session is `{}`. */
  toDict(): SessionType {
    const out: SessionType = {};
    for (const name of SESSION_PARAMETERS) {
      const value = this[name];
      if (value === undefined) continue;
      if (name === 'sessions') {
        out.sessions = (value as Array<SessionReference | SessionReferenceType>).map(v =>
          v instanceof SessionReference ? v.toDict() : v
        );
      } else {
        (out as any)[name] = value;
      }
    }
    return out;
  }
}

export interface ValidateContext {
  partyCount?: number;
  dialogCount?: number;
  sessionCount?: number;
  label?: string;
}

/** Validate one Session Object. Returns `{ errors, warnings }`. */
export function validateSession(
  session: unknown,
  ctx: ValidateContext = {}
): { errors: string[]; warnings: string[] } {
  const { partyCount, dialogCount, sessionCount } = ctx;
  const label = ctx.label ?? 'Session';
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isPlainObject(session)) {
    return { errors: [`${label} must be a dictionary.`], warnings };
  }
  if (Object.keys(session).length === 0) {
    return { errors, warnings }; // an empty placeholder Session is permitted
  }

  if ('start' in session) {
    if (parseDateTime(session.start) === undefined) {
      errors.push(`${label} has an invalid 'start' format. Must be an ISO 8601 datetime string.`);
    }
  } else {
    warnings.push(`${label} should have a start parameter.`);
  }

  if ('duration' in session) {
    const d = session.duration;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) {
      errors.push(`${label} field 'duration' must be a non-negative number.`);
    }
  }

  if ('parties' in session) {
    const p = session.parties;
    if (!Array.isArray(p)) {
      errors.push(`${label} field 'parties' must be a list.`);
    } else {
      for (const idx of p) {
        if (!isIndex(idx) || (partyCount !== undefined && idx >= partyCount)) {
          errors.push(`${label} references invalid party index: ${idx}`);
        }
      }
    }
  } else {
    warnings.push(`${label} should have a parties parameter.`);
  }

  if ('originator' in session) {
    const o = session.originator;
    if (!isIndex(o) || (partyCount !== undefined && o >= partyCount)) {
      errors.push(`${label} references invalid party index: ${o}`);
    }
  }

  if ('session_id' in session && !isPlainObject(session.session_id)) {
    errors.push(`${label} field 'session_id' must be a SessionId Object.`);
  }

  if ('dialog' in session) {
    const dl = session.dialog;
    if (!Array.isArray(dl)) {
      errors.push(`${label} field 'dialog' must be a list.`);
    } else {
      for (const idx of dl) {
        if (!isIndex(idx) || (dialogCount !== undefined && idx >= dialogCount)) {
          errors.push(`${label} references invalid dialog index: ${idx}`);
        }
      }
    }
  }

  if ('sessions' in session) {
    const refs = session.sessions;
    if (!Array.isArray(refs)) {
      errors.push(`${label} field 'sessions' must be a list.`);
    } else {
      refs.forEach((ref, n) => {
        if (!isPlainObject(ref)) {
          errors.push(`${label} sessions[${n}] must be a dictionary.`);
          return;
        }
        for (const req of ['session', 'type']) {
          if (!(req in ref)) errors.push(`${label} sessions[${n}] is missing required field: ${req}`);
        }
        if ('session' in ref) {
          if (!isIndex(ref.session) || (sessionCount !== undefined && ref.session >= sessionCount)) {
            errors.push(`${label} references invalid session index: ${ref.session}`);
          }
        }
        if ('type' in ref && typeof ref.type !== 'string') {
          errors.push(`${label} sessions[${n}] field 'type' must be a string.`);
        }
      });
    }
  }
  return { errors, warnings };
}
