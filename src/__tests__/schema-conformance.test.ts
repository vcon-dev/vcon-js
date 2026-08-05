import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import schema from './fixtures/vcon_json_schema.json';
import { Vcon } from '../vcon';
import { Party } from '../party';
import { Dialog } from '../dialog';

/**
 * Conformance: whatever the public API emits via toDict() MUST validate against
 * the authoritative vCon core JSON Schema (vendored in ./fixtures). This is the
 * guard that keeps the hand-rolled validators from silently drifting from the spec.
 */
let validate: ValidateFunction;

beforeAll(() => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  validate = ajv.compile(schema);
});

function expectConformant(vcon: Vcon): void {
  const ok = validate(vcon.toDict());
  if (!ok) {
    throw new Error(
      'vCon failed schema validation:\n' +
        (validate.errors || [])
          .map(e => `  ${e.instancePath || '(root)'} ${e.message}`)
          .join('\n')
    );
  }
  expect(ok).toBe(true);
}

const START = '2026-01-15T10:30:00Z';

describe('schema conformance of emitted vCons', () => {
  it('a minimal vCon validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567', name: 'Alice', role: 'customer' }));
    expectConformant(v);
  });

  it('a recording-set with member recordings validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    v.addDialog(new Dialog({ type: 'recording-set', start: START, recordings: [1, 2] }));
    v.addDialog(new Dialog({ type: 'recording', start: START, parties: [0], recording_set: 0,
      url: 'https://media.example.com/a.wav',
      content_hash: 'sha512-Tf9OoDQfCoI_FdP08BqxLq4OXaV5zLhR-NvZ3-hMWLLN7iZA50Dh7hctp5Om55Vg5ff5vQWKEqKAQz7W-kZRCg' }));
    expectConformant(v);
  });

  it('analysis keyed off an attachment (no dialog) validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ mailto: 'bob@example.com' }));
    v.addAttachment({ purpose: 'document', party: 0, dialog: 0, start: START, body: 'x', encoding: 'none' });
    v.addAnalysis({ type: 'summary', attachment: 0, vendor: 'acme', body: { ok: true } });
    expectConformant(v);
  });

  it('provenance on dialog and analysis validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    v.addDialog(new Dialog({ type: 'text', start: START, parties: [0], body: 'hi', encoding: 'none',
      provenance: { model: 'gpt-4', provider: 'openai' } }));
    v.addAnalysis({ type: 'summary', dialog: 0, vendor: 'acme', provenance: { model: 'gpt-4' } });
    expectConformant(v);
  });

  it('a transfer dialog validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    v.addParty(new Party({ tel: '+15559876543' }));
    v.addDialog(new Dialog({ type: 'transfer', start: START, transferor: 0, transferee: 1, transfer_target: [1] }));
    expectConformant(v);
  });

  it('a vCon carrying a tag validates', () => {
    const v = Vcon.buildNew();
    v.addParty(new Party({ tel: '+15551234567' }));
    v.addTag('department', 'sales');
    expectConformant(v);
  });
});
