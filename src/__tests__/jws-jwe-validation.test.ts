import { Vcon } from '../vcon';
import { Party } from '../party';
import { encryptedForm, signedForm, signedPayload, validateVconDict } from '../validation';
import { decodeJsonPayload, lenientBase64UrlDecode } from '../util';

/**
 * Signed (JWS) and encrypted (JWE) vCons, as the reference library handles
 * them from vcon 1.0.5: kept as given on load and validated as containers.
 */

const T = '2026-01-15T10:30:00Z';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const PROT = b64({ alg: 'RS256', typ: 'JWS' });

function inner(): Record<string, any> {
  const v = Vcon.buildNew();
  v.addParty(new Party({ name: 'Alice' }));
  v.addSession({ start: T, parties: [0] });
  return JSON.parse(v.toJson());
}

const jws = (payload: unknown, signatures: unknown = [{ protected: PROT, signature: 'abc' }]) => ({ payload, signatures });

describe('container detection', () => {
  it('recognises JWS and JWE containers without a uuid', () => {
    expect(signedForm(jws('x'))).toBe(true);
    expect(signedForm({ uuid: 'u', payload: 'x', signatures: [] })).toBe(false);
    expect(encryptedForm({ ciphertext: 'c' })).toBe(true);
    expect(encryptedForm({ uuid: 'u', ciphertext: 'c' })).toBe(false);
    expect(signedPayload(jws(b64({ a: 1 })))).toEqual({ a: 1 });
  });
});

describe('loading', () => {
  it('keeps a JWS container exactly as given', () => {
    const c = jws(b64(inner()));
    const v = new Vcon(c);
    expect(v.data).toEqual(c);
    expect('uuid' in v.data).toBe(false);
    expect('created_at' in v.data).toBe(false);
  });

  it('keeps a JWE container exactly as given', () => {
    const c = { protected: 'eyJ', recipients: [{}], iv: 'a', ciphertext: 'b', tag: 'c' };
    expect(new Vcon(c).data).toEqual(c);
  });
});

describe('JWS validation', () => {
  it('validates the payload as a vCon', () => {
    const v = new Vcon(jws(b64(inner())));
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
    const bad = inner();
    delete bad.created_at;
    expect(new Vcon(jws(b64(bad))).isValid().errors).toEqual(['Missing required field: created_at']);
  });

  it('reports a payload that is not base64url JSON', () => {
    expect(new Vcon(jws('not*base64*json')).isValid().errors).toEqual([
      "Signed vCon: 'payload' is not a base64url-encoded JSON object."
    ]);
    expect(new Vcon(jws(b64([1]))).isValid().errors).toEqual([
      "Signed vCon: 'payload' is not a base64url-encoded JSON object."
    ]);
  });

  it('checks the signatures array', () => {
    const p = b64(inner());
    expect(new Vcon(jws(p, [])).isValid().errors).toEqual(["Signed vCon: 'signatures' must be a non-empty array."]);
    expect(new Vcon(jws(p, ['x'])).isValid().errors).toEqual(['Signed vCon: signatures[0] must be an object.']);
    expect(new Vcon(jws(p, [{ header: 'x', signature: 5 }])).isValid().errors).toEqual([
      "Signed vCon: signatures[0] is missing 'signature'.",
      "Signed vCon: signatures[0] needs 'protected' or 'header'."
    ]);
  });

  it('accepts a signature with only an unprotected header', () => {
    expect(new Vcon(jws(b64(inner()), [{ header: { alg: 'RS256' }, signature: 'abc' }])).isValid().valid).toBe(true);
  });

  it('runs the lawful basis check on the payload attachments', () => {
    const body = inner();
    body.extensions = ['lawful_basis'];
    body.attachments = [{
      purpose: 'lawful_basis', start: T, party: 0, session: 0, encoding: 'json', mediatype: 'application/json',
      body: { lawful_basis: 'consent', expiration: '2020-01-01T00:00:00Z', purpose_grants: [{ purpose: 'x' }] }
    }];
    const v = new Vcon(jws(b64(body)));
    expect(v.isValid().errors).toEqual([
      'Attachment at index 0 (lawful_basis): Purpose grant 0: Missing required field in purpose grant: granted, Missing required field in purpose grant: granted_at'
    ]);
    expect(v.getValidationWarnings()).toEqual(['Attachment at index 0 (lawful_basis): Lawful basis has expired']);
  });

  it('still validates a vCon signed in place (with uuid) as a vCon', () => {
    const v = new Vcon(inner());
    v.sign(Vcon.generateKeyPair().privateKey);
    expect(v.isValid().valid).toBe(true);
  });
});

describe('JWE validation', () => {
  it('only warns that the content cannot be checked', () => {
    const v = new Vcon({ protected: 'eyJ', recipients: [{}], iv: 'a', ciphertext: 'b', tag: 'c' });
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
    expect(v.getValidationWarnings()).toEqual(['Encrypted vCon: the content cannot be validated without decrypting it.']);
  });

  it('checks member types and recipients', () => {
    expect(validateVconDict({ protected: {}, iv: 1, ciphertext: null, tag: [], recipients: [] }).errors).toEqual([
      "Encrypted vCon: 'ciphertext' must be a base64url string.",
      "Encrypted vCon: 'iv' must be a base64url string.",
      "Encrypted vCon: 'tag' must be a base64url string.",
      "Encrypted vCon: 'recipients' must be a non-empty array.",
      "Encrypted vCon: 'protected' must be a base64url string."
    ]);
    expect(validateVconDict({ ciphertext: 'b', recipients: {} }).errors).toEqual([
      "Encrypted vCon: 'recipients' must be a non-empty array."
    ]);
  });

  it('does not look at attachments next to the ciphertext', () => {
    const v = new Vcon({ ciphertext: 'b', attachments: [{ purpose: 'lawful_basis', body: {} }] });
    expect(v.isValid().valid).toBe(true);
  });
});

describe('payload decoding follows Python base64.urlsafe_b64decode', () => {
  it('skips characters outside the alphabet and accepts both alphabets', () => {
    expect(decodeJsonPayload('!!' + b64({ a: 1 }) + ' \n')).toEqual({ a: 1 });
    expect(decodeJsonPayload(Buffer.from('{"a":"?>"}').toString('base64'))).toEqual({ a: '?>' });
  });

  it('rejects a dangling quantum, non-ASCII input and non-UTF-8 bytes', () => {
    expect(lenientBase64UrlDecode('AAAAA')).toBeUndefined();
    expect(decodeJsonPayload(b64({ a: 1 }) + 'é')).toBeUndefined();
    expect(decodeJsonPayload(Buffer.from([0xff, 0xfa, 0x7b, 0x7d]).toString('base64url'))).toBeUndefined();
    expect(decodeJsonPayload(5)).toBeUndefined();
  });
});
