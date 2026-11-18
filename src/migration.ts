/**
 * Migrate a vCon from syntax 0.4.0 to 0.5.0 (draft-ietf-vcon-vcon-core-05, Appendix A.1).
 *
 * The migration is table driven. MIGRATION_STEPS holds one entry per step
 * T1..T15 of the ordered transform table; each step is one function that
 * mutates a shared context. If a later edit of Appendix A.1 changes one step,
 * only that function (or its table entry) needs to change.
 *
 * Execution order (the draft gives none; this order is inferred so that every
 * `dialog` index stays valid): the steps that read the 0.4.0 `dialog` array
 * run before any array is rewritten, and T10 blanks the removed Dialogs in
 * place at the end, so the array length and every other index are unchanged.
 *
 *   T13 T15 T1  ->  T8 T9 T9b T6  ->  T2 T7 T4(+T5) T3  ->  T10 T10b T10c  ->  T11 T12 T14
 *
 * T4 runs before T3 so that the Sessions T5 creates for a transfer's original,
 * consultation and target calls are known when T3 builds the party_history
 * Events: an Event lists every Session of the Dialog it came from (AMB-3).
 *
 * Nothing is invented silently. Every value the draft does not dictate is
 * listed in the MigrationReport (kind "inferred"), every field that had to be
 * filled by a fallback is listed (kind "fallback"), and every problem the
 * migration could not resolve is listed (kind "unresolved"). In strict mode a
 * fallback throws MigrationError instead.
 *
 * A signed 0.4.0 vCon is migrated as the unsigned payload. The migration never
 * signs; the report sets resignRequired.
 */
import { EVENT_PARAMETERS } from './event';
import { DIALOG_MIME_TYPES, extensionsInUse, validateVconDict } from './validation';
import {
  base64UrlDecodeToString,
  clone,
  isInt,
  isPlainObject,
  parseDateTime,
  parseDateTimeMicros,
  repr,
  reprList
} from './util';

export const SOURCE_VERSION = '0.4.0';
export const TARGET_VERSION = '0.5.0';

type Dict = Record<string, any>;

/**
 * Top-level parameters that exist only in 0.5.0. Input that has one of them is
 * already 0.5.0 even when it omits the (optional) `vcon` parameter; migrating
 * it again would overwrite its `sessions` and `events`.
 */
const V050_ONLY_KEYS = ['sessions', 'events', 'redacted_from', 'amended_from', 'redacted_strings'];

/** The vCon cannot be migrated (or, in strict mode, a MUST field has no source). */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** A value the draft does not dictate; a documented default was applied. */
export const INFERRED = 'inferred';
/** A MUST field with no source was filled with the documented fallback. */
export const FALLBACK = 'fallback';
/** A problem left for a person to resolve. */
export const UNRESOLVED = 'unresolved';
/** Informational. */
export const INFO = 'info';

export type ReportKind = 'inferred' | 'fallback' | 'unresolved' | 'info';

export interface ReportEntry {
  step: string;
  kind: ReportKind;
  message: string;
  /** AMB-n identifier from the implementation spec. */
  code?: string;
  details: Dict;
}

/** What a migration did that the draft did not dictate. */
export class MigrationReport {
  sourceVersion?: string;
  targetVersion = TARGET_VERSION;
  strict: boolean;
  /** True when the input was signed: the signature is dropped and the result is unsigned. */
  resignRequired = false;
  entries: ReportEntry[] = [];
  /** Original content of every Dialog replaced by `{}`, keyed by its (unchanged) index. */
  removedDialogs: Record<number, Dict> = {};
  /** Steps that ran, in order. */
  stepsRun: string[] = [];

  constructor(strict = false) {
    this.strict = strict;
  }

  add(step: string, kind: ReportKind, message: string, code?: string, details: Dict = {}): void {
    const entry: ReportEntry = { step, kind, message, details };
    if (code) entry.code = code;
    this.entries.push(entry);
  }

  private of(kind: ReportKind): ReportEntry[] {
    return this.entries.filter(e => e.kind === kind);
  }

  get inferred(): ReportEntry[] {
    return this.of(INFERRED);
  }
  get fallbacks(): ReportEntry[] {
    return this.of(FALLBACK);
  }
  get unresolved(): ReportEntry[] {
    return this.of(UNRESOLVED);
  }
  get notes(): ReportEntry[] {
    return this.of(INFO);
  }

  toDict(): Dict {
    return {
      source_version: this.sourceVersion ?? null,
      target_version: this.targetVersion,
      strict: this.strict,
      resign_required: this.resignRequired,
      steps_run: [...this.stepsRun],
      entries: this.entries.map(e => {
        const out: Dict = { step: e.step, kind: e.kind, message: e.message };
        if (e.code) out.code = e.code;
        if (Object.keys(e.details).length) out.details = e.details;
        return out;
      }),
      removed_dialogs: Object.fromEntries(Object.entries(this.removedDialogs))
    };
  }

  summary(): string {
    return (
      `${this.inferred.length} inferred, ${this.fallbacks.length} fallback, ` +
      `${this.unresolved.length} unresolved` +
      (this.resignRequired ? '; re-signing required' : '')
    );
  }
}

/** Result of a migration. */
export interface MigrationResult {
  vcon: Dict;
  report: MigrationReport;
}

// ---------------------------------------------------------------------------
// Context and helpers
// ---------------------------------------------------------------------------

const ok = (v: unknown): boolean => parseDateTime(v) !== undefined;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Round seconds to six decimals the way the Python reference's round(x, 6)
 * does: on the exact binary value, ties to even. Math.round(x * 1e6) / 1e6
 * rounds x * 1e6 (already inexact) and breaks ties upwards, so it disagrees
 * with the reference on values such as 0.0078125.
 */
export function num(seconds: number): number {
  if (!Number.isFinite(seconds)) return seconds;
  const sign = seconds < 0 ? -1 : 1;
  const [ip, fp] = Math.abs(seconds).toFixed(100).split('.');
  const keep = fp.slice(0, 6);
  const rest = fp.slice(6);
  const up = rest[0] > '5' || (rest[0] === '5' && (/[1-9]/.test(rest.slice(1)) || Number(keep[5]) % 2 === 1));
  const digits = (BigInt(ip + keep) + (up ? 1n : 0n)).toString().padStart(7, '0');
  const value = Number(`${digits.slice(0, -6)}.${digits.slice(-6)}`);
  return value === 0 ? 0 : sign * value;
}

/** Epoch seconds (with microseconds) of a date-time string, as Python's datetime.timestamp() gives. */
const seconds = (v: unknown): number | undefined => {
  const us = parseDateTimeMicros(v);
  return us === undefined ? undefined : us / 1e6;
};

/** Round half to even to an integer (Python's rounding of a float to microseconds). */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/**
 * The string Python's datetime.fromtimestamp(t, tz=timezone.utc).isoformat()
 * gives for epoch seconds t: microsecond precision (rounded half to even),
 * the fraction omitted when it is zero, and "+00:00" as the offset. Matching
 * it keeps a derived Event time identical across implementations.
 */
export function isoFromSeconds(t: number): string {
  let whole = Math.trunc(t);
  let us = roundHalfEven((t - whole) * 1e6);
  if (us >= 1e6) {
    whole += 1;
    us -= 1e6;
  } else if (us < 0) {
    whole -= 1;
    us += 1e6;
  }
  const base = new Date(whole * 1000).toISOString().slice(0, 19);
  return base + (us ? '.' + String(us).padStart(6, '0') : '') + '+00:00';
}

/** Flat list of int party indices of a 0.4.0 Dialog `parties` value. */
function plainParties(value: unknown): number[] {
  const out: number[] = [];
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  for (const v of items) {
    if (Array.isArray(v)) out.push(...v.filter(isInt));
    else if (isInt(v)) out.push(v);
  }
  return out;
}

function union(lists: number[][]): number[] {
  const seen: number[] = [];
  for (const lst of lists) for (const v of lst) if (!seen.includes(v)) seen.push(v);
  return seen;
}

function renameKey(d: Dict, oldKey: string, newKey: string): Dict {
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k === oldKey ? newKey : k, v]));
}

const SESSION_KEY_ORDER = ['start', 'duration', 'parties', 'originator', 'session_id', 'sessions', 'dialog'];

function orderSession(sess: Dict): Dict {
  return Object.fromEntries(SESSION_KEY_ORDER.filter(k => k in sess).map(k => [k, sess[k]]));
}

class Context {
  out: Dict;
  src: Dict;
  strict: boolean;
  report: MigrationReport;
  sessions: Dict[] = [];
  events: Dict[] = [];
  /** receivers contributed to the Session by each (kept) Dialog index */
  receivers = new Map<number, number[]>();
  /** originator value taken from each (kept) Dialog index */
  originators = new Map<number, number>();
  /** Session indices each Dialog index belongs to */
  dialogSessions = new Map<number, number[]>();
  /** recording-set Dialog index -> Session index (T7) */
  rsSession = new Map<number, number>();
  /** transfer Dialog index -> Session index of its original call (T4) */
  transferSession = new Map<number, number>();
  roleSessions = new Map<number, number>();
  emptyPartyIdx?: number;
  catchAll?: number;

  constructor(data: Dict, strict: boolean, report: MigrationReport) {
    this.out = data;
    this.src = clone(data); // refreshed by T13 after unwrapping
    this.strict = strict;
    this.report = report;
  }

  // -- source views ---------------------------------------------------
  get dialogs(): any[] {
    return Array.isArray(this.src.dialog) ? this.src.dialog : [];
  }

  /** Dialog index -> removed type, for transfer and recording-set Dialogs. */
  get removed(): Map<number, string> {
    const m = new Map<number, string>();
    this.dialogs.forEach((d, i) => {
      if (isPlainObject(d) && (d.type === 'transfer' || d.type === 'recording-set')) m.set(i, d.type);
    });
    return m;
  }

  kept(): number[] {
    const rem = this.removed;
    const out: number[] = [];
    this.dialogs.forEach((d, i) => {
      if (!rem.has(i) && isPlainObject(d) && Object.keys(d).length > 0) out.push(i);
    });
    return out;
  }

  // -- helpers --------------------------------------------------------
  /** Record a fallback for a MUST field, or throw in strict mode. */
  needFallback(step: string, message: string, code?: string, details: Dict = {}): void {
    if (this.strict) {
      throw new MigrationError(`${step}: ${message} (strict mode: no source for a required field)`);
    }
    this.report.add(step, FALLBACK, message, code, details);
  }

  newSession(session: Dict): number {
    this.sessions.push(session);
    return this.sessions.length - 1;
  }

  /** Index of an empty Party Object, appended once (4.3.9: unknown party). */
  emptyParty(step: string, _role: string): number {
    if (this.emptyPartyIdx === undefined) {
      if (!Array.isArray(this.out.parties)) this.out.parties = [];
      this.out.parties.push({});
      this.emptyPartyIdx = this.out.parties.length - 1;
      this.report.add(
        step,
        INFERRED,
        `Appended an empty Party Object at parties[${this.emptyPartyIdx}] to stand for unknown parties.`,
        undefined,
        { party: this.emptyPartyIdx }
      );
    }
    return this.emptyPartyIdx;
  }

  /** Start of a Dialog, or of a recording-set's earliest recording. */
  dialogStart(idx: unknown): string | undefined {
    if (!isInt(idx) || idx < 0 || idx >= this.dialogs.length) return undefined;
    const d = this.dialogs[idx];
    if (!isPlainObject(d)) return undefined;
    if (ok(d.start)) return d.start;
    if (d.type === 'recording-set') {
      const starts = (Array.isArray(d.recordings) ? d.recordings : [])
        .filter((r: unknown) => isInt(r) && r >= 0 && r < this.dialogs.length && isPlainObject(this.dialogs[r as number]))
        .map((r: number) => this.dialogs[r].start)
        .filter(ok);
      if (starts.length) {
        return starts.reduce((a: string, b: string) => (seconds(b)! < seconds(a)! ? b : a));
      }
    }
    return undefined;
  }

  /**
   * Derived (start, duration) of a group of Dialogs.
   *
   * start is the earliest Dialog start. duration runs from that start to the
   * latest Dialog end (start plus duration, or start when no duration is
   * known), and is only derived when at least one Dialog has a duration.
   */
  span(idxs: number[]): [string | undefined, number | undefined] {
    const items: Array<[number, number]> = [];
    for (const i of idxs) {
      if (!isPlainObject(this.dialogs[i])) continue;
      const s = seconds(this.dialogs[i].start);
      if (s !== undefined) items.push([i, s]);
    }
    if (!items.length) return [undefined, undefined];
    const [firstI, first] = items.reduce((a, b) => (b[1] < a[1] ? b : a));
    const startStr = this.dialogs[firstI].start as string;
    const ends: number[] = [];
    let anyDuration = false;
    for (const [i, s] of items) {
      const dur = this.dialogs[i].duration;
      if (isNum(dur)) {
        anyDuration = true;
        ends.push(s + dur);
      } else {
        ends.push(s);
      }
    }
    if (!anyDuration) return [startStr, undefined];
    return [startStr, num(Math.max(...ends) - first)];
  }

  /** Build a Session for a group of kept Dialogs from derived values. */
  makeSession(step: string, idxs: number[], label: string): Dict {
    const session: Dict = {};
    const [start, duration] = this.span(idxs);
    if (start !== undefined) session.start = start;
    if (duration !== undefined) session.duration = duration;
    const parties = union(idxs.map(i => this.receivers.get(i) ?? []));
    if (parties.length) session.parties = parties;
    const orig = idxs.filter(i => this.originators.has(i)).map(i => this.originators.get(i)!);
    if (orig.length) {
      const chosen = orig[0];
      const others = [...new Set(orig.slice(1).filter(o => o !== chosen))].sort((a, b) => a - b);
      if (others.length) {
        this.report.add(
          step,
          UNRESOLVED,
          `${label}: Dialogs name different originators; kept ${chosen}, did not record ${JSON.stringify(others)}.`,
          undefined,
          { kept: chosen, dropped: others }
        );
      }
      if (!parties.length || chosen !== parties[0]) session.originator = chosen;
    }
    session.dialog = [...idxs];
    if (start !== undefined || duration !== undefined) {
      this.report.add(
        step,
        INFERRED,
        `${label}: start/duration derived from its Dialogs (earliest start; ` +
          'duration to the latest end when any Dialog has a duration).',
        undefined,
        { start: start ?? null, duration: duration ?? null }
      );
    }
    return orderSession(session);
  }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** T1: `vcon` "0.4.0" -> "0.5.0". */
/**
 * core-05 Date is RFC 3339: a Dialog start that is not one is never used as a
 * Session start. Strict mode throws; otherwise the value is reported as unresolved.
 */
function checkDialogDates(ctx: Context): void {
  ctx.dialogs.forEach((d, i) => {
    if (!isPlainObject(d) || d.start === undefined || d.start === null || parseDateTime(d.start) !== undefined) return;
    const msg = `dialog[${i}] start ${repr(d.start)} is not an RFC 3339 date-time`;
    if (ctx.strict) throw new MigrationError(`T1: ${msg} (strict mode)`);
    ctx.report.add('T1', UNRESOLVED, `${msg}; not used to derive a Session start.`, undefined, { dialog: i, start: d.start });
  });
}

function stepT1Version(ctx: Context): void {
  checkDialogDates(ctx);
  if (!('vcon' in ctx.out)) {
    ctx.report.add('T1', INFERRED, "Input had no 'vcon' parameter; set to '0.5.0' (AMB-12: writers emit it).", 'AMB-12');
  }
  ctx.out.vcon = TARGET_VERSION;
}

/**
 * T2: add one Session which references all (kept) Dialog Objects.
 *
 * The removed transfer and recording-set positions are skipped (they become
 * `{}`; T10). Receivers (T8, T9, T9b) and the originator (T6) have already
 * been collected, so the Session is built in one go.
 */
function stepT2Sessions(ctx: Context): void {
  const kept = ctx.kept();
  if (!kept.length) return;
  ctx.catchAll = ctx.newSession(ctx.makeSession('T2', kept, 'Session 0 (all Dialogs)'));
  for (const i of kept) {
    const lst = ctx.dialogSessions.get(i) ?? [];
    lst.push(ctx.catchAll);
    ctx.dialogSessions.set(i, lst);
  }
  ctx.report.add('T2', INFO, `Added Session ${ctx.catchAll} referencing ${kept.length} Dialog Object(s).`);
}

/**
 * T3: each Dialog `party_history` entry becomes an Event; `event` is renamed `type`.
 *
 * The Event's `sessions` references the Session(s) for the Dialog it came
 * from and the Event does not reference the Dialog (SHOULD NOT, 4.3.5).
 */
function stepT3PartyHistory(ctx: Context): void {
  const dialogs = ctx.out.dialog;
  if (!Array.isArray(dialogs)) return;
  ctx.dialogs.forEach((srcD, i) => {
    if (!isPlainObject(srcD) || !('party_history' in srcD)) return;
    if (srcD.type === 'transfer') {
      ctx.report.add(
        'T3',
        UNRESOLVED,
        `dialog[${i}] is a transfer Dialog with party_history; the entries are not migrated ` +
          '(A.1 covers party_history on non-transfer Dialogs). Original kept in removed_dialogs.',
        undefined,
        { dialog: i }
      );
      return;
    }
    let sess: number[];
    if (srcD.type === 'recording-set') {
      sess = ctx.rsSession.has(i) ? [ctx.rsSession.get(i)!] : [];
    } else {
      sess = [...(ctx.dialogSessions.get(i) ?? [])].sort((a, b) => a - b);
    }
    if (sess.length > 1) {
      ctx.report.add(
        'T3',
        INFERRED,
        `dialog[${i}] belongs to Sessions ${JSON.stringify(sess)}; its party_history Events list all of them ` +
          "in 'sessions' (4.3.3: an Event applies only to the Sessions listed).",
        'AMB-3',
        { dialog: i, sessions: sess }
      );
    }
    const history = srcD.party_history;
    if (!Array.isArray(history)) {
      ctx.report.add('T3', UNRESOLVED, `dialog[${i}] party_history is not a list; dropped.`, undefined, { dialog: i });
    } else {
      history.forEach((entry: any, n: number) => {
        if (!isPlainObject(entry) || !('event' in entry)) {
          ctx.report.add('T3', UNRESOLVED, `dialog[${i}].party_history[${n}] has no 'event'; entry not migrated.`, undefined, {
            dialog: i,
            entry
          });
          return;
        }
        const ev: Dict = { type: entry.event };
        if (ok(entry.time)) {
          ev.time = entry.time;
        } else {
          // MUST field: Dialog start, then the vCon created_at.
          let fb = srcD.start;
          let src = 'Dialog start';
          if (!ok(fb)) {
            fb = ctx.out.created_at;
            src = 'vCon created_at';
          }
          if (!ok(fb)) {
            throw new MigrationError(
              `T3: dialog[${i}].party_history[${n}] has no time, and neither the Dialog start ` +
                'nor the vCon created_at can stand in'
            );
          }
          ctx.needFallback(
            'T3',
            `dialog[${i}].party_history[${n}] has no usable time (${repr(entry.time)}); used the ` +
              `${src} (${repr(fb)}) as the Event time.`,
            undefined,
            { dialog: i, entry: n, original_time: entry.time ?? null, source: src, time: fb }
          );
          ev.time = fb;
        }
        if (sess.length) ev.sessions = sess.length === 1 ? sess[0] : sess;
        if (isInt(entry.party)) {
          ev.party = entry.party;
        } else {
          ctx.needFallback(
            'T3',
            `dialog[${i}].party_history[${n}] has no party; referenced an empty Party Object.`,
            undefined,
            { dialog: i }
          );
          ev.party = ctx.emptyParty('T3', 'party');
        }
        if ((entry.event === 'keydown' || entry.event === 'keyup') && 'button' in entry) {
          ev.button = entry.button;
        } else if ('button' in entry) {
          ctx.report.add(
            'T3',
            UNRESOLVED,
            `dialog[${i}].party_history[${n}] has 'button' on a '${entry.event}' event ` +
              '(only keydown and keyup carry it); button not migrated.',
            undefined,
            { dialog: i, entry: n, dropped: { button: entry.button } }
          );
        }
        // Parameters a 0.4.0 extension added to the entry: carried onto the Event
        // unless the name is a core Event parameter (which would change its meaning).
        const unknown: Dict = {};
        for (const [k, v] of Object.entries(entry)) {
          if (!['party', 'time', 'event', 'button'].includes(k)) unknown[k] = v;
        }
        if (Object.keys(unknown).length) {
          const carried: Dict = {};
          const dropped: Dict = {};
          for (const [k, v] of Object.entries(unknown)) {
            if ((EVENT_PARAMETERS as readonly string[]).includes(k)) dropped[k] = v;
            else carried[k] = v;
          }
          Object.assign(ev, carried);
          ctx.report.add(
            'T3',
            UNRESOLVED,
            `dialog[${i}].party_history[${n}] had non-core parameter(s) ${reprList(Object.keys(unknown).sort())}; ` +
              `carried onto the Event: ${reprList(Object.keys(carried).sort())}, dropped (name clashes with a core Event ` +
              `parameter): ${reprList(Object.keys(dropped).sort())}. List the defining extension in 'extensions'.`,
            undefined,
            { dialog: i, entry: n, carried, dropped }
          );
        }
        ctx.events.push(ev);
      });
    }
    if (srcD.type !== 'recording-set' && isPlainObject(dialogs[i])) delete dialogs[i].party_history;
  });
}

/**
 * T4 (with T5): each `transfer` Dialog becomes one or two transfer Events.
 *
 * `transferor` becomes `party`. `original`, `consultation` and
 * `target_dialog` become Session indices (T5): the recording-set's Session,
 * otherwise a Session that lists that Dialog.
 */
function stepT4Transfers(ctx: Context): void {
  const step = 'T4';
  for (const [k, kind] of ctx.removed) {
    if (kind !== 'transfer') continue;
    const tr = ctx.dialogs[k];

    /** T5: Session index for a Dialog reference held by a transfer Dialog. */
    const sessionFor = (ref: unknown, role: string): number | undefined => {
      if (ref === undefined || ref === null) return undefined;
      if (!isInt(ref) || ref < 0 || ref >= ctx.dialogs.length) {
        ctx.report.add(step, UNRESOLVED, `transfer dialog[${k}] ${role}=${repr(ref)} is not a Dialog index.`, undefined, {
          dialog: k
        });
        return undefined;
      }
      if (ctx.rsSession.has(ref)) {
        ctx.report.add(
          'T5',
          INFO,
          `transfer dialog[${k}] ${role} -> dialog[${ref}] is a recording-set; using its Session ${ctx.rsSession.get(ref)}.`
        );
        return ctx.rsSession.get(ref);
      }
      const removed = ctx.removed;
      if (removed.has(ref)) {
        const idx = ctx.newSession({});
        ctx.report.add(
          'T5',
          UNRESOLVED,
          `transfer dialog[${k}] ${role} -> dialog[${ref}] is itself a removed ${removed.get(ref)} Dialog; ` +
            `created placeholder Session ${idx} with no parameters.`,
          undefined,
          { dialog: k }
        );
        return idx;
      }
      if (ctx.roleSessions.has(ref)) return ctx.roleSessions.get(ref);
      const sess = ctx.makeSession('T5', [ref], `Session for transfer ${role} (dialog[${ref}])`);
      const idx = ctx.newSession(sess);
      ctx.roleSessions.set(ref, idx);
      const lst = ctx.dialogSessions.get(ref) ?? [];
      lst.push(idx);
      ctx.dialogSessions.set(ref, lst);
      ctx.report.add(
        'T5',
        INFERRED,
        `transfer dialog[${k}] ${role} -> created Session ${idx} listing dialog[${ref}] ` +
          '(A.1: referenced through a Session Object).',
        undefined,
        { dialog: k, session: idx }
      );
      return idx;
    };

    const placeholder = (role: string, why: string, requiredFallback: boolean): number => {
      const idx = ctx.newSession({});
      const msg = `transfer dialog[${k}] has no ${role} (${why}); created placeholder Session ${idx} with no parameters (4.3.1.3).`;
      if (requiredFallback) ctx.needFallback(step, msg, undefined, { dialog: k, session: idx });
      else ctx.report.add(step, INFERRED, msg, 'AMB-7', { dialog: k, session: idx });
      return idx;
    };

    // Session of the original call (sessions: M, single index).
    const origRef = tr.original;
    let sidx = sessionFor(origRef, 'original');
    if (sidx === undefined) {
      sidx = placeholder('original', "'sessions' is required on every transfer Event", true);
    }
    ctx.transferSession.set(k, sidx);

    const partyRef = (key: string, role: string, required: boolean): number | undefined => {
      const val = tr[key];
      if (isInt(val)) return val;
      if (!required) return undefined;
      ctx.needFallback(
        step,
        `transfer dialog[${k}] has no ${key} (${role}); referenced an empty Party Object (4.3.9).`,
        undefined,
        { dialog: k }
      );
      return ctx.emptyParty(step, role);
    };

    const transferor = partyRef('transferor', 'Transferor, becomes party', true);
    const transferee = partyRef('transferee', 'Transferee', true);

    const consRef = tr.consultation;
    const targetRef = tr.target_dialog;
    const hasCons = consRef !== undefined && consRef !== null;
    const hasTarget = targetRef !== undefined && targetRef !== null;
    let consSess = hasCons ? sessionFor(consRef, 'consultation') : undefined;
    if (hasCons && consSess === undefined) {
      consSess = placeholder('usable consultation', 'consultation Dialog index could not be resolved', false);
    }
    let targetSess = hasTarget ? sessionFor(targetRef, 'target_dialog') : undefined;
    const hasTargetParty = isInt(tr.transfer_target);

    // Event types (AMB-7).
    const types: string[] = [];
    if (hasCons) types.push('consultation-start');
    if (hasTarget || hasTargetParty) types.push(hasCons ? 'consultative-transfer' : 'blind-transfer');
    else types.push('transfer-abandoned');
    ctx.report.add(
      step,
      INFERRED,
      `transfer dialog[${k}] mapped to Event type(s) ${reprList(types)} ` +
        '(consultation present -> consultation-start + consultative-transfer; otherwise blind-transfer; ' +
        'no target_dialog and no transfer_target -> transfer-abandoned).',
      'AMB-7',
      { dialog: k, types }
    );
    if (types.includes('blind-transfer') || types.includes('consultative-transfer')) {
      if (targetSess === undefined) {
        targetSess = placeholder(
          'target_dialog',
          'the target call was not captured; 4.3.1.3 uses a placeholder Session in that case',
          false
        );
      }
    }

    const eventTime = (which: 'consult' | 'transfer'): string => {
      const own = tr.start;
      if (ok(own)) return own;
      const cands: Array<[string | undefined, string]> = [];
      if (which === 'consult') {
        cands.push([ctx.dialogStart(consRef), `start of consultation dialog[${consRef}]`]);
      } else {
        cands.push([ctx.dialogStart(targetRef), `start of target dialog[${targetRef}]`]);
        if (hasCons) {
          const cd = isInt(consRef) && consRef >= 0 && consRef < ctx.dialogs.length ? ctx.dialogs[consRef] : undefined;
          const cs = seconds(ctx.dialogStart(consRef));
          const dur = isPlainObject(cd) ? cd.duration : undefined;
          if (cs !== undefined && isNum(dur)) {
            const end = isoFromSeconds(cs + dur);
            cands.push([end, `end of consultation dialog[${consRef}] (start + duration)`]);
          }
          cands.push([ctx.dialogStart(consRef), `start of consultation dialog[${consRef}]`]);
        }
      }
      for (const [value, src] of cands) {
        if (value && ok(value)) {
          ctx.report.add(
            step,
            INFERRED,
            `transfer dialog[${k}] has no start; Event time taken from the ${src}, ` +
              "not from the transfer Dialog's own start.",
            'AMB-7',
            { dialog: k, source: src, time: value }
          );
          return value;
        }
      }
      const created = ctx.out.created_at;
      if (ok(created)) {
        ctx.needFallback(
          step,
          `transfer dialog[${k}] has no start and no other time source; used the vCon created_at ` +
            `(${repr(created)}) as the Event time.`,
          'AMB-7',
          { dialog: k }
        );
        return created;
      }
      throw new MigrationError(`${step}: transfer dialog[${k}] has no start and the vCon has no created_at; no time can be sourced`);
    };

    for (const t of types) {
      const ev: Dict = { type: t };
      ev.time = eventTime(t === 'consultation-start' ? 'consult' : 'transfer');
      ev.sessions = sidx;
      ev.party = transferor;
      ev.transferee = transferee;
      const needTarget = t !== 'transfer-abandoned';
      const tt = partyRef('transfer_target', 'Transfer Target', needTarget);
      if (tt !== undefined) ev.transfer_target = tt;
      if (t === 'consultation-start' || t === 'consultative-transfer') ev.consultation = consSess;
      else if (t === 'transfer-abandoned' && consSess !== undefined) ev.consultation = consSess;
      if (t === 'blind-transfer' || t === 'consultative-transfer') ev.target_session = targetSess;
      ctx.events.push(ev);
    }
    const known = [
      'type', 'start', 'transferee', 'transferor', 'transfer_target', 'original', 'consultation',
      'target_dialog', 'parties', 'party_history'
    ];
    const extra = Object.keys(tr).filter(key => !known.includes(key)).sort();
    const hasParties = Array.isArray(tr.parties) ? tr.parties.length > 0 : !!tr.parties;
    if (extra.length || hasParties) {
      const names = hasParties ? [...extra, 'parties'] : extra;
      const dropped: Dict = {};
      for (const f of names) dropped[f] = tr[f];
      ctx.report.add(
        step,
        UNRESOLVED,
        `transfer dialog[${k}] had parameters with no Event equivalent (${reprList(names)}); not migrated. ` +
          'Original kept in report.removedDialogs.',
        undefined,
        { dialog: k, dropped }
      );
    }
  }
}

/** T6: `originator` moves from the Dialog to the Session (only when not the first party). */
function stepT6Originator(ctx: Context): void {
  const dialogs = ctx.out.dialog;
  if (!Array.isArray(dialogs)) return;
  for (const i of ctx.kept()) {
    const d = dialogs[i];
    if (isPlainObject(d) && 'originator' in d) {
      const val = d.originator;
      delete d.originator;
      if (isInt(val)) ctx.originators.set(i, val);
      else {
        ctx.report.add('T6', UNRESOLVED, `dialog[${i}] originator ${repr(val)} is not a party index; dropped.`, undefined, {
          dialog: i
        });
      }
    }
  }
}

/**
 * T7: each `recording-set` Dialog becomes a Session listing its recordings.
 *
 * The recording-set's own start, duration, parties, session_id and originator
 * move to the Session (A.1 is silent: AMB-4). `recording_set` is removed from
 * each recording.
 *
 * Membership is the union of the set's `recordings` list and the recordings
 * whose `recording_set` points at it (core-04 made `recordings` MUST and
 * `recording_set` SHOULD, so stored data can carry either side only). A
 * recording-set listed in another recording-set's `recordings` becomes a
 * `child` Session_Reference of that set's Session. Every Session index is
 * allocated before any is filled, so a nested set can point forward.
 */
function stepT7RecordingSets(ctx: Context): void {
  const dialogs = ctx.out.dialog;
  const removed = ctx.removed;
  const rsIds = [...removed].filter(([, kind]) => kind === 'recording-set').map(([k]) => k);
  for (const k of rsIds) ctx.rsSession.set(k, ctx.newSession({}));

  // recording_set back-references from kept Dialogs.
  const back = new Map<number, number[]>();
  for (const i of ctx.kept()) {
    const ref = ctx.dialogs[i].recording_set;
    if (ref === undefined || ref === null) continue;
    if (isInt(ref) && ctx.rsSession.has(ref)) {
      const lst = back.get(ref) ?? [];
      lst.push(i);
      back.set(ref, lst);
    } else {
      ctx.report.add(
        'T7',
        UNRESOLVED,
        `dialog[${i}] recording_set=${repr(ref)} does not reference a recording-set Dialog; ` +
          'parameter removed, no Session membership derived from it.',
        undefined,
        { dialog: i, recording_set: ref }
      );
    }
  }

  for (const k of rsIds) {
    const rs = ctx.dialogs[k];
    const sidx = ctx.rsSession.get(k)!;
    const recsRaw = rs.recordings;
    const recs: number[] = [];
    const children: number[] = [];
    if (Array.isArray(recsRaw)) {
      for (const r of recsRaw) {
        if (isInt(r) && ctx.rsSession.has(r) && r !== k) {
          const c = ctx.rsSession.get(r)!;
          if (!children.includes(c)) children.push(c);
        } else if (
          isInt(r) && r >= 0 && r < ctx.dialogs.length && !removed.has(r) &&
          isPlainObject(ctx.dialogs[r]) && Object.keys(ctx.dialogs[r]).length > 0
        ) {
          if (!recs.includes(r)) recs.push(r);
        } else {
          ctx.report.add(
            'T7',
            UNRESOLVED,
            `recording-set dialog[${k}] lists recordings entry ${repr(r)}, which is not a kept Dialog or another ` +
              'recording-set; left out of the Session.',
            undefined,
            { dialog: k, entry: r }
          );
        }
      }
    } else {
      ctx.report.add('T7', UNRESOLVED, `recording-set dialog[${k}] has no recordings list.`, undefined, { dialog: k });
    }
    const addedBack = (back.get(k) ?? []).filter(i => !recs.includes(i));
    if (addedBack.length) {
      recs.push(...addedBack);
      ctx.report.add(
        'T7',
        INFERRED,
        `dialog(s) ${JSON.stringify(addedBack)} name recording-set dialog[${k}] in recording_set but are not in its ` +
          `recordings list; added to Session ${sidx}.`,
        undefined,
        { dialog: k, added: addedBack, session: sidx }
      );
    }
    const sess: Dict = {};
    const [dStart, dDur] = recs.length ? ctx.span(recs) : [undefined, undefined];
    if (ok(rs.start)) sess.start = rs.start;
    else if (dStart !== undefined) sess.start = dStart;
    if (isNum(rs.duration)) sess.duration = rs.duration;
    else if (dDur !== undefined) sess.duration = dDur;
    const rsParties = plainParties(rs.parties);
    const parties = rsParties.length ? rsParties : union(recs.map(r => ctx.receivers.get(r) ?? []));
    if (parties.length) sess.parties = parties;
    const orig = rs.originator;
    if (isInt(orig) && (!parties.length || orig !== parties[0])) {
      sess.originator = orig;
    } else if (orig !== undefined && orig !== null && !isInt(orig)) {
      ctx.report.add('T7', UNRESOLVED, `recording-set dialog[${k}] originator ${repr(orig)} is not a party index; dropped.`, undefined, {
        dialog: k
      });
    }
    const sid = rs.session_id;
    if (isPlainObject(sid)) {
      sess.session_id = sid;
    } else if (Array.isArray(sid) && sid.length === 1 && isPlainObject(sid[0])) {
      sess.session_id = sid[0];
    } else if (sid !== undefined && sid !== null) {
      ctx.report.add(
        'T7',
        UNRESOLVED,
        `recording-set dialog[${k}] session_id is not a single SessionId Object; Session.session_id not set.`,
        'AMB-4',
        { dialog: k, session_id: sid }
      );
    }
    if (children.length) {
      sess.sessions = children.map(c => ({ session: c, type: 'child' }));
      ctx.report.add(
        'T7',
        INFERRED,
        `recording-set dialog[${k}] lists other recording-set(s); Session ${sidx} references their ` +
          `Session(s) ${JSON.stringify(children)} as 'child'.`,
        'AMB-1',
        { dialog: k, session: sidx, children }
      );
    }
    if (recs.length) sess.dialog = recs;
    ctx.sessions[sidx] = orderSession(sess);
    for (const r of recs) {
      const lst = ctx.dialogSessions.get(r) ?? [];
      lst.push(sidx);
      ctx.dialogSessions.set(r, lst);
    }
    const fieldsMoved = ['start', 'duration', 'parties', 'session_id', 'originator'].filter(f => f in rs);
    ctx.report.add(
      'T7',
      INFERRED,
      `recording-set dialog[${k}] -> Session ${sidx}; its ${reprList(fieldsMoved)} moved to the Session ` +
        '(A.1 silent about them); Session start/duration/parties fall back to values derived from the recordings when absent.',
      'AMB-4',
      { dialog: k, session: sidx }
    );
    const known = ['type', 'recordings', 'start', 'duration', 'parties', 'session_id', 'originator', 'party_history'];
    const extra = Object.keys(rs).filter(key => !known.includes(key)).sort();
    if (extra.length) {
      const dropped: Dict = {};
      for (const f of extra) dropped[f] = rs[f];
      ctx.report.add(
        'T7',
        UNRESOLVED,
        `recording-set dialog[${k}] had parameter(s) ${reprList(extra)} with no Session equivalent; not migrated. ` +
          'Original kept in report.removedDialogs.',
        undefined,
        { dialog: k, dropped }
      );
    }
    if (ctx.catchAll !== undefined && recs.length) {
      ctx.report.add(
        'T7',
        UNRESOLVED,
        `Session ${sidx} (recording-set dialog[${k}]) overlaps Session ${ctx.catchAll}, which also lists its ` +
          'recordings; A.1 does not say whether to relate them, so no Session_Reference was added.',
        'AMB-1',
        { session: sidx, catch_all: ctx.catchAll }
      );
    }
  }
  // recording_set has been consumed above; recordings is only legal on recording-sets.
  if (Array.isArray(dialogs)) {
    for (const i of ctx.kept()) {
      delete dialogs[i].recording_set;
      if ('recordings' in dialogs[i]) {
        const val = dialogs[i].recordings;
        delete dialogs[i].recordings;
        ctx.report.add(
          'T7',
          UNRESOLVED,
          `dialog[${i}] (${repr(ctx.dialogs[i].type)}) had a recordings parameter, which only a ` +
            'recording-set may carry; removed.',
          undefined,
          { dialog: i, recordings: val }
        );
      }
    }
  }
}

function firstSlotIsNull(parties: unknown): boolean {
  return Array.isArray(parties) && parties.length > 0 && parties[0] === null;
}

/**
 * The first party slot of a text/incomplete Dialog is null: its sender is unknown.
 *
 * The next party in the list is a receiver, so promoting it would invent a
 * sender. An empty Party Object stands in (4.2.4: "If the originator is not
 * known, an empty Party Object ... may be used"), and it becomes the Session
 * originator so the first receiver is not implied to be the originator.
 */
function unknownFirstParty(ctx: Context, step: string, i: number, kind: string, role: string): number {
  const e = ctx.emptyParty(step, role);
  ctx.originators.set(i, e);
  ctx.report.add(
    step,
    UNRESOLVED,
    `${kind} dialog[${i}] has null as its first party, so its ${role} is unknown; an empty Party ` +
      `Object (parties[${e}]) stands in rather than promoting a receiver.`,
    undefined,
    { dialog: i, party: e }
  );
  return e;
}

/** T8: a `text` Dialog's `parties` reduce to the sender; all parties go to the Session. */
function stepT8TextParties(ctx: Context): void {
  const dialogs = ctx.out.dialog;
  if (!Array.isArray(dialogs)) return;
  for (const i of ctx.kept()) {
    if (ctx.dialogs[i].type !== 'text') continue;
    const p = plainParties(ctx.dialogs[i].parties);
    if (!p.length) {
      ctx.report.add('T8', UNRESOLVED, `text dialog[${i}] has no parties; sender and receivers unknown.`, undefined, { dialog: i });
      continue;
    }
    const orig = ctx.dialogs[i].originator;
    let sender: number;
    if (isInt(orig)) sender = orig;
    else if (firstSlotIsNull(ctx.dialogs[i].parties)) sender = unknownFirstParty(ctx, 'T8', i, 'text', 'sender');
    else sender = p[0];
    dialogs[i].parties = [sender];
    ctx.receivers.set(i, p.includes(sender) ? p : [sender, ...p]);
  }
}

/** T9: an `incomplete` Dialog's `parties` reduce to the originator (or first party). */
function stepT9IncompleteParties(ctx: Context): void {
  const dialogs = ctx.out.dialog;
  if (!Array.isArray(dialogs)) return;
  for (const i of ctx.kept()) {
    if (ctx.dialogs[i].type !== 'incomplete') continue;
    const p = plainParties(ctx.dialogs[i].parties);
    if (!p.length) continue;
    const orig = ctx.dialogs[i].originator;
    let who: number;
    if (isInt(orig)) who = orig;
    else if (firstSlotIsNull(ctx.dialogs[i].parties)) who = unknownFirstParty(ctx, 'T9', i, 'incomplete', 'originator');
    else who = p[0];
    dialogs[i].parties = [who];
    ctx.receivers.set(i, p.includes(who) ? p : [who, ...p]);
  }
}

/** T9b: other Dialogs keep `parties` (contributors); the Session gets the union (AMB-6). */
function stepT9bRecordingParties(ctx: Context): void {
  const idxs: number[] = [];
  for (const i of ctx.kept()) {
    if (ctx.dialogs[i].type === 'text' || ctx.dialogs[i].type === 'incomplete') continue;
    const p = plainParties(ctx.dialogs[i].parties);
    if (p.length) {
      ctx.receivers.set(i, p);
      idxs.push(i);
    }
  }
  if (idxs.length) {
    ctx.report.add(
      'T9b',
      INFERRED,
      `Dialog(s) ${JSON.stringify(idxs)} (recording or other type): parties left as the contributors; ` +
        'the Session parties are the union of the contributors across its Dialogs (A.1 gives no rule).',
      'AMB-6',
      { dialogs: idxs }
    );
  }
  const texts = ctx.kept().filter(i => ctx.dialogs[i].type === 'text');
  if (texts.length) {
    const sets = new Set(texts.map(i => JSON.stringify([...(ctx.receivers.get(i) ?? [])].sort((a, b) => a - b))));
    if (sets.size > 1) {
      ctx.report.add(
        'T8',
        UNRESOLVED,
        `text Dialogs ${JSON.stringify(texts)} have different receiver sets; they were put in one Session whose parties ` +
          'are the union. 4.5.4 prescribes a parent Session with a child Session per receiver set; that ' +
          'split was not made.',
        'AMB-5',
        { dialogs: texts }
      );
    }
    if ([...sets].some(s => (JSON.parse(s) as number[]).length > 2)) {
      ctx.report.add(
        'T8',
        UNRESOLVED,
        '0.4.0 parties do not distinguish To, Cc and Bcc, so Bcc recipients cannot be identified or excluded.',
        'AMB-5',
        { dialogs: texts }
      );
    }
  }
}

/** T10: each removed Dialog is replaced in place by `{}` so no index moves. */
function stepT10BlankRemoved(ctx: Context): void {
  const dialogs = ctx.out.dialog;
  if (!Array.isArray(dialogs)) return;
  for (const [k, kind] of ctx.removed) {
    ctx.report.removedDialogs[k] = clone(ctx.dialogs[k]);
    dialogs[k] = {};
    ctx.report.add('T10', INFO, `dialog[${k}] (${kind}) replaced by an empty Dialog Object; index ${k} unchanged.`, undefined, {
      dialog: k
    });
  }
  if (dialogs.length !== ctx.dialogs.length) {
    throw new MigrationError('T10: dialog array length changed; indices would break');
  }
}

function mergeIndex(existing: unknown, add: number[]): number | number[] {
  const cur = existing === undefined || existing === null ? [] : Array.isArray(existing) ? existing : [existing];
  const merged: number[] = [...cur];
  for (const n of add) if (!merged.includes(n)) merged.push(n);
  return merged.length === 1 ? merged[0] : merged;
}

/**
 * AMB-2: re-point analysis and attachment references to removed Dialogs.
 *
 * Recording-set: Analysis.dialog is expanded to the recordings and `sessions`
 * gets the recording-set's Session; an Attachment (single `dialog` index) gets
 * `session` instead. Transfer: the reference moves to the Session of the
 * transfer's original call. Nothing is left pointing at a `{}` Dialog.
 */
function stepT10bRetarget(ctx: Context): void {
  const removed = ctx.removed;
  if (!removed.size) return;

  /** (replacement dialog indices, session index) for a removed Dialog. */
  const targets = (e: number): [number[], number | undefined] => {
    if (removed.get(e) === 'recording-set') {
      const sidx = ctx.rsSession.get(e);
      const recs = sidx !== undefined ? ctx.sessions[sidx].dialog ?? [] : [];
      return [[...recs], sidx];
    }
    return [[], ctx.transferSession.get(e)];
  };

  (Array.isArray(ctx.out.analysis) ? ctx.out.analysis : []).forEach((an: any, n: number) => {
    if (!isPlainObject(an) || !('dialog' in an)) return;
    const old = an.dialog;
    const items = Array.isArray(old) ? old : [old];
    if (!items.some((x: unknown) => isInt(x) && removed.has(x))) return;
    const newDialogs: number[] = [];
    const sessAdd: number[] = [];
    for (const x of items) {
      if (isInt(x) && removed.has(x)) {
        const [reps, sidx] = targets(x);
        for (const r of reps) if (!newDialogs.includes(r)) newDialogs.push(r);
        if (sidx !== undefined) sessAdd.push(sidx);
      } else if (!newDialogs.includes(x)) {
        newDialogs.push(x);
      }
    }
    if (newDialogs.length) an.dialog = newDialogs.length === 1 && !Array.isArray(old) ? newDialogs[0] : newDialogs;
    else delete an.dialog;
    if (sessAdd.length) an.sessions = mergeIndex(an.sessions, sessAdd);
    ctx.report.add(
      'T10b',
      INFERRED,
      `analysis[${n}].dialog ${JSON.stringify(old)} pointed at a removed Dialog; now dialog=${JSON.stringify(an.dialog ?? null)}, ` +
        `sessions=${JSON.stringify(an.sessions ?? null)}.`,
      'AMB-2',
      { analysis: n }
    );
  });
  (Array.isArray(ctx.out.attachments) ? ctx.out.attachments : []).forEach((att: any, n: number) => {
    if (!isPlainObject(att) || !(isInt(att.dialog) && removed.has(att.dialog))) return;
    const e = att.dialog as number;
    const [, sidx] = targets(e);
    delete att.dialog;
    if (sidx !== undefined) {
      att.session = mergeIndex(att.session, [sidx]);
      ctx.report.add(
        'T10b',
        INFERRED,
        `attachments[${n}].dialog=${e} pointed at a removed Dialog; replaced by session=${JSON.stringify(att.session)}.`,
        'AMB-2',
        { attachment: n }
      );
    } else {
      ctx.report.add(
        'T10b',
        UNRESOLVED,
        `attachments[${n}].dialog=${e} pointed at a removed Dialog with no Session to re-point to; ` +
          'the attachment now has neither dialog nor session.',
        'AMB-2',
        { attachment: n }
      );
    }
  });
}

/**
 * Scope an attachment that has neither `dialog` nor `session`.
 *
 * Core-04 required `dialog`, but older writers omitted it, so stored data has
 * such attachments. Core-05 needs one of `dialog` or `session` (4.6.4). Only
 * when the result has exactly one Session is the scope unambiguous (that
 * Session is the whole conversation); it is then set and reported. Otherwise
 * nothing is invented and the gap is reported.
 */
function stepT10cUnscopedAttachments(ctx: Context): void {
  (Array.isArray(ctx.out.attachments) ? ctx.out.attachments : []).forEach((att: any, n: number) => {
    if (!isPlainObject(att) || 'dialog' in att || 'session' in att) return;
    if (ctx.sessions.length === 1) {
      att.session = 0;
      ctx.report.add('T10c', INFERRED, `attachments[${n}] had neither dialog nor session; scoped to the only Session (session=0).`, undefined, {
        attachment: n,
        purpose: att.purpose ?? null
      });
    } else {
      ctx.report.add(
        'T10c',
        UNRESOLVED,
        `attachments[${n}] has neither dialog nor session and the vCon has ${ctx.sessions.length} ` +
          'Sessions, so its scope cannot be chosen; set dialog or session by hand.',
        undefined,
        { attachment: n, purpose: att.purpose ?? null }
      );
    }
  });
}

/**
 * T13: a signed vCon is migrated as its unsigned payload; it must be signed again.
 *
 * `alg: "none"` is no longer permitted, so such a vCon is flagged explicitly.
 * The migration never signs.
 */
function stepT13UnwrapSigned(ctx: Context): void {
  const out = ctx.out;
  if ('ciphertext' in out && ('recipients' in out || 'protected' in out)) {
    throw new MigrationError('T13: the input is an encrypted (JWE) vCon; decrypt it before migrating');
  }
  if ('payload' in out && 'signatures' in out) {
    let payload: any;
    try {
      payload = JSON.parse(base64UrlDecodeToString(out.payload));
    } catch (e) {
      throw new MigrationError(`T13: could not decode the signed vCon payload: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!isPlainObject(payload)) throw new MigrationError('T13: the signed vCon payload is not a JSON object');
    const algs: unknown[] = [];
    for (const sig of Array.isArray(out.signatures) ? out.signatures : []) {
      try {
        if (sig.protected) algs.push(JSON.parse(base64UrlDecodeToString(sig.protected)).alg);
        if (isPlainObject(sig.header) && 'alg' in sig.header) algs.push(sig.header.alg);
      } catch {
        continue;
      }
    }
    ctx.out = payload;
    ctx.report.resignRequired = true;
    ctx.report.add(
      'T13',
      UNRESOLVED,
      'The input was signed. It was migrated as the unsigned payload; the signature was dropped. ' +
        'Re-signing is required, and signing changes updated_at (4.1.6).'
    );
    if (algs.some(a => typeof a === 'string' && a.toLowerCase() === 'none')) {
      ctx.report.add(
        'T13',
        UNRESOLVED,
        "A signature used alg 'none', which 0.5.0 forbids; sign again with a permitted algorithm."
      );
    }
  }
  ctx.src = clone(ctx.out);
  ctx.report.sourceVersion = ctx.out.vcon;
}

/** T14: `extensions` must list every extension in use (MUST, was SHOULD). */
function stepT14Extensions(ctx: Context): void {
  const { names, unnamed } = extensionsInUse(ctx.out);
  const listed: string[] = Array.isArray(ctx.out.extensions) ? [...ctx.out.extensions] : [];
  const added: string[] = [];
  for (const name of [...names].sort()) {
    if (!listed.includes(name)) {
      listed.push(name);
      added.push(name);
    }
  }
  for (const name of Array.isArray(ctx.out.critical) ? ctx.out.critical : []) {
    if (typeof name === 'string' && !listed.includes(name)) {
      listed.push(name);
      added.push(name);
    }
  }
  if (added.length) {
    ctx.out.extensions = listed;
    ctx.report.add('T14', INFERRED, `Added extension name(s) ${reprList(added)} to extensions.`, undefined, { added });
  }
  if (unnamed.length && !listed.length) {
    ctx.report.add(
      'T14',
      UNRESOLVED,
      'Values outside the core vocabulary are in use but their defining extension cannot be identified: ' +
        unnamed.join('; ') +
        '. extensions was not changed.',
      undefined,
      { uses: unnamed }
    );
  }
}

/** T15: duplicate header parameters in signed or encrypted forms are tolerated on read. */
function stepT15DuplicateHeaders(ctx: Context): void {
  if (ctx.report.resignRequired) {
    ctx.report.add(
      'T15',
      INFO,
      'Header parameters repeated across JWS headers are not checked or rejected on read; ' +
        'writers must not emit duplicates in 0.5.0.'
    );
  }
}

/** T11 and T12 are renames at the top level; the helper keeps key order. */
function renameTop(ctx: Context, oldKey: string, newKey: string, step: string): void {
  if (oldKey in ctx.out) {
    ctx.out = renameKey(ctx.out, oldKey, newKey);
    ctx.report.add(step, INFO, `Renamed '${oldKey}' to '${newKey}'.`);
  }
}

/** T11: `redacted` -> `redacted_from` (same fields). */
const stepT11 = (ctx: Context): void => renameTop(ctx, 'redacted', 'redacted_from', 'T11');
/** T12: `amended` -> `amended_from` (same fields). */
const stepT12 = (ctx: Context): void => renameTop(ctx, 'amended', 'amended_from', 'T12');

export interface MigrationStep {
  id: string;
  title: string;
  /** Where the draft says it. */
  source: string;
  func: (ctx: Context) => void;
}

/** One entry per step of the ordered transform table (Appendix A.1), in execution order. */
export const MIGRATION_STEPS: MigrationStep[] = [
  { id: 'T13', title: 'Signed input: migrate the payload, require re-signing', source: 'A.1 bullet 11; 6.2.2', func: stepT13UnwrapSigned },
  { id: 'T15', title: 'Duplicate header parameters tolerated on read', source: 'A.1 bullet 13', func: stepT15DuplicateHeaders },
  { id: 'T1', title: 'vcon 0.4.0 -> 0.5.0', source: 'A.1 bullet 1', func: stepT1Version },
  { id: 'T8', title: 'text Dialog parties -> sender; all parties to Session', source: 'A.1 bullet 6', func: stepT8TextParties },
  { id: 'T9', title: 'incomplete Dialog parties -> originator/first', source: 'A.1 bullet 6', func: stepT9IncompleteParties },
  { id: 'T9b', title: 'other Dialog parties kept; union to Session', source: '4.5.4 (A.1 silent)', func: stepT9bRecordingParties },
  { id: 'T6', title: 'Dialog originator -> Session originator', source: 'A.1 bullet 5', func: stepT6Originator },
  { id: 'T2', title: 'Add a Session referencing all Dialogs', source: 'A.1 bullet 2', func: stepT2Sessions },
  { id: 'T7', title: 'recording-set Dialog -> Session', source: 'A.1 bullet 9', func: stepT7RecordingSets },
  { id: 'T4', title: 'transfer Dialog -> transfer Events (with T5 Session references)', source: 'A.1 bullet 4', func: stepT4Transfers },
  { id: 'T3', title: 'party_history -> Events', source: 'A.1 bullet 3', func: stepT3PartyHistory },
  { id: 'T10', title: 'Removed Dialogs -> {} in place', source: 'A.1 bullet 10; 4.5.1', func: stepT10BlankRemoved },
  { id: 'T10b', title: 'Re-point analysis/attachment references to removed Dialogs', source: 'AMB-2', func: stepT10bRetarget },
  { id: 'T10c', title: 'Scope unscoped attachments to the only Session', source: '4.6.4 (A.1 silent)', func: stepT10cUnscopedAttachments },
  { id: 'T11', title: 'redacted -> redacted_from', source: 'A.1 bullet 7', func: stepT11 },
  { id: 'T12', title: 'amended -> amended_from', source: 'A.1 bullet 8', func: stepT12 },
  { id: 'T14', title: 'extensions lists every extension in use', source: 'A.1 bullet 12; 4.1.3', func: stepT14Extensions }
];

export interface MigrationOptions {
  /** Throw MigrationError instead of using a fallback for a MUST field with no source. */
  strict?: boolean;
}

/**
 * Migrate a 0.4.0 vCon object (or JSON string) to 0.5.0.
 *
 * A signed vCon (JWS general form) is migrated as its unsigned payload. The
 * input is not modified. The result carries the 0.5.0 object and the report
 * listing every inferred value, fallback and unresolved item.
 *
 * @throws MigrationError the input is not a 0.4.0 vCon, is encrypted, or (strict)
 *   a required field has no source.
 */
export function migrate040To050(vcon: unknown, options: MigrationOptions = {}): MigrationResult {
  const strict = options.strict ?? false;
  let input = vcon;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch (e) {
      throw new MigrationError(`input is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!isPlainObject(input)) throw new MigrationError('input must be a vCon object or JSON string');

  const data = clone(input);
  const report = new MigrationReport(strict);
  const ctx = new Context(data, strict, report);

  const version = data.vcon;
  if (version !== undefined && version !== null && version !== SOURCE_VERSION && !('payload' in data && 'signatures' in data)) {
    throw new MigrationError(`cannot migrate: input vcon is ${repr(version)}, expected ${repr(SOURCE_VERSION)}`);
  }
  for (const step of MIGRATION_STEPS) {
    report.stepsRun.push(step.id);
    step.func(ctx);
    if (step.id === 'T13') {
      const v = ctx.out.vcon;
      if (v !== undefined && v !== null && v !== SOURCE_VERSION) {
        throw new MigrationError(`cannot migrate: input vcon is ${repr(v)}, expected ${repr(SOURCE_VERSION)}`);
      }
      if (v === undefined || v === null) {
        const markers = V050_ONLY_KEYS.filter(k => k in ctx.out).sort();
        if (markers.length) {
          throw new MigrationError(
            `cannot migrate: input has no 'vcon' parameter but has 0.5.0-only parameter(s) ${reprList(markers)}; ` +
              'it is already 0.5.0 (vcon is optional there)'
          );
        }
        report.add('T13', INFO, "Input has no 'vcon' parameter; treated as 0.4.0.");
      }
    }
  }

  const out = ctx.out;
  if (ctx.sessions.length) out.sessions = ctx.sessions;
  if (ctx.events.length) out.events = ctx.events;

  // Lawful basis attachments keep their 0.4.0 scope (dialog). 0.5.0 scopes them with
  // session plus party; adding a Session reference would be inventing a scope.
  (Array.isArray(out.attachments) ? out.attachments : []).forEach((att: any, n: number) => {
    if (isPlainObject(att) && att.purpose === 'lawful_basis' && !('session' in att)) {
      report.add(
        'post',
        INFO,
        `attachments[${n}] is a lawful_basis attachment scoped by dialog only; it was left as is. ` +
          "0.5.0 scopes a lawful basis to Sessions with 'session' (plus 'party'); add it if it covers the Session.",
        undefined,
        { attachment: n }
      );
    }
  });

  // Post-check: the result must satisfy the core-05 rules; anything left is reported.
  const { errors } = validateVconDict(out, DIALOG_MIME_TYPES);
  for (const err of errors) report.add('post', UNRESOLVED, `Result does not validate: ${err}`);
  return { vcon: out, report };
}
