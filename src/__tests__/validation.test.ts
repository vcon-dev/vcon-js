import { Dialog } from '../dialog';
import { Attachment } from '../attachment';
import { PartyHistory } from '../party';

/**
 * Covers the validate() error branches on Dialog and Attachment that the
 * happy-path suites don't exercise (the weakest coverage spot before this).
 */
describe('Dialog.validate error branches', () => {
  const start = '2026-01-15T10:30:00Z';

  it('rejects an invalid disposition', () => {
    const r = new Dialog({ type: 'incomplete', start, disposition: 'nope' }).validate();
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /Invalid disposition/.test(e))).toBe(true);
  });

  it('requires disposition on incomplete dialogs', () => {
    const r = new Dialog({ type: 'incomplete', start }).validate();
    expect(r.errors.some(e => /Disposition is required/.test(e))).toBe(true);
  });

  it('rejects external url without content_hash', () => {
    const r = new Dialog({ type: 'recording', start, parties: [0], url: 'https://x/a.wav' }).validate();
    expect(r.errors.some(e => /MUST include content_hash/.test(e))).toBe(true);
  });

  it('rejects a malformed content_hash', () => {
    const r = new Dialog({
      type: 'recording', start, parties: [0],
      url: 'https://x/a.wav', content_hash: 'sha256-deadbeef'
    }).validate();
    expect(r.errors.some(e => /Invalid content_hash format/.test(e))).toBe(true);
  });

  it('rejects both inline body and external url', () => {
    const r = new Dialog({ type: 'text', start, parties: [0], body: 'hi', url: 'https://x/a' }).validate();
    expect(r.errors.some(e => /both inline .* and external/.test(e))).toBe(true);
  });

  it('rejects content-bearing fields on a transfer dialog', () => {
    const r = new Dialog({ type: 'transfer', start, parties: [0, 1], transferor: 0 }).validate();
    expect(r.errors.some(e => /Transfer dialog MUST NOT include/.test(e))).toBe(true);
  });

  it('flags a party_history event missing its required button', () => {
    const d = new Dialog({ type: 'recording', start, parties: [0] });
    d.party_history = [new PartyHistory(0, 'keydown', start).toDict()];
    const r = d.validate();
    expect(r.errors.some(e => /button is required/.test(e))).toBe(true);
  });
});

describe('Attachment.validate error branches', () => {
  it('requires a purpose (non-lawful_basis)', () => {
    const r = new Attachment({ party: 0, dialog: 0 }).validate();
    expect(r.errors.some(e => /must have a purpose/.test(e))).toBe(true);
  });

  it('accepts the lawful_basis extension without purpose', () => {
    const r = new Attachment({ type: 'lawful_basis', party: 0, dialog: 0 } as any).validate();
    expect(r.valid).toBe(true);
  });

  it('rejects external url without content_hash', () => {
    const r = new Attachment({ purpose: 'transcript', party: 0, dialog: 0, url: 'https://x/t.txt' }).validate();
    expect(r.errors.some(e => /MUST include content_hash/.test(e))).toBe(true);
  });
});
