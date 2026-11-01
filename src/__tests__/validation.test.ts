import { Vcon } from '../vcon';
import { Dialog } from '../dialog';
import { Attachment } from '../attachment';

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

  it('rejects an unknown dialog type such as the removed transfer type', () => {
    const r = new Dialog({ type: 'transfer', start, parties: [0, 1] }).validate();
    expect(r.errors.some(e => /Invalid dialog type: transfer/.test(e))).toBe(true);
  });

  it('rejects a mediatype outside the known set', () => {
    const r = new Dialog({ type: 'recording', start, parties: [0], mediatype: 'application/pdf' }).validate();
    expect(r.errors.some(e => /Invalid mediatype/.test(e))).toBe(true);
  });
});

describe('Attachment.validate error branches', () => {
  it('requires a purpose', () => {
    const r = new Attachment({ party: 0, dialog: 0 }).validate();
    expect(r.errors.some(e => /must have a purpose/.test(e))).toBe(true);
  });

  it('rejects external url without content_hash', () => {
    const r = new Attachment({ purpose: 'transcript', party: 0, dialog: 0, url: 'https://x/t.txt' }).validate();
    expect(r.errors.some(e => /MUST include content_hash/.test(e))).toBe(true);
  });

  it('throws on an invalid encoding at construction', () => {
    expect(() => new Attachment({ purpose: 'x', encoding: 'base64' as any })).toThrow(/Invalid encoding/);
  });
});

describe('Vcon guards', () => {
  it('throws parsing invalid JSON', () => {
    expect(() => Vcon.buildFromJson('{not json')).toThrow(/Failed to parse vCon JSON/);
  });

  it('throws when setting redacted_from while amended_from is set', () => {
    const v = Vcon.buildNew();
    v.amended_from = { uuid: '550e8400-e29b-41d4-a716-446655440000' };
    expect(() => { v.redacted_from = { type: 'pii' }; }).toThrow(/mutually exclusive/);
  });

  it('throws when setting amended_from while redacted_from is set', () => {
    const v = Vcon.buildNew();
    v.redacted_from = { type: 'pii' };
    expect(() => { v.amended_from = { uuid: '550e8400-e29b-41d4-a716-446655440000' }; }).toThrow(/mutually exclusive/);
  });
});

describe('parseDateTime', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { parseDateTime, parseDateTimeMicros } = require('../util');
  it('rejects out-of-range fields instead of rolling them over', () => {
    for (const v of ['2022-02-30T00:00:00Z', '2021-02-29T00:00:00Z', '2022-01-01T24:00:00Z', '2022-01-01T00:60:00Z', '2022-01-01T00:00:00+24:00']) {
      expect(parseDateTime(v)).toBeUndefined();
    }
    expect(parseDateTime('2024-02-29T00:00:00Z')).toBe(Date.parse('2024-02-29T00:00:00Z'));
  });
  it('keeps microseconds and applies offsets', () => {
    expect(parseDateTimeMicros('2022-01-01T05:00:00.1234567+05:00')).toBe(Date.parse('2022-01-01T00:00:00Z') * 1000 + 123456);
    expect(parseDateTimeMicros('2022-01-01T00:00:00')).toBe(Date.parse('2022-01-01T00:00:00Z') * 1000);
  });
});
