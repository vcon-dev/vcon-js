import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './fixtures/appendix-c-json-schema.json';
import { Vcon } from '../vcon';
import {
  migrate040To050,
  MigrationError,
  MigrationReport,
  MIGRATION_STEPS,
  FALLBACK,
  INFERRED,
  UNRESOLVED,
  ReportEntry
} from '../migration';

/**
 * Migration of a 0.4.0 vCon to 0.5.0 (Appendix A.1, steps T1 to T15).
 * Ported from the reference implementation's test suite.
 */

const T0 = '2022-06-21T17:53:26.000+00:00';
const T1 = '2022-06-21T17:54:00.000+00:00';
const T2 = '2022-06-21T17:55:00.000+00:00';

type D = Record<string, any>;

function v04(extra: D = {}): D {
  return {
    vcon: '0.4.0',
    uuid: '01a16b86-9a63-8346-b9a2-279e0d16bc46',
    created_at: '2022-06-21T13:53:00-04:00',
    parties: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }],
    dialog: [],
    analysis: [],
    attachments: [],
    ...extra
  };
}

const rec = (extra: D = {}): D => ({
  type: 'recording', start: T0, duration: 10, parties: [0, 1],
  mediatype: 'audio/x-wav', url: 'https://e.com/a.wav', content_hash: 'sha512-vBUU3xDKpjrwFoYiMR63DejHKvgyz4N7xT7Ukx6wHQNuzU4_LY32LMljsTeCGJ_zxqjeS4PcdM0Mlg0mksM06A', ...extra
});
const text = (extra: D = {}): D => ({
  type: 'text', start: T1, parties: [0, 1], body: 'hi', encoding: 'none', mediatype: 'text/plain', ...extra
});

let validateSchema: ValidateFunction;
beforeAll(() => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  validateSchema = ajv.compile(schema);
});

function checkSchema(vcon: D): void {
  if (!validateSchema(vcon)) {
    throw new Error('migrated vCon failed schema validation: ' + JSON.stringify(validateSchema.errors));
  }
}

function migrate(d: D, opts: { strict?: boolean } = {}) {
  const { vcon, report } = migrate040To050(d, opts);
  checkSchema(vcon);
  return { out: vcon, report };
}

const kinds = (report: MigrationReport, kind: string, step?: string): ReportEntry[] =>
  report.entries.filter(e => e.kind === kind && (step === undefined || e.step === step));

const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('table driven', () => {
  it('has one entry per transform step', () => {
    const ids = MIGRATION_STEPS.map(s => s.id);
    expect([...ids].sort()).toEqual(
      ['T1', 'T2', 'T3', 'T4', 'T6', 'T7', 'T8', 'T9', 'T9b', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T10b', 'T10c'].sort()
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(MIGRATION_STEPS.every(s => s.source && s.title && typeof s.func === 'function')).toBe(true);
  });

  it('runs the steps in the documented order', () => {
    const { report } = migrate(v04());
    expect(report.stepsRun).toEqual(MIGRATION_STEPS.map(s => s.id));
    const order = report.stepsRun;
    for (const step of ['T8', 'T9', 'T9b', 'T6', 'T2', 'T7', 'T3', 'T4']) {
      expect(order.indexOf(step)).toBeLessThan(order.indexOf('T10'));
    }
  });

  it('does not modify its input', () => {
    const d = v04({ dialog: [rec({ originator: 1, party_history: [{ party: 0, time: T0, event: 'join' }] })] });
    const before = JSON.parse(JSON.stringify(d));
    migrate040To050(d);
    expect(d).toEqual(before);
  });

  it('accepts a JSON string', () => {
    expect(migrate040To050(JSON.stringify(v04({ dialog: [rec()] }))).vcon.vcon).toBe('0.5.0');
  });

  it('rejects other versions and garbage', () => {
    expect(() => migrate040To050({ vcon: '0.5.0', uuid: 'a', created_at: '2022-01-01T00:00:00Z' })).toThrow(/expected '0.4.0'/);
    expect(() => migrate040To050('not json')).toThrow(MigrationError);
    expect(() => migrate040To050([1])).toThrow(MigrationError);
  });
});

describe('already migrated input', () => {
  it('refuses a missing vcon with sessions or events instead of migrating again', () => {
    const d = {
      uuid: 'u', created_at: T0, parties: [{}, {}], dialog: [rec()],
      sessions: [{ start: T0, parties: [1, 0], dialog: [0] }],
      events: [{ type: 'join', time: T0, sessions: 0, party: 0 }]
    };
    expect(() => migrate040To050(d)).toThrow(/already 0.5.0/);
  });

  it.each(['redacted_from', 'amended_from', 'redacted_strings'])('refuses a missing vcon with %s', key => {
    const d: D = { uuid: 'u', created_at: T0, [key]: key === 'redacted_strings' ? [] : { uuid: 'x' } };
    expect(() => migrate040To050(d)).toThrow(/already 0.5.0/);
  });

  it('still migrates a plain 0.4.0 shape with no vcon', () => {
    const d = v04({ dialog: [rec()] });
    delete d.vcon;
    const { vcon } = migrate040To050(d);
    expect(vcon.vcon).toBe('0.5.0');
    expect(vcon.sessions[0].dialog).toEqual([0]);
  });
});

describe('T1 version', () => {
  it('sets the vcon parameter', () => {
    expect(migrate(v04()).out.vcon).toBe('0.5.0');
  });

  it('sets a missing version and reports it', () => {
    const d = v04();
    delete d.vcon;
    const { vcon, report } = migrate040To050(d);
    expect(vcon.vcon).toBe('0.5.0');
    expect(report.inferred.some(e => e.code === 'AMB-12')).toBe(true);
  });
});

describe('T2 Session', () => {
  it('adds one Session referencing all Dialogs', () => {
    const { out } = migrate(v04({ dialog: [rec(), text()] }));
    expect(out.sessions).toHaveLength(1);
    expect(out.sessions[0].dialog).toEqual([0, 1]);
  });

  it('matches the Appendix B shape for a simple call', () => {
    const { out } = migrate(v04({ dialog: [rec({ parties: [0, 1] })] }));
    expect(out.sessions).toEqual([{ start: T0, duration: 10, parties: [0, 1], dialog: [0] }]);
  });

  it('makes no Session without dialog', () => {
    const { out } = migrate(v04());
    expect('sessions' in out).toBe(false);
    expect('events' in out).toBe(false);
  });

  it('skips the removed positions in the dialog list', () => {
    const { out } = migrate(v04({ dialog: [rec(), { type: 'recording-set', recordings: [0], start: T0 }, text()] }));
    expect(out.sessions[0].dialog).toEqual([0, 2]);
  });

  it('derives start and duration and reports it', () => {
    const { out, report } = migrate(v04({ dialog: [rec(), text({ duration: 5 })] }));
    expect(out.sessions[0].start).toBe(T0);
    expect(out.sessions[0].duration).toBe(39); // T0 .. (T1 + 5s) = 34s + 5s
    expect(report.inferred.some(e => e.message.includes('start/duration derived'))).toBe(true);
  });

  it('gives a text-only Session no duration', () => {
    expect('duration' in migrate(v04({ dialog: [text()] })).out.sessions[0]).toBe(false);
  });
});

describe('T3 party_history', () => {
  const HISTORY = [
    { party: 0, time: T0, event: 'join' },
    { party: 1, time: T0, event: 'join' },
    { party: 1, time: T1, event: 'hold' },
    { party: 0, time: T1, event: 'drop' }
  ];

  it('turns entries into Events with event renamed type', () => {
    const { out } = migrate(v04({ dialog: [rec({ party_history: HISTORY })] }));
    expect(out.events).toEqual([
      { type: 'join', time: T0, sessions: 0, party: 0 },
      { type: 'join', time: T0, sessions: 0, party: 1 },
      { type: 'hold', time: T1, sessions: 0, party: 1 },
      { type: 'drop', time: T1, sessions: 0, party: 0 }
    ]);
    expect('party_history' in out.dialog[0]).toBe(false);
  });

  it('keeps Events from referencing the Dialog', () => {
    const { out } = migrate(v04({ dialog: [rec({ party_history: HISTORY })] }));
    expect(out.events.every((e: D) => !('dialog' in e))).toBe(true);
  });

  it('keeps the button on key events', () => {
    const { out } = migrate(v04({ dialog: [rec({ party_history: [{ party: 0, time: T0, event: 'keydown', button: '5' }] })] }));
    expect(out.events[0]).toEqual({ type: 'keydown', time: T0, sessions: 0, party: 0, button: '5' });
  });

  it('lists both Sessions when the Dialog is in two', () => {
    const d = v04({ dialog: [rec({ party_history: HISTORY.slice(0, 1) }), { type: 'recording-set', recordings: [0], start: T0 }] });
    const { out, report } = migrate(d);
    expect(out.events[0].sessions).toEqual([0, 1]);
    expect(report.inferred.some(e => e.code === 'AMB-3')).toBe(true);
  });

  it('uses an empty Party Object for a missing party, or throws in strict mode', () => {
    const d = v04({ dialog: [rec({ party_history: [{ time: T0, event: 'join' }] })] });
    const { vcon, report } = migrate040To050(d);
    expect(vcon.parties[vcon.events[0].party]).toEqual({});
    expect(report.fallbacks.length).toBeGreaterThan(0);
    expect(() => migrate040To050(d, { strict: true })).toThrow(/no party/);
  });

  it('falls back to the Dialog start for a missing time', () => {
    const d = v04({ dialog: [rec({ party_history: [{ party: 0, event: 'join' }] })] });
    const { vcon, report } = migrate040To050(d);
    expect(vcon.events[0].time).toBe(T0);
    expect(report.fallbacks.length).toBeGreaterThan(0);
    expect(() => migrate040To050(d, { strict: true })).toThrow(MigrationError);
  });

  it('keeps an unparseable time in the report', () => {
    const { report } = migrate(v04({ dialog: [rec({ party_history: [{ party: 0, time: 'yesterday-ish', event: 'join' }] })] }));
    const fb = kinds(report, FALLBACK, 'T3');
    expect(fb[0].details.original_time).toBe('yesterday-ish');
  });

  it('falls back to created_at with no time and no Dialog start', () => {
    const d = rec({ party_history: [{ party: 0, event: 'join' }] });
    delete d.start;
    const { out, report } = migrate(v04({ dialog: [d] }));
    expect(out.events[0].time).toBe('2022-06-21T13:53:00-04:00');
    expect(kinds(report, FALLBACK, 'T3')[0].details.source).toBe('vCon created_at');
    expect(() => migrate040To050(v04({ dialog: [d] }), { strict: true })).toThrow(MigrationError);
  });

  it('carries extension parameters but drops names that clash with core Event parameters', () => {
    const { out, report } = migrate(v04({ dialog: [rec({ party_history: [{ party: 0, time: T0, event: 'join', x_reason: 'callback', channel: 3 }] })] }));
    expect(out.events[0].x_reason).toBe('callback');
    expect('channel' in out.events[0]).toBe(false);
    const e = kinds(report, UNRESOLVED, 'T3').find(x => x.message.includes('non-core'))!;
    expect(e.details.dropped).toEqual({ channel: 3 });
  });

  it('migrates party_history on text and incomplete Dialogs', () => {
    const { out } = migrate(v04({
      dialog: [
        text({ parties: [0, 1, 2], party_history: [{ party: 1, time: T1, event: 'join' }] }),
        { type: 'incomplete', start: T2, parties: [1, 0], disposition: 'busy', party_history: [{ party: 1, time: T2, event: 'drop' }] }
      ]
    }));
    expect(out.events.map((e: D) => e.type)).toEqual(['join', 'drop']);
    expect(out.events.every((e: D) => e.sessions === 0 && !('dialog' in e))).toBe(true);
    expect(out.dialog.every((d: D) => !('party_history' in d))).toBe(true);
  });

  it('lists the transfer role Sessions of a Dialog on its Events', () => {
    // dialog[0] is in a recording-set and is the transfer's original call
    const { out } = migrate(v04({
      dialog: [
        rec({ recording_set: 1, party_history: [{ party: 0, time: T0, event: 'join' }] }),
        { type: 'recording-set', recordings: [0] },
        { type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 0, start: T1 }
      ]
    }));
    const sessionsOf0 = out.sessions.map((s: D, n: number) => ((s.dialog ?? []).includes(0) ? n : -1)).filter((n: number) => n >= 0);
    const join = out.events.find((e: D) => e.type === 'join');
    expect([...join.sessions].sort()).toEqual([...sessionsOf0].sort());
    expect(sessionsOf0).toHaveLength(3);
  });
});

describe('T4 transfer to Events', () => {
  const base = (transfer: D) =>
    v04({
      dialog: [
        rec(), // 0 original call
        rec({ start: T1, parties: [1, 2] }), // 1 consultation call
        rec({ start: T2, parties: [0, 2] }), // 2 target call
        transfer // 3 transfer dialog
      ]
    });

  it('migrates a blind transfer', () => {
    const { out } = migrate(base({ type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, original: 0, target_dialog: 2 }));
    expect(out.events.map((e: D) => e.type)).toEqual(['blind-transfer']);
    const e = out.events[0];
    expect([e.party, e.transferee, e.transfer_target, e.time]).toEqual([1, 0, 2, T2]);
    expect('consultation' in e).toBe(false);
    expect(out.sessions[e.sessions].dialog).toEqual([0]);
    expect(out.sessions[e.target_session].dialog).toEqual([2]);
    expect(out.dialog[3]).toEqual({});
    expect(out.sessions.flatMap((s: D) => s.dialog ?? [])).not.toContain(3);
  });

  it('emits two Events sharing the consultation Session for a consultative transfer', () => {
    const { out } = migrate(base({ type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, original: 0, consultation: 1, target_dialog: 2 }));
    expect(out.events.map((e: D) => e.type)).toEqual(['consultation-start', 'consultative-transfer']);
    const [cs, ct] = out.events;
    expect(cs.consultation).toBe(ct.consultation);
    expect(out.sessions[cs.consultation].dialog).toEqual([1]);
    expect(out.sessions[ct.target_session].dialog).toEqual([2]);
    expect(cs.sessions).toBe(ct.sessions);
    expect('target_session' in cs).toBe(false);
    expect(ct.party).toBe(1);
    expect(cs.party).toBe(1);
  });

  it('reuses the Session of a recording-set original', () => {
    const d = v04({
      dialog: [
        rec(), rec({ start: T2 }),
        { type: 'recording-set', start: T0, recordings: [0], parties: [0, 1] },
        { type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, original: 2, target_dialog: 1 }
      ]
    });
    const { out } = migrate(d);
    const e = out.events[0];
    expect(out.sessions[e.sessions].dialog).toEqual([0]);
    expect(e.sessions).toBe(1); // the recording-set's Session
  });

  it('reports a time taken from another source', () => {
    const { out, report } = migrate(base({ type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 0, target_dialog: 2 }));
    expect(out.events[0].time).toBe(T2);
    const entries = report.inferred.filter(e => e.code === 'AMB-7' && e.message.includes('Event time taken from'));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].message).toContain('target dialog[2]');
  });

  it('takes the consultation time from the consultation call', () => {
    const { out, report } = migrate(base({ type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 0, consultation: 1, target_dialog: 2 }));
    expect(out.events[0].time).toBe(T1);
    expect(out.events[1].time).toBe(T2);
    expect(report.inferred.filter(e => e.message.includes('Event time taken from'))).toHaveLength(2);
  });

  it('falls back to created_at with no time source, or throws', () => {
    const d = v04({ dialog: [rec(), { type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 0 }] });
    const { vcon, report } = migrate040To050(d);
    expect(vcon.events[0].time).toBe(d.created_at);
    expect(report.fallbacks.some(e => e.message.includes('created_at'))).toBe(true);
    expect(() => migrate040To050(d, { strict: true })).toThrow(/no start and no other time source/);
    delete d.created_at;
    expect(() => migrate040To050(d)).toThrow(/no time can be sourced/);
  });

  it('maps a transfer with no target to transfer-abandoned', () => {
    const { out, report } = migrate(base({ type: 'transfer', start: T2, transferee: 0, transferor: 1, original: 0 }));
    const e = out.events[0];
    expect(e.type).toBe('transfer-abandoned');
    expect('transfer_target' in e).toBe(false);
    expect('target_session' in e).toBe(false);
    expect(report.inferred.some(x => x.code === 'AMB-7')).toBe(true);
  });

  it('gives an uncaptured target call a placeholder Session', () => {
    const { out, report } = migrate(base({ type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, original: 0 }));
    const e = out.events[0];
    expect(e.type).toBe('blind-transfer');
    expect(out.sessions[e.target_session]).toEqual({});
    expect(report.inferred.some(x => x.message.includes('placeholder Session'))).toBe(true);
  });

  it('uses an empty Party Object for a missing transferor, or throws in strict mode', () => {
    const t = { type: 'transfer', start: T2, transferee: 0, transfer_target: 2, original: 0, target_dialog: 2 };
    const { vcon, report } = migrate040To050(base(t));
    expect(vcon.parties[vcon.events[0].party]).toEqual({});
    expect(report.fallbacks.length).toBeGreaterThan(0);
    expect(() => migrate040To050(base(t), { strict: true })).toThrow(/no transferor/);
  });

  it('gives a missing original a placeholder Session, or throws in strict mode', () => {
    const t = { type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, target_dialog: 2 };
    const { vcon, report } = migrate040To050(base(t));
    expect(vcon.sessions[vcon.events[0].sessions]).toEqual({});
    expect(report.fallbacks.length).toBeGreaterThan(0);
    expect(() => migrate040To050(base(t), { strict: true })).toThrow(MigrationError);
  });

  it('keeps unmapped transfer content in the report', () => {
    const t = { type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, original: 0, target_dialog: 2, transfer: { reason: 'forwarded' } };
    const { report } = migrate040To050(base(t));
    expect(report.removedDialogs[3].transfer).toEqual({ reason: 'forwarded' });
    expect(report.unresolved.some(e => e.message.includes('no Event equivalent'))).toBe(true);
  });

  it('reports a transfer originator', () => {
    const { report } = migrate040To050(v04({
      dialog: [rec(), { type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 0, start: T1, originator: 1 }]
    }));
    const e = kinds(report, UNRESOLVED, 'T4').find(x => x.message.includes('no Event equivalent'))!;
    expect(e.details.dropped.originator).toBe(1);
  });

  it('uses the recording-set Session when the original is a recording-set', () => {
    const { out } = migrate(v04({
      dialog: [
        rec({ recording_set: 1 }), { type: 'recording-set', recordings: [0] },
        { type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 1, target_dialog: 3, start: T1 },
        rec({ parties: [0, 2], start: T2 })
      ]
    }));
    const ev = out.events[0];
    expect(ev.sessions).toBe(1);
    expect(out.sessions[1].dialog).toEqual([0]);
    expect(out.sessions[ev.target_session].dialog).toEqual([3]);
  });

  it('produces Events that pass the parameter table', () => {
    const t = { type: 'transfer', start: T2, transferee: 0, transferor: 1, transfer_target: 2, original: 0, consultation: 1, target_dialog: 2 };
    const { out, report } = migrate(base(t));
    expect(report.unresolved).toEqual([]);
    expect(new Vcon(out).isValid()).toEqual({ valid: true, errors: [] });
  });
});

describe('T6 originator', () => {
  it('moves to the Session when it is not the first party', () => {
    const { out } = migrate(v04({ dialog: [rec({ parties: [0, 1], originator: 1 })] }));
    expect(out.sessions[0].originator).toBe(1);
    expect('originator' in out.dialog[0]).toBe(false);
  });

  it('is dropped when it is the first party', () => {
    const { out } = migrate(v04({ dialog: [rec({ parties: [0, 1], originator: 0 })] }));
    expect('originator' in out.sessions[0]).toBe(false);
    expect('originator' in out.dialog[0]).toBe(false);
  });

  it('reports conflicting originators', () => {
    const { out, report } = migrate(v04({ dialog: [rec({ parties: [0, 1, 2], originator: 1 }), text({ parties: [0, 1, 2], originator: 2 })] }));
    expect(out.sessions[0].originator).toBe(1);
    expect(report.unresolved.some(e => e.message.includes('different originators'))).toBe(true);
  });

  it('makes a text sender the originator', () => {
    const { out } = migrate(v04({ dialog: [text({ parties: [0, 1, 2], originator: 2 })] }));
    expect(out.dialog[0].parties).toEqual([2]);
    expect(out.sessions[0].parties).toEqual([0, 1, 2]);
    expect(out.sessions[0].originator).toBe(2);
  });
});

describe('T7 recording-set', () => {
  const d = () =>
    v04({
      dialog: [
        rec({ recording_set: 2, start: T0, duration: 4, parties: [0, 1] }),
        rec({ recording_set: 2, start: T0, duration: 6, parties: [1, 0] }),
        { type: 'recording-set', start: T0, duration: 7, parties: [0, 1], originator: 1, session_id: { local: 'l', remote: 'r' }, recordings: [0, 1] }
      ]
    });

  it('becomes a Session', () => {
    const { out, report } = migrate(d());
    const s = out.sessions[1];
    expect(s.dialog).toEqual([0, 1]);
    expect([s.start, s.duration, s.parties, s.originator]).toEqual([T0, 7, [0, 1], 1]);
    expect(s.session_id).toEqual({ local: 'l', remote: 'r' });
    expect(report.inferred.some(e => e.code === 'AMB-4')).toBe(true);
    expect(report.unresolved.some(e => e.code === 'AMB-1')).toBe(true);
  });

  it('removes recording_set from the recordings', () => {
    const { out } = migrate(d());
    expect(out.dialog.slice(0, 2).every((x: D) => !('recording_set' in x))).toBe(true);
  });

  it('blanks and unlists the recording-set Dialog', () => {
    const { out, report } = migrate(d());
    expect(out.dialog[2]).toEqual({});
    expect(report.removedDialogs[2].type).toBe('recording-set');
    expect(out.sessions.every((s: D) => !(s.dialog ?? []).includes(2))).toBe(true);
  });

  it('keeps back-reference-only membership', () => {
    const { out, report } = migrate(v04({ dialog: [rec({ recording_set: 1 }), { type: 'recording-set', start: T0 }] }));
    expect(out.sessions[1].dialog).toEqual([0]);
    expect(report.inferred.some(e => e.step === 'T7' && e.message.includes('recording_set'))).toBe(true);
  });

  it('merges a back reference with a partial recordings list', () => {
    const { out } = migrate(v04({ dialog: [rec({ recording_set: 2 }), rec({ recording_set: 2 }), { type: 'recording-set', start: T0, recordings: [0] }] }));
    expect(out.sessions[1].dialog).toEqual([0, 1]);
  });

  it('reports a recording_set that points nowhere', () => {
    const { report } = migrate040To050(v04({ dialog: [rec({ recording_set: 5 })] }));
    expect(kinds(report, UNRESOLVED, 'T7').some(e => e.message.includes('recording_set=5'))).toBe(true);
  });

  it('turns a nested recording-set into a child reference', () => {
    const { out } = migrate(v04({ dialog: [rec(), rec(), { type: 'recording-set', recordings: [0, 1] }, { type: 'recording-set', recordings: [2] }] }));
    expect(out.sessions[2].sessions).toEqual([{ session: 1, type: 'child' }]);
    expect(out.sessions[1].dialog).toEqual([0, 1]);
  });

  it('resolves a nested forward reference', () => {
    const { out } = migrate(v04({ dialog: [rec(), { type: 'recording-set', recordings: [2] }, { type: 'recording-set', recordings: [0] }] }));
    expect(out.sessions[1].sessions).toEqual([{ session: 2, type: 'child' }]);
    expect(out.sessions[2].dialog).toEqual([0]);
  });

  it('reports unmapped recording-set fields with their values', () => {
    const { report } = migrate040To050(v04({ dialog: [rec({ recording_set: 1 }), { type: 'recording-set', recordings: [0], application: 'pbx', meta: { k: 1 } }] }));
    const e = kinds(report, UNRESOLVED, 'T7').find(x => x.message.includes('no Session equivalent'))!;
    expect(e.details.dropped).toEqual({ application: 'pbx', meta: { k: 1 } });
  });
});

describe('T8 and T9 parties', () => {
  it('reduces text Dialog parties to the sender and moves receivers to the Session', () => {
    const { out } = migrate(v04({ dialog: [text({ parties: [0, 1, 2] })] }));
    expect(out.dialog[0].parties).toEqual([0]);
    expect(out.sessions[0].parties).toEqual([0, 1, 2]);
  });

  it('reports a thread with different receivers instead of splitting it', () => {
    const { out, report } = migrate(v04({ dialog: [text({ parties: [0, 1] }), text({ parties: [1, 0, 2] })] }));
    expect(out.sessions).toHaveLength(1);
    expect(out.dialog.map((x: D) => x.parties)).toEqual([[0], [1]]);
    expect(out.sessions[0].parties).toEqual([0, 1, 2]);
    expect(report.unresolved.filter(e => e.code === 'AMB-5').length).toBeGreaterThanOrEqual(1);
  });

  it('reduces incomplete Dialog parties to the originator or the first party', () => {
    const inc = { type: 'incomplete', start: T0, parties: [2, 0], disposition: 'no-answer' };
    const a = migrate(v04({ dialog: [inc] })).out;
    expect(a.dialog[0].parties).toEqual([2]);
    expect(a.sessions[0].parties).toEqual([2, 0]);
    const b = migrate(v04({ dialog: [{ ...inc, originator: 0 }] })).out;
    expect(b.dialog[0].parties).toEqual([0]);
    expect(b.sessions[0].originator).toBe(0);
  });

  it('keeps recording parties and unions them into the Session', () => {
    const { out, report } = migrate(v04({ dialog: [rec({ parties: [0, 1] }), rec({ parties: [1, 2] })] }));
    expect(out.dialog.map((x: D) => x.parties)).toEqual([[0, 1], [1, 2]]);
    expect(out.sessions[0].parties).toEqual([0, 1, 2]);
    expect(report.inferred.some(e => e.code === 'AMB-6')).toBe(true);
  });

  it('reports a text Dialog without parties', () => {
    const t = text();
    delete t.parties;
    const { report } = migrate040To050(v04({ dialog: [t] }));
    expect(report.unresolved.some(e => e.message.includes('has no parties'))).toBe(true);
  });

  it('does not promote a receiver when the text sender is null', () => {
    const { out, report } = migrate(v04({ dialog: [text({ parties: [null, 1, 2] })] }));
    const sender = out.dialog[0].parties[0];
    expect([1, 2]).not.toContain(sender);
    expect(out.parties[sender]).toEqual({});
    const s = out.sessions[0];
    expect(s.parties[0] === sender || s.originator === sender).toBe(true);
    expect(kinds(report, UNRESOLVED, 'T8').some(e => e.message.includes('null'))).toBe(true);
  });

  it('does not promote a receiver when the incomplete originator is null', () => {
    const { out } = migrate(v04({ dialog: [{ type: 'incomplete', start: T0, parties: [null, 2], disposition: 'no-answer' }] }));
    const who = out.dialog[0].parties[0];
    expect(who).not.toBe(2);
    expect(out.parties[who]).toEqual({});
  });

  it('keeps a null recording channel', () => {
    expect(migrate(v04({ dialog: [rec({ parties: [null, 1] })] })).out.dialog[0].parties).toEqual([null, 1]);
  });
});

describe('T10 empty Dialogs and AMB-2', () => {
  it('blanks removed Dialogs in place', () => {
    const d = v04({
      dialog: [
        rec(),
        { type: 'transfer', start: T1, transferee: 0, transferor: 1, transfer_target: 2, original: 0, target_dialog: 3 },
        text(),
        rec({ start: T2 })
      ]
    });
    const { out, report } = migrate(d);
    expect(out.dialog).toHaveLength(4);
    expect(out.dialog[1]).toEqual({});
    expect([out.dialog[2].type, out.dialog[3].start]).toEqual(['text', T2]);
    expect(Object.keys(report.removedDialogs).map(Number)).toEqual([1]);
  });

  it('re-points analysis on a recording-set', () => {
    const d = v04({
      dialog: [rec({ recording_set: 1 }), { type: 'recording-set', start: T0, recordings: [0] }],
      analysis: [{ type: 'summary', dialog: 1, vendor: 'v', body: 's', encoding: 'none' }]
    });
    const { out, report } = migrate(d);
    expect([out.analysis[0].dialog, out.analysis[0].sessions]).toEqual([0, 1]);
    expect(report.inferred.some(e => e.code === 'AMB-2')).toBe(true);
  });

  it('expands an analysis dialog list', () => {
    const d = v04({
      dialog: [rec({ recording_set: 2 }), rec(), { type: 'recording-set', start: T0, recordings: [0] }],
      analysis: [{ type: 'summary', dialog: [1, 2], vendor: 'v', body: 's', encoding: 'none' }]
    });
    const { out } = migrate(d);
    expect(out.analysis[0].dialog).toEqual([1, 0]);
    expect(out.analysis[0].sessions).toBe(1);
  });

  it('gives an attachment on a removed Dialog the Session', () => {
    const d = v04({
      dialog: [rec({ recording_set: 1 }), { type: 'recording-set', start: T0, recordings: [0] }],
      attachments: [{ purpose: 'notes', start: T0, party: 0, dialog: 1, body: 'n', encoding: 'none', mediatype: 'text/plain' }]
    });
    const att = migrate(d).out.attachments[0];
    expect('dialog' in att).toBe(false);
    expect(att.session).toBe(1);
  });

  it('moves analysis on a transfer Dialog to the original Session', () => {
    const d = v04({
      dialog: [rec(), { type: 'transfer', start: T1, transferee: 0, transferor: 1, transfer_target: 2, original: 0, target_dialog: 0 }],
      analysis: [{ type: 'report', dialog: 1, vendor: 'v', body: 'why', encoding: 'none' }]
    });
    const { out } = migrate(d);
    expect('dialog' in out.analysis[0]).toBe(false);
    expect(out.analysis[0].sessions).toBe(out.events[0].sessions);
  });

  it('leaves references to kept Dialogs alone', () => {
    const d = v04({
      dialog: [rec(), text()],
      analysis: [{ type: 'summary', dialog: [0, 1], vendor: 'v', body: 's', encoding: 'none' }],
      attachments: [{ purpose: 'notes', start: T0, party: 0, dialog: 1, body: 'n', encoding: 'none', mediatype: 'text/plain' }]
    });
    const { out, report } = migrate(d);
    expect(out.analysis[0].dialog).toEqual([0, 1]);
    expect('sessions' in out.analysis[0]).toBe(false);
    expect(out.attachments[0].dialog).toBe(1);
    expect(report.entries.filter(e => e.step === 'T10b')).toEqual([]);
  });
});

describe('index stability', () => {
  const IDENT = ['type', 'start', 'duration', 'mediatype', 'body', 'url', 'disposition'];
  const source = () =>
    v04({
      dialog: [
        rec(), // 0
        { type: 'recording-set', start: T0, recordings: [0, 3], parties: [0, 1] }, // 1
        { type: 'transfer', start: T1, transferee: 0, transferor: 1, transfer_target: 2, original: 1, consultation: 4, target_dialog: 3 }, // 2
        rec({ start: T2, parties: [0, 2], party_history: [{ party: 2, time: T2, event: 'join' }] }), // 3
        text({ parties: [1, 2] }), // 4
        { type: 'incomplete', start: T2, parties: [2, 0], disposition: 'busy' } // 5
      ],
      analysis: [
        { type: 'a0', dialog: 0, vendor: 'v', body: 'x', encoding: 'none' },
        { type: 'a3', dialog: [3, 4], vendor: 'v', body: 'x', encoding: 'none' },
        { type: 'a5', dialog: 5, vendor: 'v', body: 'x', encoding: 'none' }
      ],
      attachments: [
        { purpose: 'p4', start: T0, party: 0, dialog: 4, body: 'x', encoding: 'none', mediatype: 'text/plain' },
        { purpose: 'p5', start: T0, party: 0, dialog: 5, body: 'x', encoding: 'none', mediatype: 'text/plain' }
      ]
    });
  const ident = (d: D) => Object.fromEntries(IDENT.filter(k => k in d).map(k => [k, d[k]]));

  it('keeps the dialog array length and positions', () => {
    const src = source();
    const { out, report } = migrate(src);
    expect(out.dialog).toHaveLength(src.dialog.length);
    const removed = new Set(Object.keys(report.removedDialogs).map(Number));
    expect([...removed]).toEqual([1, 2]);
    src.dialog.forEach((a: D, i: number) => {
      if (removed.has(i)) expect(out.dialog[i]).toEqual({});
      else expect(ident(out.dialog[i])).toEqual(ident(a));
    });
  });

  it('resolves analysis and attachment references to the same Dialog', () => {
    const src = source();
    const { out } = migrate(src);
    src.analysis.forEach((aSrc: D, n: number) => {
      const before = Array.isArray(aSrc.dialog) ? aSrc.dialog : [aSrc.dialog];
      const raw = out.analysis[n].dialog;
      const after = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
      for (const i of before) {
        if (['transfer', 'recording-set'].includes(src.dialog[i].type)) continue;
        expect(after).toContain(i);
        expect(ident(out.dialog[i])).toEqual(ident(src.dialog[i]));
      }
      expect(after.every((i: number) => Object.keys(out.dialog[i]).length > 0)).toBe(true);
    });
    src.attachments.forEach((tSrc: D, n: number) => {
      const i = tSrc.dialog;
      expect(out.attachments[n].dialog).toBe(i);
      expect(ident(out.dialog[i])).toEqual(ident(src.dialog[i]));
    });
  });

  it('resolves Session and Event references to the intended Dialogs', () => {
    const { out } = migrate(source());
    for (const s of out.sessions) for (const i of s.dialog ?? []) expect(Object.keys(out.dialog[i]).length).toBeGreaterThan(0);
    const join = out.events.find((e: D) => e.type === 'join');
    const sessions = Array.isArray(join.sessions) ? join.sessions : [join.sessions];
    expect(sessions.some((n: number) => out.sessions[n].dialog.includes(3))).toBe(true);
    const byType: Record<string, D> = {};
    for (const e of out.events) if (e.type !== 'join') byType[e.type] = e;
    expect(out.sessions[byType['consultative-transfer'].sessions].dialog).toEqual([0, 3]);
    expect(out.sessions[byType['consultative-transfer'].target_session].dialog).toEqual([3]);
    expect(out.sessions[byType['consultation-start'].consultation].dialog).toEqual([4]);
  });

  it('would have broken the references if empty Dialogs were filtered first', () => {
    const { out } = migrate(source());
    const filtered = out.dialog.filter((d: D) => Object.keys(d).length > 0);
    expect(filtered[3].type !== out.dialog[3].type || JSON.stringify(filtered[1]) !== JSON.stringify(out.dialog[1])).toBe(true);
    expect([out.dialog[4].type, out.dialog[5].type]).toEqual(['text', 'incomplete']);
    for (const s of out.sessions) for (const i of s.dialog ?? []) expect(i).toBeLessThan(out.dialog.length);
  });

  it('resolves every reference in the result', () => {
    const { out, report } = migrate(source());
    expect(new Vcon(out).isValid()).toEqual({ valid: true, errors: [] });
    expect(report.unresolved.filter(e => e.step === 'post')).toEqual([]);
  });
});

describe('T11 and T12 renames', () => {
  it('renames redacted', () => {
    const r = { uuid: '01a16b86-96e7-80a8-b9a2-279e0d16bc46', type: 'PII Redaction', url: 'https://e.com/u', content_hash: 'sha512-vBUU3xDKpjrwFoYiMR63DejHKvgyz4N7xT7Ukx6wHQNuzU4_LY32LMljsTeCGJ_zxqjeS4PcdM0Mlg0mksM06A' };
    const { out } = migrate(v04({ redacted: r }));
    expect(out.redacted_from).toEqual(r);
    expect('redacted' in out).toBe(false);
  });

  it('renames amended', () => {
    const a = { uuid: '01a16b86-96e7-80a8-b9a2-279e0d16bc46' };
    const { out } = migrate(v04({ amended: a }));
    expect(out.amended_from).toEqual(a);
    expect('amended' in out).toBe(false);
  });

  it('keeps the key position', () => {
    const amended = { uuid: '01a16b86-96e7-80a8-b9a2-279e0d16bc46' };
    const { out } = migrate(v04({ amended }));
    expect(Object.keys(out).indexOf('amended_from')).toBe(Object.keys(v04({ amended })).indexOf('amended'));
  });
});

describe('T13 signed input', () => {
  const signed = (payload: D, alg = 'RS256'): D => ({
    payload: b64(payload),
    signatures: [{ protected: b64({ alg }), header: { uuid: 'x' }, signature: 'AAAA' }]
  });

  it('migrates a signed vCon as its unsigned payload', () => {
    const { out, report } = migrate(signed(v04({ dialog: [rec()] })));
    expect('signatures' in out || 'payload' in out).toBe(false);
    expect(out.vcon).toBe('0.5.0');
    expect(out.sessions).toBeTruthy();
    expect(report.resignRequired).toBe(true);
    expect(report.unresolved.some(e => e.message.includes('Re-signing is required'))).toBe(true);
  });

  it('calls out alg none', () => {
    const { report } = migrate(signed(v04(), 'none'));
    expect(report.unresolved.some(e => e.message.includes("alg 'none'"))).toBe(true);
  });

  it('does not require re-signing for unsigned input', () => {
    expect(migrate(v04()).report.resignRequired).toBe(false);
  });

  it('throws on a bad payload', () => {
    expect(() => migrate040To050({ payload: '!!!', signatures: [] })).toThrow(/payload/);
  });

  it('throws on encrypted input', () => {
    expect(() => migrate040To050({ protected: 'x', ciphertext: 'y', recipients: [] })).toThrow(/decrypt/);
  });

  it('requires the signed payload to be 0.4.0', () => {
    expect(() => migrate040To050(signed({ vcon: '0.5.0', uuid: 'a', created_at: '2022-01-01T00:00:00Z' }))).toThrow(/expected '0.4.0'/);
  });

  it('notes T15 for signed input', () => {
    const { report } = migrate040To050({ payload: b64(v04()), signatures: [] });
    expect(report.notes.some(e => e.step === 'T15')).toBe(true);
  });
});

describe('T14 extensions', () => {
  const LB = { purpose: 'lawful_basis', start: T0, party: 0, dialog: 0, body: {}, encoding: 'json', mediatype: 'application/json' };

  it('adds the extensions in use', () => {
    const { out, report } = migrate(v04({ dialog: [rec()], attachments: [LB] }));
    expect(out.extensions).toEqual(['lawful_basis']);
    expect(report.inferred.some(e => e.message.includes('lawful_basis'))).toBe(true);
  });

  it('keeps and extends an existing list', () => {
    const { out } = migrate(v04({ dialog: [rec()], attachments: [LB], extensions: ['x'], critical: ['y'] }));
    expect(out.extensions).toEqual(['x', 'lawful_basis', 'y']);
  });

  it('adds wtf_transcription for a WTF analysis', () => {
    const { out } = migrate(v04({ dialog: [rec()], analysis: [{ type: 'wtf_transcription', dialog: 0, vendor: 'v', body: {}, encoding: 'json' }] }));
    expect(out.extensions).toContain('wtf_transcription');
  });

  it('reports, and does not invent, an extension it cannot identify', () => {
    const { vcon, report } = migrate040To050(v04({ dialog: [rec({ encoding: 'gzip', body: 'x' })] }));
    expect('extensions' in vcon).toBe(false);
    expect(report.unresolved.some(e => e.message.includes('cannot be identified'))).toBe(true);
  });

  it('changes nothing when no extension is in use', () => {
    expect('extensions' in migrate(v04({ dialog: [rec()] })).out).toBe(false);
  });
});

describe('T10c unscoped attachments', () => {
  const att = (extra: D = {}): D => ({ purpose: 'note', start: T0, party: 0, body: 'x', encoding: 'none', mediatype: 'text/plain', ...extra });

  it('scopes to the only Session and reports it', () => {
    const { out, report } = migrate(v04({ dialog: [rec()], attachments: [att()] }));
    expect(out.attachments[0].session).toBe(0);
    expect(kinds(report, INFERRED, 'T10c').length).toBeGreaterThan(0);
  });

  it('leaves it unresolved with several Sessions', () => {
    const { vcon, report } = migrate040To050(v04({ dialog: [rec({ recording_set: 1 }), { type: 'recording-set', recordings: [0] }], attachments: [att()] }));
    expect('session' in vcon.attachments[0] || 'dialog' in vcon.attachments[0]).toBe(false);
    expect(kinds(report, UNRESOLVED, 'T10c').length).toBeGreaterThan(0);
  });
});

describe('lawful basis survives migration', () => {
  const LB = {
    purpose: 'lawful_basis', start: T0, party: 0, dialog: 0, body: { lawful_basis: 'consent' },
    encoding: 'json', mediatype: 'application/json'
  };

  it('keeps the attachment unchanged and notes the gap', () => {
    const { out, report } = migrate(v04({ dialog: [rec()], attachments: [JSON.parse(JSON.stringify(LB))] }));
    expect(out.attachments).toEqual([LB]);
    expect('session' in out.attachments[0]).toBe(false);
    expect(report.notes.filter(e => e.message.includes('lawful_basis attachment scoped by dialog only'))).toHaveLength(1);
    expect(new Vcon(out).findLawfulBasisAttachments().length).toBeGreaterThan(0);
  });

  it('does not flag one that already has a session', () => {
    const { report } = migrate(v04({ dialog: [rec()], attachments: [{ ...LB, session: [0] }] }));
    expect(report.notes.filter(e => e.message.includes('lawful_basis'))).toEqual([]);
  });

  it('gives an attachment on a removed Dialog the recording-set Session', () => {
    const d = v04({ dialog: [rec({ recording_set: 1 }), { type: 'recording-set', start: T0, recordings: [0] }], attachments: [{ ...LB, dialog: 1 }] });
    const { out } = migrate(d);
    expect(out.attachments[0].session).toBe(1);
    expect('dialog' in out.attachments[0]).toBe(false);
    expect(out.attachments[0].purpose).toBe('lawful_basis');
  });
});

describe('report', () => {
  it('has a serializable structure', () => {
    const { report } = migrate(v04({ dialog: [rec(), text({ parties: [0, 1, 2] })] }));
    expect(report).toBeInstanceOf(MigrationReport);
    expect([report.sourceVersion, report.targetVersion]).toEqual(['0.4.0', '0.5.0']);
    const d = JSON.parse(JSON.stringify(report.toDict()));
    expect(d.entries.length).toBeGreaterThan(0);
    expect(d.steps_run.length).toBeGreaterThan(0);
    expect(report.summary()).toContain('inferred');
  });

  it('reports post-migration problems', () => {
    // An attachment that already lacked party was invalid in 0.4.0 and stays so.
    const { report } = migrate040To050(v04({ dialog: [rec()], attachments: [{ purpose: 'x', body: 'b', encoding: 'none' }] }));
    expect(report.unresolved.some(e => e.step === 'post' && e.message.includes('party'))).toBe(true);
  });

  it('uses only known kinds', () => {
    const { report } = migrate(v04({ dialog: [rec({ originator: 1 }), text({ parties: [0, 1, 2] })] }));
    expect(report.entries.every(e => ['inferred', 'fallback', 'unresolved', 'info'].includes(e.kind))).toBe(true);
  });
});

describe('readers accept both versions', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('migrates 0.4.0 JSON on load', () => {
    const v = Vcon.buildFromJson(JSON.stringify(v04({ dialog: [rec({ originator: 1 })] })));
    expect(v.vcon).toBe('0.5.0');
    expect(v.migrationReport).toBeDefined();
    expect(v.sessions[0].originator).toBe(1);
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
  });

  it('does not touch 0.5.0 input', () => {
    const src = { vcon: '0.5.0', uuid: 'a', created_at: '2022-01-01T00:00:00Z', parties: [], dialog: [{}], sessions: [{}] };
    const v = new Vcon(JSON.parse(JSON.stringify(src)));
    expect(v.migrationReport).toBeUndefined();
    expect(v.data.dialog).toEqual([{}]);
    expect(v.data.sessions).toEqual([{}]);
  });

  it('does not migrate input without vcon on load', () => {
    const d = v04({ dialog: [rec({ originator: 1 })] });
    delete d.vcon;
    const v = new Vcon(d);
    expect(v.migrationReport).toBeUndefined();
    expect(v.data.dialog![0].originator).toBe(1);
  });

  it('keeps the raw document with migrateLegacy false', () => {
    const v = new Vcon(v04({ dialog: [rec()] }), { migrateLegacy: false });
    expect(v.vcon).toBe('0.4.0');
    expect(v.migrationReport).toBeUndefined();
    expect(v.isValid().valid).toBe(false);
  });

  it('keeps legacy fields when migration is off', () => {
    const d = v04({ redacted: { uuid: 'x', type: 'PII' }, dialog: [rec({ originator: 1, party_history: [{ party: 0, time: T0, event: 'join' }] })] });
    const v = new Vcon(d, { migrateLegacy: false });
    expect((v.data as any).redacted).toEqual({ uuid: 'x', type: 'PII' });
    expect(v.data.dialog![0].party_history).toBeTruthy();
    expect(v.data.dialog![0].originator).toBe(1);
  });

  it('explicit migration accepts input with no vcon and returns a Vcon with its report', () => {
    const d = v04({ dialog: [rec()] });
    delete d.vcon;
    const v = Vcon.migrate040To050(d);
    expect(v.vcon).toBe('0.5.0');
    expect(v.migrationReport).toBeDefined();
    expect(v.sessions.length).toBeGreaterThan(0);
  });

  it('strict migration throws through the constructor', () => {
    const d = v04({ dialog: [rec(), { type: 'transfer', transferee: 0, transfer_target: 2, original: 0 }] });
    expect(() => new Vcon(d, { strictMigration: true })).toThrow(MigrationError);
  });

  it('writers emit 0.5.0', () => {
    const v = Vcon.buildFromJson(JSON.stringify(v04({ dialog: [rec()] })));
    expect(JSON.parse(v.toJson()).vcon).toBe('0.5.0');
  });
});

describe('signed 0.4.0 input is not migrated on load', () => {
  const signed = (payload: D): D => ({
    payload: b64(payload),
    signatures: [{ protected: b64({ alg: 'RS256' }), signature: 'c2ln', header: { x5c: [] } }]
  });

  it('keeps the signature and payload untouched', () => {
    const s = signed(v04({ dialog: [rec()] }));
    const spy = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      const v = new Vcon(s);
      expect(v.migrationReport).toBeUndefined();
      expect(v.data.signatures).toEqual(s.signatures);
      expect(v.data.payload).toBe(s.payload);
      expect(Object.keys(v.data).sort()).toEqual(['payload', 'signatures']); // no defaults added
    } finally {
      spy.mockRestore();
    }
  });

  it('migrates explicitly after verification', () => {
    const v = Vcon.migrate040To050(signed(v04({ dialog: [rec()] })));
    expect(v.migrationReport!.resignRequired).toBe(true);
    expect('signatures' in v.data).toBe(false);
    expect(v.vcon).toBe('0.5.0');
  });
});

/**
 * Regressions found by diffing this port against the Python reference
 * (every 0.4.0 input from the reference tests plus adversarial ones).
 */
describe('parity with the reference implementation', () => {
  it('derives Session duration with microsecond precision', () => {
    const { vcon } = migrate040To050(v04({
      dialog: [
        rec({ start: '2022-01-01T00:00:00.123456Z', duration: 10 }),
        rec({ start: '2022-01-01T00:00:00.5Z', duration: 10 })
      ]
    }));
    expect(vcon.sessions[0].duration).toBe(10.376544);
  });

  it('picks the earliest start when two starts differ by less than a millisecond', () => {
    const { vcon } = migrate040To050(v04({
      dialog: [
        rec({ start: '2022-01-01T00:00:00.0009Z', duration: 1 }),
        rec({ start: '2022-01-01T00:00:00.0001Z', duration: undefined })
      ]
    }));
    expect(vcon.sessions[0].start).toBe('2022-01-01T00:00:00.0001Z');
    expect(vcon.sessions[0].duration).toBe(1.0008);
  });

  it('rounds durations to six decimals half to even, as round(x, 6) does', () => {
    const { vcon } = migrate040To050(v04({ dialog: [rec({ start: '2022-01-01T00:00:00Z', duration: 0.0078125 })] }));
    expect(vcon.sessions[0].duration).toBe(0.007812);
  });

  it('formats a derived consultation-end Event time like the reference', () => {
    const transfer = { type: 'transfer', transferee: 0, transferor: 1, transfer_target: 2, original: 0, consultation: 1 };
    const half = migrate040To050(v04({
      dialog: [rec(), rec({ start: '2022-01-01T00:01:00Z', duration: 30.5, parties: [1, 2] }), transfer]
    })).vcon;
    expect(half.events.find((e: D) => e.type === 'consultative-transfer').time).toBe('2022-01-01T00:01:30.500000+00:00');
    const whole = migrate040To050(v04({
      dialog: [rec(), rec({ start: '2022-01-01T00:01:00Z', duration: 60, parties: [1, 2] }), transfer]
    })).vcon;
    expect(whole.events.find((e: D) => e.type === 'consultative-transfer').time).toBe('2022-01-01T00:02:00+00:00');
    const micro = migrate040To050(v04({
      dialog: [rec(), rec({ start: '2022-01-01T00:01:00.123456+00:00', duration: 0.0000015, parties: [1, 2] }), transfer]
    })).vcon;
    expect(micro.events.find((e: D) => e.type === 'consultative-transfer').time).toBe('2022-01-01T00:01:00.123457+00:00');
  });

  it.each(['2022-02-30T00:00:00Z', '2022-01-01T24:00:00Z', '2022-13-01T00:00:00Z', '2022-01-01T00:00:00+24:00'])(
    'does not treat the out-of-range date-time %s as a start',
    start => {
      const { vcon, report } = migrate040To050(v04({ dialog: [rec({ start })] }));
      expect(vcon.sessions[0].start).toBeUndefined();
      expect(report.unresolved.some(e => e.step === 'post')).toBe(true);
    }
  );
});
