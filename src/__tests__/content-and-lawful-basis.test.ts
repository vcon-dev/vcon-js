import { Vcon } from '../vcon';
import { Party } from '../party';
import { contentHashProblems } from '../validation';
import { validateLawfulBasisAttachment } from '../lawful-basis';
import { parsePyIsoformat, pyRepr } from '../util';

/**
 * Rules added to the reference library in vcon 1.0.4: content_hash form,
 * url without content_hash (allowed from vcon 1.0.6), serialized JSON bodies, created_at kept as
 * written, and the lawful basis body validator run by isValid().
 */

const T = '2026-01-15T10:30:00Z';
const H512 = 'sha512-' + 'A'.repeat(86);
const H256 = 'sha256-' + 'B'.repeat(43);

function withSession(): Vcon {
  const v = Vcon.buildNew();
  v.addParty(new Party({ name: 'Alice' }));
  v.addSession({ start: T, parties: [0] });
  return v;
}

const recording = (extra: Record<string, any>) => ({
  type: 'recording', start: T, parties: [0], mediatype: 'audio/wav', ...extra
});

describe('contentHashProblems', () => {
  it('accepts well formed tokens and lists of them', () => {
    expect(contentHashProblems(H512)).toEqual([]);
    expect(contentHashProblems([H512, H256])).toEqual([]);
    expect(contentHashProblems('blake3-abc')).toEqual([]);
  });

  it('reports each problem in the reference library wording', () => {
    expect(contentHashProblems([])).toEqual(['must not be an empty array']);
    expect(contentHashProblems(5)).toEqual(['5 is not a string']);
    expect(contentHashProblems([null, true])).toEqual(['None is not a string', 'True is not a string']);
    expect(contentHashProblems('md5:abc')).toEqual(["'md5:abc' is not of the form '<algorithm>-<base64url digest>'"]);
    expect(contentHashProblems('sha256-x')).toEqual([
      "'sha256-x' has a sha256 digest of 1 base64url characters, expected 43"
    ]);
    expect(contentHashProblems(H512 + '\n')[0]).toMatch(/is not of the form/);
  });
});

describe('content checks in isValid() and getValidationWarnings()', () => {
  it('rejects a malformed content_hash on a Dialog', () => {
    const v = withSession();
    v.data.dialog = [recording({ url: 'https://x/a.wav', content_hash: 'sha512-abc' })];
    v.data.sessions![0].dialog = [0];
    expect(v.isValid().errors).toEqual([
      "Dialog at index 0 has an invalid content_hash: 'sha512-abc' has a sha512 digest of 3 base64url characters, expected 86."
    ]);
    v.data.dialog[0].content_hash = H512;
    expect(v.isValid().valid).toBe(true);
  });

  it('allows a Dialog url without content_hash, with no warning', () => {
    const v = withSession();
    v.data.dialog = [recording({ url: 'https://x/a.wav' })];
    v.data.sessions![0].dialog = [0];
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
    expect(v.getValidationWarnings().some(w => /content_hash/.test(w))).toBe(false);
  });

  it('allows an Attachment or Analysis url without content_hash', () => {
    const v = withSession();
    v.data.attachments = [{ purpose: 'doc', start: T, party: 0, session: 0, url: 'https://x' }];
    v.data.analysis = [{ type: 'summary', vendor: 'v', sessions: 0, url: 'https://x' }];
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
    expect(v.getValidationWarnings()).toEqual([]);
  });

  it('requires body+encoding or url on an Attachment', () => {
    const v = withSession();
    v.data.attachments = [{ purpose: 'doc', start: T, party: 0, session: 0, content_hash: H512 }];
    expect(v.isValid().errors).toEqual(['Attachment at index 0 must include body+encoding or url.']);
  });

  it('still requires content_hash with a url on redacted_from and amended_from', () => {
    const v = withSession();
    v.data.redacted_from = { type: 'pii', url: 'https://x' };
    expect(v.isValid().errors).toEqual(['redacted_from with url must include content_hash.']);
    delete v.data.redacted_from;
    v.data.amended_from = { url: 'https://x' };
    expect(v.isValid().errors).toEqual(['amended_from with url must include content_hash.']);
    expect(v.getValidationWarnings().some(w => /content_hash/.test(w))).toBe(false);
  });

  it('does not check an incomplete Dialog', () => {
    const v = withSession();
    v.data.dialog = [{ type: 'incomplete', start: T, parties: [0], disposition: 'busy' }];
    v.data.sessions![0].dialog = [0];
    expect(v.getValidationWarnings().some(w => /content_hash|serialized/.test(w))).toBe(false);
  });

  it('checks Attachment content_hash, and allows a url next to inline content', () => {
    const v = withSession();
    v.data.attachments = [
      { purpose: 'doc', start: T, party: 0, session: 0, url: 'https://x', content_hash: ['sha256-short'] },
      { purpose: 'doc', start: T, party: 0, session: 0, url: 'https://x', body: 'a', encoding: 'none', mediatype: 'text/plain' }
    ];
    expect(v.isValid().errors).toEqual([
      "Attachment at index 0 has an invalid content_hash: 'sha256-short' has a sha256 digest of 5 base64url characters, expected 43."
    ]);
    expect(v.getValidationWarnings()).toEqual([]);
  });

  it('checks Analysis content and warns about a serialized JSON body', () => {
    const v = withSession();
    v.data.analysis = [
      { type: 'summary', vendor: 'v', sessions: 0, encoding: 'json', body: ' {"a": 1} ' },
      { type: 'summary', vendor: 'v', sessions: 0, encoding: 'json', body: '{not json' },
      { type: 'summary', vendor: 'v', sessions: 0, url: 'https://x', content_hash: [] }
    ];
    expect(v.isValid().errors).toEqual([
      'Analysis at index 2 has an invalid content_hash: must not be an empty array.'
    ]);
    expect(v.getValidationWarnings()).toEqual([
      "Analysis at index 0 has encoding 'json' and a body that is a serialized JSON string; the body should be the JSON value itself (section 2.3.2)."
    ]);
  });

  it('checks the content_hash of redacted_from and amended_from (url is checked elsewhere)', () => {
    const v = withSession();
    v.data.redacted_from = { type: 'pii', url: 'https://x', content_hash: 'nope' };
    expect(v.isValid().errors).toEqual([
      "redacted_from has an invalid content_hash: 'nope' is not of the form '<algorithm>-<base64url digest>'."
    ]);
    delete v.data.redacted_from;
    v.data.amended_from = { uuid: 'u', content_hash: 7 as any };
    expect(v.isValid().errors).toEqual(['amended_from has an invalid content_hash: 7 is not a string.']);
  });
});

describe('created_at', () => {
  it('is kept exactly as written on load', () => {
    const v = new Vcon({ uuid: 'u', created_at: '2026-01-15T10:30:00.5Z' });
    expect(v.created_at).toBe('2026-01-15T10:30:00.5Z');
    expect(new Vcon({ uuid: 'u', created_at: '{{now}}' }).created_at).toBe('{{now}}');
  });

  it('defaults to now when missing or empty', () => {
    expect(new Vcon({ uuid: 'u', created_at: '' }).created_at).not.toBe('');
  });

  it('reports an unparseable value with the reason the reference library gives', () => {
    const errors = (c: unknown) => new Vcon({ uuid: 'u', created_at: c as string }).isValid().errors;
    expect(errors('{{now}}')).toEqual([
      'Invalid created_at format. Must be an ISO 8601 datetime string: Unknown string format: {{now}}'
    ]);
    expect(errors('2024-13-01T00:00:00Z')).toEqual([
      'Invalid created_at format. Must be an ISO 8601 datetime string: month must be in 1..12: 2024-13-01T00:00:00Z'
    ]);
    expect(errors(5)).toEqual([
      'Invalid created_at format. Must be an ISO 8601 datetime string: Parser must be a string or character stream, not int'
    ]);
  });
});

describe('lawful basis attachments in isValid()', () => {
  const grant = { purpose: 'recording', granted: true, granted_at: T };
  const goodBody = { lawful_basis: 'consent', expiration: '2099-01-01T00:00:00Z', purpose_grants: [grant] };

  function withBasis(body: unknown, extra: Record<string, any> = {}): Vcon {
    const v = withSession();
    v.data.extensions = ['lawful_basis'];
    v.data.attachments = [{
      purpose: 'lawful_basis', start: T, party: 0, session: 0, encoding: 'json', mediatype: 'application/json', body, ...extra
    }];
    return v;
  }

  it('accepts a complete body', () => {
    const v = withBasis(goodBody);
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
    expect(v.getValidationWarnings()).toEqual([]);
  });

  it('prefixes errors with the attachment index', () => {
    const v = withBasis({});
    expect(v.isValid().errors).toEqual([
      'Attachment at index 0 (lawful_basis): Missing required field: lawful_basis',
      'Attachment at index 0 (lawful_basis): Missing required field: expiration',
      'Attachment at index 0 (lawful_basis): Missing required field: purpose_grants'
    ]);
  });

  it('checks purpose grants', () => {
    const v = withBasis({
      ...goodBody,
      purpose_grants: [{ purpose: 'x', granted: 'yes', granted_at: 'soon', conditions: [1] }, { purpose: 'y' }]
    });
    expect(v.isValid().errors).toEqual([
      'Attachment at index 0 (lawful_basis): Purpose grant 0: granted field must be a boolean, Invalid granted_at timestamp format, All conditions must be strings',
      'Attachment at index 0 (lawful_basis): Purpose grant 1: Missing required field in purpose grant: granted, Missing required field in purpose grant: granted_at'
    ]);
  });

  it('warns about an expired basis and unknown proof types, algorithms and canonicalization', () => {
    const v = withBasis({
      ...goodBody,
      expiration: '2020-01-01T00:00:00Z',
      content_hash: { algorithm: 'sha-512', canonicalization: 'c14n', value: 'abc123' },
      proof_mechanisms: [{ proof_type: 'magic', timestamp: T, proof_data: {} }],
      registry: { type: 'other', url: 'https://r' }
    });
    expect(v.isValid().valid).toBe(true);
    expect(v.getValidationWarnings()).toEqual([
      'Attachment at index 0 (lawful_basis): Lawful basis has expired',
      "Attachment at index 0 (lawful_basis): Content hash: Hash algorithm 'sha-512' is not one this library can verify",
      "Attachment at index 0 (lawful_basis): Content hash: Canonicalization method 'c14n' is not one this library can apply",
      "Attachment at index 0 (lawful_basis): Proof mechanism 0: Proof type 'magic' is not one of the types the draft defines"
    ]);
  });

  it('reports content hash, proof and registry errors', () => {
    const v = withBasis({
      ...goodBody,
      lawful_basis: 'whim',
      content_hash: { algorithm: 'sha-256', value: 'xyz' },
      proof_mechanisms: [{ proof_type: 'signed_document', timestamp: 'bad', proof_data: 'x' }, {}],
      registry: { type: 'scitt', url: 'ftp://r' }
    });
    expect(v.isValid().errors).toEqual([
      'Attachment at index 0 (lawful_basis): Unsupported lawful basis: whim',
      'Attachment at index 0 (lawful_basis): Content hash validation failed: Missing required field in content_hash: canonicalization, Hash value must be a hexadecimal string',
      'Attachment at index 0 (lawful_basis): Proof mechanism 0: Invalid timestamp format in proof mechanism, proof_data must be a dictionary',
      'Attachment at index 0 (lawful_basis): Proof mechanism 1: Missing required field in proof mechanism: proof_type, Missing required field in proof mechanism: timestamp, Missing required field in proof mechanism: proof_data',
      'Attachment at index 0 (lawful_basis): Registry validation failed: Registry URL must be a valid HTTP/HTTPS URL'
    ]);
  });

  it('decodes a JSON string body and rejects a body that is not an object', () => {
    expect(withBasis(JSON.stringify(goodBody)).isValid().valid).toBe(true);
    expect(withBasis([1]).isValid().errors).toEqual([
      'Attachment at index 0 (lawful_basis): Lawful basis attachment body must be a dictionary'
    ]);
    expect(withBasis(goodBody, { encoding: 'none' }).isValid().errors).toEqual([
      "Attachment at index 0 (lawful_basis): Lawful basis attachment must use 'json' encoding"
    ]);
  });

  it('skips a lawful_basis attachment whose body was redacted', () => {
    const v = withBasis(goodBody);
    delete v.data.attachments![0].body;
    v.data.redacted_from = { type: 'pii' };
    expect(v.isValid().valid).toBe(true);
  });

  it('reports scope warnings on the bare attachment but not through the vCon', () => {
    const bare = validateLawfulBasisAttachment({ purpose: 'lawful_basis', encoding: 'json', body: goodBody });
    expect(bare.warnings).toEqual([
      'Lawful basis attachment has no party (core-05 requires it)',
      'Lawful basis attachment has no session; core-05 scopes a basis to Sessions and an attachment needs dialog or session'
    ]);
  });
});

describe('Python-compatible helpers', () => {
  it('parsePyIsoformat follows datetime.fromisoformat', () => {
    for (const ok of ['2024-01-01', '20240101', '2024-W01-1', '2024-01-01T10', '2024-01-01T1030', '2024-01-01x10:30',
      '2024-01-01T10:30:00,5', '2024-01-01T10:30:00+05', '2024-01-01T10:30:00+05:30:15.5', '2020-W53-1']) {
      expect(parsePyIsoformat(ok)).toBeDefined();
    }
    for (const bad of ['2024-01-01T10:3', '2024-01-01T24:00:00', '2024-01-01T10:3000', '2024-01-01T10:30:00.',
      '2021-W53-1', ' 2024-01-01', '2024-1-01', '2024-01-01T10:30:00+24:00', '0000-01-01', '2024-01-01T10:30:00z']) {
      expect(parsePyIsoformat(bad)).toBeUndefined();
    }
    expect(parsePyIsoformat('2024-01-01T10:00:00+01:00')).toEqual({ micros: Date.UTC(2024, 0, 1, 9) * 1000, aware: true });
    expect(parsePyIsoformat('2024-01-01')!.aware).toBe(false);
  });

  it('pyRepr matches Python repr', () => {
    expect(pyRepr("it's")).toBe('"it\'s"');
    expect(pyRepr({ a: [1, null, false] })).toBe("{'a': [1, None, False]}");
    expect(pyRepr('a\nb')).toBe("'a\\nb'");
  });
});
