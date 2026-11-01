import fs from 'fs';
import path from 'path';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './fixtures/appendix-c-json-schema.json';
import { Vcon } from '../vcon';
import { Party } from '../party';
import { Dialog } from '../dialog';
import { Session } from '../session';
import { Event } from '../event';

/**
 * Conformance: the Appendix B examples of core-05 load and pass isValid(), and
 * whatever the public API emits via toDict() MUST validate against the Appendix
 * C JSON Schema of core-05 (vendored in ./fixtures). This is the guard that
 * keeps the hand-rolled validators from silently drifting from the spec.
 */
let validate: ValidateFunction;

beforeAll(() => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  validate = ajv.compile(schema);
});

function expectSchemaValid(data: unknown, what = 'vCon'): void {
  const ok = validate(data);
  if (!ok) {
    throw new Error(
      `${what} failed schema validation:\n` +
        (validate.errors || []).map(e => `  ${e.instancePath || '(root)'} ${e.message}`).join('\n')
    );
  }
  expect(ok).toBe(true);
}

function expectConformant(vcon: Vcon): void {
  expectSchemaValid(vcon.toDict());
  expect(vcon.isValid()).toEqual({ valid: true, errors: [] });
}

const EXAMPLES_DIR = path.join(__dirname, 'fixtures', 'examples');
const examples = fs.readdirSync(EXAMPLES_DIR).filter(f => /^B\d-.*\.json$/.test(f)).sort();
const UNSIGNED = examples.filter(f => ['B1', 'B2', 'B3', 'B4', 'B5', 'B8', 'B9'].includes(f.slice(0, 2)));
const readExample = (prefix: string): any =>
  JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, examples.find(f => f.startsWith(prefix))!), 'utf8'));

describe('Appendix B examples of core-05', () => {
  it('has all nine examples', () => {
    expect(examples.map(f => f.slice(0, 2))).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9']);
  });

  it.each(UNSIGNED)('%s validates against the Appendix C schema', file => {
    expectSchemaValid(JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8')), file);
  });

  it.each(UNSIGNED)('%s loads untouched and passes isValid()', file => {
    const data = JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8'));
    const vcon = Vcon.buildFromJson(JSON.stringify(data));
    expect(vcon.migrationReport).toBeUndefined(); // already 0.5.0
    expect(vcon.vcon).toBe('0.5.0');
    expect(vcon.isValid()).toEqual({ valid: true, errors: [] });
    expect(vcon.sessions).toEqual(data.sessions);
    expect(vcon.dialog).toEqual(data.dialog);
    expect(vcon.toDict().events).toEqual(data.events);
  });

  it('B6 payload loads and validates', () => {
    const envelope = readExample('B6');
    const protectedHeader = JSON.parse(Buffer.from(envelope.signatures[0].protected, 'base64url').toString());
    expect(protectedHeader).toEqual({ alg: 'RS256' });
    const payload = JSON.parse(Buffer.from(envelope.payload, 'base64url').toString());
    expectSchemaValid(payload, 'B6 payload');
    expect(new Vcon(payload).isValid().valid).toBe(true);
  });

  it('B7 is a JWE, not a vCon', () => {
    const envelope = readExample('B7');
    for (const key of ['protected', 'iv', 'ciphertext', 'tag', 'recipients', 'unprotected']) {
      expect(envelope).toHaveProperty(key);
    }
    expect(JSON.parse(Buffer.from(envelope.protected, 'base64url').toString()).alg).toBe('RSA-OAEP');
  });

  it('B1 events use bare integer sessions and no dialog', () => {
    const vcon = new Vcon(readExample('B1'));
    expect(vcon.events.map(e => e.type)).toEqual(['join', 'join', 'drop', 'drop']);
    expect(vcon.events.every(e => e.sessions === 0 && !('dialog' in e))).toBe(true);
  });

  it('B8 and B9 use the renamed parameters', () => {
    expect(new Vcon(readExample('B8')).redacted_from?.uuid).toBeTruthy();
    expect(new Vcon(readExample('B9')).amended_from?.uuid).toBeTruthy();
  });
});

describe('schema conformance of emitted vCons', () => {
  const START = '2026-01-15T10:30:00Z';
  const HASH = 'sha512-Tf9OoDQfCoI_FdP08BqxLq4OXaV5zLhR-NvZ3-hMWLLN7iZA50Dh7hctp5Om55Vg5ff5vQWKEqKAQz7W-kZRCg';

  it('an empty buildNew() validates', () => {
    expectConformant(Vcon.buildNew());
  });

  it('a minimal vCon validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567', name: 'Alice', role: 'customer' }));
    expectConformant(v);
  });

  it('a recording in a Session validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    v.addParty(new Party({ tel: '+15559876543' }));
    const s = v.addSession(new Session({ start: START, duration: 60, parties: [0, 1] }));
    v.addDialog(
      new Dialog({ type: 'recording', start: START, parties: [0, 1], mediatype: 'audio/wav', url: 'https://media.example.com/a.wav', content_hash: HASH }),
      s
    );
    expectConformant(v);
  });

  it('analysis keyed off an attachment (no dialog) validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ mailto: 'bob@example.com' }));
    v.addSession({ parties: [0] });
    v.addAttachment({ purpose: 'document', party: 0, start: START, body: 'x', encoding: 'none', mediatype: 'text/plain' });
    v.addAnalysis({ type: 'summary', attachment: 0, vendor: 'acme', body: { ok: true } });
    expectConformant(v);
  });

  it('provenance on dialog and analysis validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    const s = v.addSession({ start: START, parties: [0] });
    v.addDialog(
      new Dialog({ type: 'text', start: START, parties: [0], body: 'hi', encoding: 'none', mediatype: 'text/plain', provenance: { model: 'gpt-4', provider: 'openai' } }),
      s
    );
    v.addAnalysis({ type: 'summary', dialog: 0, vendor: 'acme', provenance: { model: 'gpt-4' } });
    expectConformant(v);
  });

  it('a vCon carrying a tag validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    v.addTag('department', 'sales');
    expectConformant(v);
  });

  it('a vCon with every object kind validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ name: 'Alice', tel: '+12025550101' }));
    v.addParty(new Party({ name: 'Bob', tel: '+12025550102' }));
    v.addParty(new Party({ name: 'Carol', tel: '+12025550103' }));
    v.addSession(new Session({ start: '2026-01-01T00:00:00Z', duration: 60, parties: [0, 1] }));
    const s1 = v.addSession(new Session({ start: '2026-01-01T00:00:10Z', duration: 30, parties: [1, 2] }));
    const s2 = v.addSession(new Session({ start: '2026-01-01T00:00:45Z', parties: [0, 2] }));
    v.data.sessions![0].sessions = [{ session: 1, type: 'child', description: 'consult' }];
    v.addDialog(
      new Dialog({ type: 'recording', start: '2026-01-01T00:00:00Z', duration: 60, parties: [[0], [1]], mediatype: 'audio/wav', url: 'https://example.com/a.wav', content_hash: HASH }),
      0
    );
    v.addDialog(new Dialog({ type: 'text', start: '2026-01-01T00:00:10Z', parties: [1], body: 'hello', mediatype: 'text/plain', encoding: 'none' }), 1);
    v.addIncompleteDialog({ start: '2026-01-01T00:00:45Z', disposition: 'busy', parties: [0], session: 2 });
    v.addDialog(Dialog.placeholder());
    const T = '2026-01-01T00:00:00Z';
    for (const e of [
      new Event({ type: 'join', time: T, sessions: 0, party: 0 }),
      new Event({ type: 'keydown', time: T, sessions: [0, 1], party: 1, button: '#' }),
      new Event({ type: 'consultation-start', time: T, sessions: 0, party: 1, transferee: 0, transfer_target: 2, consultation: 1 }),
      new Event({ type: 'consultative-transfer', time: T, sessions: 0, party: 1, transferee: 0, transfer_target: 2, consultation: 1, target_session: 2 }),
      new Event({ type: 'blind-transfer', time: T, sessions: 0, party: 1, transferee: 0, transfer_target: 2, target_session: 2 }),
      new Event({ type: 'transfer-abandoned', time: T, sessions: 0, party: 1, transferee: 0 }),
      new Event({ type: 'channel-contributors', time: T, dialog: 0, channel: 1, contributors: [1, 2] }),
      new Event({ type: 'channel-contributors', time: T, dialog: 0, channel: 0, contributors: null })
    ]) {
      v.addEvent(e);
    }
    v.addTag('k', 'v');
    v.addAttachment({ purpose: 'note', party: 0, session: [0, 1, 2], body: 'n', encoding: 'none', mediatype: 'text/plain' });
    v.addAnalysis({ type: 'summary', vendor: 'v', body: 's', dialog: 0, sessions: [0], attachment: 0 });
    const out = v.toDict();
    expectSchemaValid(out);
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
    expect(out.vcon).toBe('0.5.0');
    expect(out.dialog![3]).toEqual({});
    expect([s1, s2]).toEqual([1, 2]);
  });
});
