import * as crypto from 'crypto';
import { Vcon, AlgorithmNotPermittedError } from '../vcon';
import { Dialog } from '../dialog';
import { Party } from '../party';

const T = '2026-01-01T00:00:00Z';

function base(): Vcon {
  const v = Vcon.buildNew();
  v.addParty(new Party({ name: 'Alice', tel: '+12025550101' }));
  v.addParty(new Party({ name: 'Bob', tel: '+12025550102' }));
  return v;
}

function withSession(): Vcon {
  const v = base();
  v.addSession({ start: T, parties: [0, 1] });
  return v;
}

const att = (extra: Record<string, any> = {}) => ({
  purpose: 'note', start: T, party: 0, body: 'x', encoding: 'none', mediatype: 'text/plain', ...extra
});

describe('redacted_from and amended_from', () => {
  it('are mutually exclusive in the validator', () => {
    const v = base();
    v.data.redacted_from = { type: 'pii' };
    v.data.amended_from = { uuid: 'u' };
    expect(v.isValid().errors).toContain('redacted_from and amended_from are mutually exclusive.');
  });

  it('needs a content_hash with a url', () => {
    const v = base();
    v.redacted_from = { type: 'pii', url: 'https://example.com/o.json' };
    expect(v.isValid().errors).toContain('redacted_from with url must include content_hash.');
    v.redacted_from = undefined;
    v.amended_from = { url: 'https://example.com/o.json' };
    expect(v.isValid().errors).toContain('amended_from with url must include content_hash.');
  });

  it('needs a uuid or url for amended_from, and a type for redacted_from', () => {
    const v = base();
    v.amended_from = {};
    expect(v.isValid().errors).toContain('amended_from must include uuid, or an external reference (url).');
    v.amended_from = undefined;
    v.redacted_from = {};
    expect(v.isValid().errors).toContain('redacted_from is missing required field: type');
  });

  it('flags the 0.4.0 names when migration is off', () => {
    const v = new Vcon({ vcon: '0.4.0', uuid: 'u', created_at: T, redacted: { type: 'pii' }, parties: [] }, { migrateLegacy: false });
    expect(v.isValid().errors.some(e => /Legacy 0.4.0 parameter 'redacted'/.test(e))).toBe(true);
  });
});

describe('attachment scope', () => {
  it('needs party plus dialog or session', () => {
    const v = withSession();
    v.addDialog(new Dialog({ type: 'text', start: T, parties: [0], body: 'x', mediatype: 'text/plain', encoding: 'none' }), 0);
    v.data.attachments = [att()];
    expect(v.isValid().errors).toContain('Attachment at index 0 must have at least one of dialog or session.');
    v.data.attachments = [att({ session: 0 })];
    expect(v.isValid().valid).toBe(true);
    v.data.attachments = [att({ dialog: 0 })];
    expect(v.isValid().valid).toBe(true);
    v.data.attachments = [att({ dialog: 0, session: [0] })];
    expect(v.isValid().valid).toBe(true);
    const { party: _party, ...noParty } = att({ session: 0 });
    v.data.attachments = [noParty];
    expect(v.isValid().errors).toContain('Attachment at index 0 is missing required field: party');
  });

  it('reports bad references', () => {
    const v = withSession();
    v.data.attachments = [att({ session: [0, 4], dialog: 9, party: 7 })];
    const errors = v.isValid().errors;
    expect(errors).toContain('Attachment at index 0 references invalid session index: 4');
    expect(errors).toContain('Attachment at index 0 references invalid dialog index: 9');
    expect(errors).toContain('Attachment at index 0 references invalid party index: 7');
  });

  it('defaults the scope to the only Session', () => {
    const v = withSession();
    v.addAttachment({ purpose: 'note', body: 'x', encoding: 'none', mediatype: 'text/plain' });
    expect(v.attachments[0].session).toBe(0);
    expect(v.attachments[0].dialog).toBeUndefined();
    expect(v.attachments[0].start).toBe(v.created_at);
    expect(v.isValid().valid).toBe(true);
  });

  it('has no default scope with several Sessions or none, and invents no placeholder Session', () => {
    const v = withSession();
    v.addSession({ start: T, parties: [0] });
    expect(() => v.addAttachment({ purpose: 'note', body: 'x', encoding: 'none' })).toThrow(/needs dialog or session/);
    const none = base();
    expect(() => none.addAttachment({ purpose: 'note', body: 'x', encoding: 'none' })).toThrow(/needs dialog or session/);
    expect(none.sessions).toEqual([]);
  });

  it('never widens a dialog index to a Session', () => {
    const v = withSession();
    v.addAttachment({ purpose: 'note', dialog: 0, body: 'x', encoding: 'none', mediatype: 'text/plain' });
    expect(v.attachments[0].dialog).toBe(0);
    expect('session' in v.attachments[0]).toBe(false);
  });

  it('lets tags describe the whole vCon', () => {
    const v = withSession();
    v.addSession({ start: T, parties: [1] });
    v.addTag('k', 'v');
    expect(v.attachments[0].session).toEqual([0, 1]);
    expect(v.isValid().valid).toBe(true);
  });

  it('lets a redacted attachment lack content', () => {
    const v = withSession();
    v.data.redacted_from = { type: 'pii' };
    v.data.attachments = [{ purpose: 'note', start: T, party: 0, session: 0 }];
    expect(v.isValid().valid).toBe(true);
  });
});

describe('analysis references', () => {
  it('needs no dialog and checks the new references', () => {
    const v = withSession();
    v.addAnalysis({ type: 'summary', vendor: 'v', body: 's', sessions: 0 });
    expect(v.isValid().valid).toBe(true);
    v.addAnalysis({ type: 'x', vendor: 'v', body: 's', sessions: 3, attachment: 2, analysis: 1 });
    const errors = v.isValid().errors;
    expect(errors).toContain('Analysis at index 1 references invalid session index: 3');
    expect(errors).toContain('Analysis at index 1 references invalid attachment index: 2');
    expect(errors).toContain('Analysis at index 1 must not reference itself in analysis.');
  });
});

describe('Dialog rules', () => {
  it('keeps indices with an empty Dialog and accepts nulls and lists in parties', () => {
    const v = withSession();
    v.addDialog(Dialog.placeholder());
    v.addDialog(new Dialog({ type: 'recording', start: T, parties: [null, [0, 1]], mediatype: 'audio/wav' }), 0);
    expect(v.dialog[0]).toEqual({});
    expect(v.sessions[0].dialog).toEqual([1]);
    expect(v.isValid()).toEqual({ valid: true, errors: [] });
  });

  it('gives an incomplete Dialog no content', () => {
    const v = withSession();
    const i = v.addIncompleteDialog({ start: T, disposition: 'no-answer', details: { ring: 45 }, parties: [0], session: 0 });
    expect(v.dialog[i]).toEqual({ type: 'incomplete', start: T, parties: [0], disposition: 'no-answer', meta: { details: { ring: 45 } } });
    expect('body' in v.dialog[i]).toBe(false);
    expect(v.isValid().valid).toBe(true);
  });

  it('fails validation on removed types and parameters', () => {
    const v = withSession();
    v.data.dialog = [{ type: 'transfer', start: T }, { type: 'recording', start: T, originator: 0, mediatype: 'audio/wav' }];
    const errors = v.isValid().errors;
    expect(errors.some(e => /type 'transfer', which was removed in 0.5.0/.test(e))).toBe(true);
    expect(errors).toContain("Dialog at index 1 has parameter 'originator', which was removed in 0.5.0.");
  });

  it('accepts mediatype parameters and multipart subtypes', () => {
    const v = withSession();
    v.addDialog(
      new Dialog({ type: 'text', start: T, parties: [0], mediatype: 'multipart/alternative; boundary=abc', body: 'x', encoding: 'none' }),
      0
    );
    expect(v.isValid().valid).toBe(true);
  });

  it('checks redacted_segments', () => {
    const v = withSession();
    v.addDialog(new Dialog({ type: 'text', start: T, parties: [0], body: 'x', mediatype: 'text/plain', encoding: 'none', redacted_segments: [{ start: 0 } as any] }), 0);
    expect(v.isValid().errors).toContain('Dialog at index 0 redacted_segments[0] requires start and end.');
  });

  it('reads audio and video Dialogs with a warning, never as an error', () => {
    const v = withSession();
    v.data.dialog = [{ type: 'audio', start: T, parties: [0], mediatype: 'audio/wav' }];
    v.data.sessions![0].dialog = [0];
    expect(v.isValid().valid).toBe(true);
    expect(v.getValidationWarnings().some(w => /read as 'recording'/.test(w))).toBe(true);
  });
});

describe('extensions enforcement', () => {
  it('requires lawful_basis and wtf_transcription to be listed', () => {
    const v = withSession();
    v.addAttachment({ purpose: 'lawful_basis', party: 0, session: 0, body: { lawful_basis: 'consent', expiration: null, purpose_grants: [{ purpose: 'recording', granted: true, granted_at: T }] } as any, encoding: 'json' });
    expect(v.isValid().errors).toContain("Extension 'lawful_basis' is in use but is not listed in the extensions parameter.");
    v.addExtension('lawful_basis');
    expect(v.isValid().valid).toBe(true);
    v.addAnalysis({ type: 'wtf_transcription', vendor: 'v', body: { a: 1 }, dialog: undefined, sessions: 0 });
    expect(v.isValid().errors).toContain("Extension 'wtf_transcription' is in use but is not listed in the extensions parameter.");
  });

  it('requires critical entries to be listed in extensions', () => {
    const v = base();
    v.data.critical = ['x'];
    expect(v.isValid().errors).toContain("Extension 'x' is listed in critical but not in extensions.");
    v.addCriticalExtension('y');
    expect(v.isValid().errors).toEqual(["Extension 'x' is listed in critical but not in extensions."]);
  });

  it('needs some extension for values outside the core vocabulary', () => {
    const v = withSession();
    v.data.dialog = [{ type: 'text', start: T, parties: [0], body: 'x', mediatype: 'text/plain', encoding: 'gzip' }];
    v.data.sessions![0].dialog = [0];
    expect(v.isValid().errors.some(e => /outside the core vocabulary/.test(e))).toBe(true);
    v.addExtension('compression');
    expect(v.isValid().valid).toBe(true);
  });

  it('requires a mediatype on inline attachment content', () => {
    const v = withSession();
    v.data.attachments = [{ purpose: 'note', start: T, party: 0, session: 0, body: 'x', encoding: 'none' }];
    expect(v.isValid().errors).toContain('Attachment at index 0 is missing required field: mediatype (needed for inline content)');
  });
});

describe('lawful basis', () => {
  it('finds lawful_basis attachments and reports a vCon without one', () => {
    const v = withSession();
    expect(v.hasLawfulBasis()).toBe(false);
    v.data.extensions = ['lawful_basis'];
    v.data.attachments = [{ purpose: 'lawful_basis', start: T, party: 1, dialog: undefined, session: 0, body: { lawful_basis: 'consent' }, encoding: 'json', mediatype: 'application/json' }];
    expect(v.hasLawfulBasis()).toBe(true);
    expect(v.findLawfulBasisAttachments(1)).toHaveLength(1);
    expect(v.findLawfulBasisAttachments(0)).toHaveLength(0);
    expect(v.getValidationWarnings().some(w => /lawful_basis/.test(w))).toBe(false);
  });

  it('leaves lawful_basis scope to the core rules (no extra no-party/no-session warnings)', () => {
    const v = withSession();
    v.data.extensions = ['lawful_basis'];
    v.data.attachments = [{ purpose: 'lawful_basis', start: T, dialog: 0, body: {}, encoding: 'json', mediatype: 'application/json' }];
    const warnings = v.getValidationWarnings();
    expect(warnings.some(w => /no party/.test(w))).toBe(false);
    expect(warnings.some(w => /no session/.test(w))).toBe(false);
    expect(v.isValid().errors).toContain('Attachment at index 0 is missing required field: party');
  });
});

describe('redacted_strings', () => {
  it('needs an entry for every reference', () => {
    const v = withSession();
    v.addDialog(new Dialog({ type: 'text', start: T, parties: [0], body: 'call __REDACTED_REF_7 now', mediatype: 'text/plain', encoding: 'none' }), 0);
    expect(v.isValid().errors).toContain('__REDACTED_REF_7 appears in the vCon but has no entry in redacted_strings.');
    v.data.redacted_strings = [{ ref: 7 }];
    expect(v.isValid().valid).toBe(true);
  });

  it('checks the ref range and duplicates', () => {
    const v = base();
    v.data.redacted_strings = [{ ref: 0 }, { ref: 5 }, { ref: 5 }, { ref: 100000 }];
    const errors = v.isValid().errors;
    expect(errors).toContain('redacted_strings[0] ref must be between 1 and 99999.');
    expect(errors).toContain('redacted_strings[2] duplicates ref 5.');
    expect(errors).toContain('redacted_strings[3] ref must be between 1 and 99999.');
  });
});

describe('version handling', () => {
  it('emits 0.5.0 from buildNew', () => {
    expect(Vcon.buildNew().vcon).toBe('0.5.0');
  });

  it('accepts an absent vcon', () => {
    const v = new Vcon({ uuid: 'u', created_at: T, parties: [] });
    expect(v.vcon).toBeUndefined();
    expect(v.isValid().valid).toBe(true);
  });

  it('rejects other versions', () => {
    const v = new Vcon({ vcon: '0.0.1', uuid: 'u', created_at: T });
    expect(v.isValid().errors.some(e => /Unsupported vcon syntax version '0.0.1'/.test(e))).toBe(true);
  });
});

describe('signing', () => {
  const { privateKey, publicKey } = Vcon.generateKeyPair();

  it('rejects alg none on sign, in any case', () => {
    const v = base();
    for (const alg of ['none', 'NONE', 'None']) {
      expect(() => v.sign(privateKey, alg)).toThrow(AlgorithmNotPermittedError);
    }
  });

  it('rejects an unsupported alg', () => {
    expect(() => base().sign(privateKey, 'HS256')).toThrow(AlgorithmNotPermittedError);
  });

  it('signs with RS256 by default and verifies', () => {
    const v = base();
    v.sign(privateKey);
    const header = JSON.parse(Buffer.from(v.data.signatures![0].protected!, 'base64url').toString());
    expect(header.alg).toBe('RS256');
    expect(v.verify(publicKey)).toBe(true);
  });

  it.each(['RS384', 'RS512', 'PS256'])('signs and verifies with %s', alg => {
    const v = base();
    v.sign(privateKey, alg);
    expect(v.verify(publicKey)).toBe(true);
  });

  it('signs and verifies with ES256 and EdDSA', () => {
    const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const v = base();
    v.sign(ec.privateKey, 'ES256');
    expect(v.verify(ec.publicKey)).toBe(true);
    const ed = crypto.generateKeyPairSync('ed25519');
    const w = base();
    w.sign(ed.privateKey, 'EdDSA');
    expect(w.verify(ed.publicKey)).toBe(true);
  });

  it('refuses alg none in the protected header', () => {
    const v = base();
    v.sign(privateKey);
    v.data.signatures![0].protected = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    expect(() => v.verify(publicKey)).toThrow(AlgorithmNotPermittedError);
  });

  it('refuses alg none in the header object', () => {
    const v = base();
    v.sign(privateKey);
    v.data.signatures![0].header = { alg: 'None' };
    expect(() => v.verify(publicKey)).toThrow(AlgorithmNotPermittedError);
  });

  it('fails closed without an alg', () => {
    const v = base();
    v.sign(privateKey);
    v.data.signatures![0].protected = Buffer.from(JSON.stringify({ typ: 'JWS' })).toString('base64url');
    expect(v.verify(publicKey)).toBe(false);
  });

  it('returns false for the wrong key or a tampered payload and throws when unsigned', () => {
    const v = base();
    v.sign(privateKey);
    expect(v.verify(Vcon.generateKeyPair().publicKey)).toBe(false);
    v.data.payload = Buffer.from('{}').toString('base64url');
    expect(v.verify(publicKey)).toBe(false);
    expect(() => base().verify(publicKey)).toThrow(/not signed/);
  });

  it('re-signing does not embed the earlier signature in the payload', () => {
    const v = base();
    v.sign(privateKey);
    v.sign(privateKey);
    const payload = JSON.parse(Buffer.from(v.data.payload!, 'base64url').toString());
    expect(payload.signatures).toBeUndefined();
    expect(payload.payload).toBeUndefined();
  });
});

describe('deprecated 0.4.0 API', () => {
  it('keeps redacted and amended as aliases that warn', () => {
    const spy = jest.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      const v = base();
      v.amended = { uuid: 'u' };
      expect(v.amended_from).toEqual({ uuid: 'u' });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
