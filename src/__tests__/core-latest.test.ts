import { Vcon } from '../vcon';
import { Dialog } from '../dialog';
import { Party } from '../party';

/**
 * Round-trip coverage for the additions in the current core draft
 * (draft-ietf-vcon-vcon-core, past -02) and the provenance extension:
 *   - (recording-set and transfer Dialogs are gone in core-05: Sessions and Events)
 *   - Analysis based on an attachment (dialog optional)
 *   - provenance parameter on dialog and analysis
 *   - Party type/org/dept fields
 */
describe('core-latest additions', () => {
  it('no longer has recording-set or transfer Dialog types', () => {
    expect(Dialog.DIALOG_TYPES).not.toContain('recording-set');
    expect(Dialog.DIALOG_TYPES).not.toContain('transfer');
    expect(() => new Dialog({ type: 'recording', start: '2026-01-15T10:30:00Z', recording_set: 0 })).toThrow(/removed/);
    expect(() => new Dialog({ type: 'recording-set', start: '2026-01-15T10:30:00Z', recordings: [1] })).toThrow(/removed/);
  });

  it('allows analysis keyed off an attachment with no dialog', () => {
    const vcon = Vcon.buildNew();
    vcon.addAnalysis({
      type: 'summary',
      attachment: 0,
      vendor: 'acme',
      body: { text: 'hi' }
    });
    const a = vcon.analysis[0];
    expect(a.attachment).toBe(0);
    expect(a.dialog).toBeUndefined();
    expect(a.encoding).toBe('json');
    expect(JSON.parse(a.body as string)).toEqual({ text: 'hi' });

    // survives a JSON round-trip
    const back = Vcon.buildFromJson(vcon.toJson());
    expect(back.analysis[0].attachment).toBe(0);
  });

  it('round-trips provenance on dialog and analysis', () => {
    const prov = { model: 'gpt-4', provider: 'openai', temperature: 0.2 };
    const vcon = Vcon.buildNew();
    vcon.addDialog(new Dialog({
      type: 'text',
      start: '2026-01-15T10:30:00Z',
      parties: [0],
      body: 'generated',
      encoding: 'none',
      provenance: prov
    }));
    vcon.addAnalysis({ type: 'summary', dialog: 0, vendor: 'acme', provenance: prov });

    const back = Vcon.buildFromJson(vcon.toJson());
    expect(back.dialog[0].provenance).toEqual(prov);
    expect(back.analysis[0].provenance).toEqual(prov);
  });

  it('carries party type/org/dept fields through toDict', () => {
    const p = new Party({ name: 'Agent', type: 'human', org: 'Acme', dept: 'Support' });
    const dict = p.toDict();
    expect(dict.type).toBe('human');
    expect(dict.org).toBe('Acme');
    expect(dict.dept).toBe('Support');
  });
});
