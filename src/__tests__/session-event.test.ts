import { Vcon } from '../vcon';
import { Dialog } from '../dialog';
import { Party, PartyHistory } from '../party';
import { Session, SessionReference, validateSession } from '../session';
import { Event, EVENT_PARAMETER_RULES, CORE_EVENT_TYPES, validateEvent } from '../event';

const T = '2026-01-01T00:00:00Z';

function validEvent(etype: string): Record<string, any> {
  const base: Record<string, any> = { type: etype, time: T };
  if (etype === 'channel-contributors') return { ...base, dialog: 0, channel: 0 };
  Object.assign(base, { sessions: 0, party: 0 });
  if (etype === 'keydown' || etype === 'keyup') base.button = '5';
  else if (etype === 'consultation-start') Object.assign(base, { transferee: 1, transfer_target: 2, consultation: 1 });
  else if (etype === 'blind-transfer') Object.assign(base, { transferee: 1, transfer_target: 2, target_session: 1 });
  else if (etype === 'consultative-transfer') Object.assign(base, { transferee: 1, transfer_target: 2, consultation: 1, target_session: 2 });
  else if (etype === 'transfer-abandoned') Object.assign(base, { transferee: 1 });
  return base;
}

const SAMPLE: Record<string, any> = {
  sessions: 0, party: 0, dialog: 0, channel: 0, contributors: [0], button: '1',
  transferee: 0, transfer_target: 0, consultation: 0, target_session: 0
};

describe('Session', () => {
  it('allows an empty Session', () => {
    expect(new Session().toDict()).toEqual({});
    expect(validateSession({})).toEqual({ errors: [], warnings: [] });
  });

  it('serializes only the parameters that are set', () => {
    const s = new Session({
      start: new Date('2026-01-01T00:00:00Z'),
      duration: 60,
      parties: [0, 1],
      originator: 1,
      session_id: { local: 'l', remote: 'r' },
      sessions: [new SessionReference(1, 'child', 'consult')],
      dialog: [0]
    });
    expect(s.toDict()).toEqual({
      start: '2026-01-01T00:00:00.000Z',
      duration: 60,
      parties: [0, 1],
      originator: 1,
      session_id: { local: 'l', remote: 'r' },
      sessions: [{ session: 1, type: 'child', description: 'consult' }],
      dialog: [0]
    });
  });

  it('requires an index and a type on a Session_Reference', () => {
    expect(() => new SessionReference(-1, 'child')).toThrow();
    expect(() => new SessionReference(0, '')).toThrow();
  });

  it('checks Session_Reference entries', () => {
    const { errors } = validateSession({ start: T, parties: [0], sessions: [{ session: 5, type: 'child' }, { type: 'peer' }] }, { sessionCount: 1, partyCount: 1 });
    expect(errors).toContain('Session references invalid session index: 5');
    expect(errors).toContain('Session sessions[1] is missing required field: session');
  });

  it('addSession returns the index', () => {
    const v = Vcon.buildNew();
    expect(v.addSession(new Session({ start: T, parties: [0] }))).toBe(0);
    expect(v.addSession()).toBe(1);
    expect(v.sessions[1]).toEqual({});
  });

  it('checks Session dialog and party indices', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'A' }));
    v.addSession({ start: T, parties: [0, 3], dialog: [7] });
    const { valid, errors } = v.isValid();
    expect(valid).toBe(false);
    expect(errors).toContain('Session at index 0 references invalid party index: 3');
    expect(errors).toContain('Session at index 0 references invalid dialog index: 7');
  });

  it('requires a Session when dialog or events exist', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'A' }));
    v.addDialog(new Dialog({ type: 'text', start: T, parties: [0], body: 'x', mediatype: 'text/plain', encoding: 'none' }));
    expect(v.isValid().errors.some(e => /At least one Session/.test(e))).toBe(true);
    v.addSession({ start: T, parties: [0], dialog: [0] });
    expect(v.isValid().valid).toBe(true);
  });

  it('adds a Dialog to a Session and warns about an unreferenced Dialog', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'A' }));
    v.addSession({ start: T, parties: [0] });
    const d = () => new Dialog({ type: 'text', start: T, parties: [0], body: 'x', mediatype: 'text/plain', encoding: 'none' });
    expect(v.addDialog(d(), 0)).toBe(0);
    expect(v.sessions[0].dialog).toEqual([0]);
    v.addDialog(d());
    expect(v.getValidationWarnings()).toContain('Dialog at index 1 is not referenced by any Session Object.');
    expect(() => v.addDialog(d(), 4)).toThrow(/Invalid session index/);
  });
});

describe('Event table (core-05 4.3.1.5)', () => {
  it.each(CORE_EVENT_TYPES)('%s: a minimal valid Event passes', etype => {
    expect(validateEvent(validEvent(etype))).toEqual({ errors: [], warnings: [] });
  });

  it.each(CORE_EVENT_TYPES)('%s: every M parameter is enforced', etype => {
    for (const [param, code] of Object.entries(EVENT_PARAMETER_RULES[etype])) {
      if (code !== 'M') continue;
      const ev = validEvent(etype);
      delete ev[param];
      expect(validateEvent(ev).errors.some(e => e.includes(param))).toBe(true);
    }
  });

  it.each(CORE_EVENT_TYPES)('%s: every X parameter is rejected', etype => {
    for (const [param, code] of Object.entries(EVENT_PARAMETER_RULES[etype])) {
      if (code !== 'X') continue;
      const ev = validEvent(etype);
      ev[param] = SAMPLE[param];
      expect(validateEvent(ev).errors.some(e => e.includes(`must not have field: ${param}`))).toBe(true);
    }
  });

  it.each(CORE_EVENT_TYPES)('%s: every SN parameter warns', etype => {
    for (const [param, code] of Object.entries(EVENT_PARAMETER_RULES[etype])) {
      if (code !== 'SN') continue;
      const ev = validEvent(etype);
      ev[param] = 0;
      const r = validateEvent(ev);
      expect(r.errors).toEqual([]);
      expect(r.warnings.some(w => w.includes(`should not have field: ${param}`))).toBe(true);
    }
  });

  it.each(CORE_EVENT_TYPES)('%s: optional parameters are accepted', etype => {
    for (const [param, code] of Object.entries(EVENT_PARAMETER_RULES[etype])) {
      if (code !== 'O') continue;
      const ev = validEvent(etype);
      ev[param] = param === 'contributors' ? null : 1;
      expect(validateEvent(ev)).toEqual({ errors: [], warnings: [] });
    }
  });

  it('matches the draft for the transfer types', () => {
    const r = EVENT_PARAMETER_RULES;
    expect(r['consultation-start'].target_session).toBe('X');
    expect(r['consultation-start'].consultation).toBe('M');
    expect(r['blind-transfer'].consultation).toBe('X');
    expect(r['blind-transfer'].target_session).toBe('M');
    expect(r['consultative-transfer'].consultation).toBe('M');
    expect(r['consultative-transfer'].target_session).toBe('M');
    expect(r['transfer-abandoned'].transfer_target).toBe('O');
    expect(r['transfer-abandoned'].consultation).toBe('O');
    expect(r['transfer-abandoned'].target_session).toBe('X');
    expect(r['channel-contributors'].sessions).toBe('X');
    expect(r['channel-contributors'].party).toBe('X');
    expect(r.keydown.button).toBe('M');
    expect(r.join.button).toBe('X');
  });

  it('wants a single session index for transfer types', () => {
    const ev = validEvent('blind-transfer');
    ev.sessions = [0];
    expect(validateEvent(ev).errors.some(e => /single session index/.test(e))).toBe(true);
  });

  it('accepts a bare integer or a list of sessions on party events', () => {
    for (const sessions of [0, [0, 1]]) {
      expect(validateEvent({ ...validEvent('join'), sessions }).errors).toEqual([]);
    }
  });

  it('requires a parseable time', () => {
    const ev = validEvent('join');
    ev.time = 'not a time';
    expect(validateEvent(ev).errors.some(e => /invalid 'time'/.test(e))).toBe(true);
    delete ev.time;
    expect(validateEvent(ev).errors.some(e => /missing required field: time/.test(e))).toBe(true);
  });

  it('checks an extension Event type for type and time only', () => {
    expect(validateEvent({ type: 'tool-call', time: T, tool_name: 'x' })).toEqual({ errors: [], warnings: [] });
  });

  it('requires channel-contributors to reference a recording Dialog', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'A' }));
    v.addSession({ start: T, parties: [0] });
    v.addDialog(new Dialog({ type: 'text', start: T, parties: [0], body: 'x', mediatype: 'text/plain', encoding: 'none' }), 0);
    v.addEvent(new Event({ type: 'channel-contributors', time: T, dialog: 0, channel: 0, contributors: 0 }));
    const { valid, errors } = v.isValid();
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes("must reference a 'recording' Dialog"))).toBe(true);
  });
});

describe('Event class', () => {
  it('round-trips a blind transfer', () => {
    const e = new Event({ type: 'blind-transfer', time: new Date(T), sessions: 0, party: 1, transferee: 0, transfer_target: 2, target_session: 1 });
    expect(e.toDict()).toEqual({
      type: 'blind-transfer', time: '2026-01-01T00:00:00.000Z', sessions: 0, party: 1,
      transferee: 0, transfer_target: 2, target_session: 1
    });
    expect(Event.fromDict(e.toDict()).toDict()).toEqual(e.toDict());
  });

  it('enforces the table in the constructor unless validate is false', () => {
    expect(() => new Event({ type: 'keydown', time: T, sessions: 0, party: 0 })).toThrow(/button/);
    expect(() => new Event({ type: 'join', time: T, sessions: 0, party: 0, button: '1' })).toThrow(/must not have field: button/);
    expect(new Event({ type: 'keydown', time: T, validate: false }).type).toBe('keydown');
  });

  it('keeps contributors null (a channel with no contributor)', () => {
    const e = new Event({ type: 'channel-contributors', time: T, dialog: 0, channel: 0, contributors: null });
    expect(e.toDict().contributors).toBeNull();
  });

  it('carries extension parameters', () => {
    const e = new Event({ type: 'tool-call', time: T, tool_name: 'search' });
    expect(e.toDict()).toEqual({ type: 'tool-call', time: T, tool_name: 'search' });
  });

  it('addEvent checks a plain object at isValid()', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'A' }));
    v.addSession({ start: T, parties: [0] });
    expect(v.addEvent({ type: 'join', time: T, sessions: 0, party: 0 })).toBe(0);
    expect(v.isValid().valid).toBe(true);
    v.addEvent({ type: 'keydown', time: T, sessions: 0, party: 0 });
    expect(v.isValid().errors.some(e => /missing required field: button/.test(e))).toBe(true);
  });

  it('an unlisted extension Event type needs some extension in extensions', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'A' }));
    v.addSession({ start: T, parties: [0] });
    v.addEvent({ type: 'tool-call', time: T, sessions: 0, party: 0 });
    expect(v.isValid().errors.some(e => /outside the core vocabulary/.test(e))).toBe(true);
    v.addExtension('agent_session');
    expect(v.isValid().valid).toBe(true);
  });

  it('converts a deprecated PartyHistory to an Event', () => {
    const spy = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      const e = new PartyHistory(1, 'keydown', T, '5').toEvent([0, 1]);
      expect(e.toDict()).toEqual({ type: 'keydown', time: T, sessions: [0, 1], party: 1, button: '5' });
    } finally {
      spy.mockRestore();
    }
  });
});
