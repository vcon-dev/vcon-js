import { Vcon } from '../vcon';
import { Dialog } from '../dialog';
import { Party } from '../party';

/**
 * Round-trip coverage for the additions in the current core draft
 * (draft-ietf-vcon-vcon-core, past -02) and the provenance extension:
 *   - recording-set dialog type + recordings[] / recording_set
 *   - Analysis based on an attachment (dialog optional)
 *   - provenance parameter on dialog and analysis
 *   - Party type/org/dept fields
 */
describe('core-latest additions', () => {
  it('supports recording-set dialogs with recordings and recording_set', () => {
    const set = new Dialog({
      type: 'recording-set',
      start: '2026-01-15T10:30:00Z',
      recordings: [1, 2]
    });
    expect(set.isRecordingSet()).toBe(true);
    expect(Dialog.DIALOG_TYPES).toContain('recording-set');

    const member = new Dialog({
      type: 'recording',
      start: '2026-01-15T10:30:00Z',
      parties: [0, 1],
      recording_set: 0
    });

    const dict = set.toDict();
    expect(dict.type).toBe('recording-set');
    expect(dict.recordings).toEqual([1, 2]);
    expect(member.toDict().recording_set).toBe(0);
  });

  it('widens transfer index fields to accept arrays', () => {
    const d = new Dialog({
      type: 'transfer',
      start: '2026-01-15T10:30:00Z',
      original: [0, 1],
      target_dialog: 2
    });
    expect(d.toDict().original).toEqual([0, 1]);
    expect(d.toDict().target_dialog).toBe(2);
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
