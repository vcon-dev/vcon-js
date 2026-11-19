/**
 * Structural validation of an unsigned vCon object against core-05.
 *
 * validateVconDict() is the engine behind Vcon.isValid(). It works on plain
 * objects so the migration code can reuse it.
 */
import { CORE_EVENT_TYPES, validateEvent } from './event';
import { SESSION_REFERENCE_TYPES, validateSession } from './session';
import { asList, dateTimeProblem, isIndex, isPlainObject, parseDateTime, pyRepr } from './util';

export const SYNTAX_VERSION = '0.5.0';

export const CORE_DIALOG_TYPES = ['recording', 'text', 'incomplete'];
/**
 * Dialog types older versions of this library wrote although core-05 does not
 * define them. Accepted on read with a warning; the library never writes them.
 */
export const LIBRARY_DIALOG_TYPES = ['audio', 'video'];
export const CORE_ENCODINGS = ['base64url', 'json', 'none'];
export const CORE_DISPOSITIONS = [
  'no-answer',
  'congestion',
  'failed',
  'busy',
  'hung-up',
  'voicemail-no-message'
];

/** Extension names this library recognises, keyed by how they show up. */
const KNOWN_ATTACHMENT_PURPOSE_EXTENSIONS: Record<string, string> = {
  lawful_basis: 'lawful_basis',
  wtf_transcription: 'wtf_transcription'
};
const KNOWN_ANALYSIS_TYPE_EXTENSIONS: Record<string, string> = {
  wtf_transcription: 'wtf_transcription'
};

/** Removed in 0.5.0; their presence means the document is still 0.4.0 shaped. */
export const LEGACY_TOP_LEVEL: Record<string, string> = {
  redacted: 'redacted_from',
  amended: 'amended_from'
};
export const LEGACY_DIALOG_PARAMS = [
  'party_history',
  'originator',
  'transferee',
  'transferor',
  'transfer_target',
  'original',
  'consultation',
  'target_dialog',
  'recordings',
  'recording_set'
];
export const LEGACY_DIALOG_TYPES = ['transfer', 'recording-set'];

/** Dialog media types the library knows (the draft's list is open-ended; see mediatypeOk). */
export const DIALOG_MIME_TYPES = [
  'text/plain',
  'audio/x-wav',
  'audio/wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/webm',
  'audio/x-m4a',
  'audio/aac',
  'video/mp4',
  'video/x-mp4',
  'video/ogg',
  'video/webm',
  'multipart/mixed',
  'message/rfc822',
  'application/json'
];

const REDACTED_REF_RE = /__REDACTED_REF_(\d{1,5})(?!\d)/g;

/** ContentHash token (section 2.2): "<algorithm>-<unpadded base64url digest>". */
const CONTENT_HASH_RE = /^([a-z0-9]+)-([A-Za-z0-9_-]+)$/;
/** Unpadded base64url length of the digests this library knows. */
const DIGEST_B64_LENGTHS: Record<string, number> = { sha512: 86, sha256: 43 };

/** Return why `value` is not a ContentHash or ContentHash[] (empty if it is). */
export function contentHashProblems(value: unknown): string[] {
  if (Array.isArray(value) && value.length === 0) return ['must not be an empty array'];
  const tokens = Array.isArray(value) ? value : [value];
  const problems: string[] = [];
  for (const token of tokens) {
    if (typeof token !== 'string') {
      problems.push(`${pyRepr(token)} is not a string`);
      continue;
    }
    const m = CONTENT_HASH_RE.exec(token);
    if (!m) {
      problems.push(`${pyRepr(token)} is not of the form '<algorithm>-<base64url digest>'`);
      continue;
    }
    const expected = Object.prototype.hasOwnProperty.call(DIGEST_B64_LENGTHS, m[1]) ? DIGEST_B64_LENGTHS[m[1]] : undefined;
    if (expected !== undefined && m[2].length !== expected) {
      problems.push(
        `${pyRepr(token)} has a ${m[1]} digest of ${m[2].length} base64url characters, expected ${expected}`
      );
    }
  }
  return problems;
}

function isSerializedJson(body: string): boolean {
  const s = body.trim();
  if (s[0] !== '{' && s[0] !== '[') return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Integrity and body-form checks shared by Dialog, Attachment, Analysis and the
 * redacted_from / amended_from references (section 2.4).
 */
function checkContent(
  obj: Record<string, any>,
  label: string,
  errors: string[],
  warnings: string[],
  checkUrl = true
): void {
  if (checkUrl && 'url' in obj && !('content_hash' in obj)) {
    // A MUST in section 2.4. A warning in 1.0.x, as in the reference library,
    // so producers that only hold a carrier URL keep validating.
    warnings.push(
      `${label} has a url but no content_hash (an external reference MUST have both; ` +
        'this will be an error in vcon 1.1).'
    );
  }
  if ('content_hash' in obj) {
    for (const problem of contentHashProblems(obj.content_hash)) {
      errors.push(`${label} has an invalid content_hash: ${problem}.`);
    }
  }
  if (obj.encoding === 'json' && typeof obj.body === 'string' && isSerializedJson(obj.body)) {
    warnings.push(
      `${label} has encoding 'json' and a body that is a serialized JSON string; ` +
        'the body should be the JSON value itself (section 2.3.2).'
    );
  }
}

/**
 * True if `mediatype` is acceptable for a Dialog. Media type parameters
 * (`; boundary=...`) are ignored. Any multipart/, message/ or text/ subtype is
 * accepted, since the draft's examples use multipart/alternative and the list
 * in the draft is open-ended.
 */
export function mediatypeOk(mediatype: unknown, known: string[] = DIALOG_MIME_TYPES): boolean {
  if (typeof mediatype !== 'string') return false;
  const base = mediatype.split(';', 1)[0].trim().toLowerCase();
  if (known.includes(base)) return true;
  return ['multipart/', 'message/', 'text/'].some(p => base.startsWith(p));
}

function flattenParties(value: unknown): unknown[] {
  const out: unknown[] = [];
  for (const v of asList(value)) {
    if (Array.isArray(v)) out.push(...v);
    else out.push(v);
  }
  return out;
}

/**
 * Find the vCon extensions the document uses.
 *
 * `names` holds extension names this library recognises (lawful_basis,
 * wtf_transcription). `unnamed` describes each use of a value outside the core
 * vocabulary (an Event type, Dialog encoding, disposition or Session_Reference
 * type) whose defining extension cannot be identified from the document alone.
 */
export function extensionsInUse(vcon: Record<string, any>): { names: Set<string>; unnamed: string[] } {
  const names = new Set<string>();
  const unnamed: string[] = [];

  asList(vcon.attachments).forEach((att, i) => {
    if (!isPlainObject(att)) return;
    if (typeof att.purpose === 'string' && Object.prototype.hasOwnProperty.call(KNOWN_ATTACHMENT_PURPOSE_EXTENSIONS, att.purpose)) {
      names.add(KNOWN_ATTACHMENT_PURPOSE_EXTENSIONS[att.purpose]);
    }
    if (att.encoding !== undefined && att.encoding !== null && !CORE_ENCODINGS.includes(att.encoding)) {
      unnamed.push(`attachments[${i}] encoding '${att.encoding}'`);
    }
  });
  asList(vcon.analysis).forEach((an, i) => {
    if (!isPlainObject(an)) return;
    if (typeof an.type === 'string' && Object.prototype.hasOwnProperty.call(KNOWN_ANALYSIS_TYPE_EXTENSIONS, an.type)) {
      names.add(KNOWN_ANALYSIS_TYPE_EXTENSIONS[an.type]);
    }
    if (an.encoding !== undefined && an.encoding !== null && !CORE_ENCODINGS.includes(an.encoding)) {
      unnamed.push(`analysis[${i}] encoding '${an.encoding}'`);
    }
  });
  asList(vcon.dialog).forEach((d, i) => {
    if (!isPlainObject(d) || Object.keys(d).length === 0) return;
    if (d.encoding !== undefined && d.encoding !== null && !CORE_ENCODINGS.includes(d.encoding)) {
      unnamed.push(`dialog[${i}] encoding '${d.encoding}'`);
    }
    if (d.type === 'incomplete' && d.disposition !== undefined && d.disposition !== null && !CORE_DISPOSITIONS.includes(d.disposition)) {
      unnamed.push(`dialog[${i}] disposition '${d.disposition}'`);
    }
  });
  asList(vcon.events).forEach((e, i) => {
    if (!isPlainObject(e)) return;
    if (e.type !== undefined && e.type !== null && !CORE_EVENT_TYPES.includes(e.type)) {
      unnamed.push(`events[${i}] type '${e.type}'`);
    }
  });
  asList(vcon.sessions).forEach((s, i) => {
    if (!isPlainObject(s)) return;
    asList(s.sessions).forEach((ref, j) => {
      if (isPlainObject(ref) && ref.type !== undefined && ref.type !== null && !SESSION_REFERENCE_TYPES.includes(ref.type)) {
        unnamed.push(`sessions[${i}].sessions[${j}] type '${ref.type}'`);
      }
    });
  });
  return { names, unnamed };
}

function scanRedactedRefs(obj: unknown, found: Set<number>): void {
  if (typeof obj === 'string') {
    for (const m of obj.matchAll(REDACTED_REF_RE)) found.add(parseInt(m[1], 10));
  } else if (Array.isArray(obj)) {
    obj.forEach(v => scanRedactedRefs(v, found));
  } else if (isPlainObject(obj)) {
    Object.values(obj).forEach(v => scanRedactedRefs(v, found));
  }
}

/** Validate an unsigned vCon object. Returns `{ errors, warnings }`. */
export function validateVconDict(
  vcon: Record<string, any>,
  dialogMimeTypes: string[] = DIALOG_MIME_TYPES
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- required fields and version ----------------------------------------
  for (const field of ['uuid', 'created_at']) {
    if (!(field in vcon)) errors.push(`Missing required field: ${field}`);
  }
  for (const ts of ['created_at', 'updated_at']) {
    if (ts in vcon && parseDateTime(vcon[ts]) === undefined) {
      errors.push(`Invalid ${ts} format. Must be an ISO 8601 datetime string: ${dateTimeProblem(vcon[ts])}`);
    }
  }
  if ('vcon' in vcon && vcon.vcon !== SYNTAX_VERSION) {
    errors.push(
      `Unsupported vcon syntax version '${vcon.vcon}': this library writes '${SYNTAX_VERSION}'. ` +
        'Migrate a 0.4.0 vCon with migrate040To050().'
    );
  }
  for (const [old, neu] of Object.entries(LEGACY_TOP_LEVEL)) {
    if (old in vcon) errors.push(`Legacy 0.4.0 parameter '${old}' was renamed '${neu}' in 0.5.0.`);
  }

  // --- parties --------------------------------------------------------------
  let parties: any[] = [];
  if ('parties' in vcon) {
    if (!Array.isArray(vcon.parties)) {
      errors.push("Field 'parties' must be a list.");
    } else {
      parties = vcon.parties;
      parties.forEach((party, i) => {
        if (!isPlainObject(party)) errors.push(`Party at index ${i} must be a dictionary.`);
      });
    }
  }
  const partyCount = parties.length;

  let dialogs: any[] = [];
  if ('dialog' in vcon) {
    if (!Array.isArray(vcon.dialog)) errors.push("Field 'dialog' must be a list.");
    else dialogs = vcon.dialog;
  }
  const dialogCount = dialogs.length;
  let sessions: any[] = [];
  if ('sessions' in vcon) {
    if (!Array.isArray(vcon.sessions)) errors.push("Field 'sessions' must be a list.");
    else sessions = vcon.sessions;
  }
  const sessionCount = sessions.length;
  let events: any[] = [];
  if ('events' in vcon) {
    if (!Array.isArray(vcon.events)) errors.push("Field 'events' must be a list.");
    else events = vcon.events;
  }
  let attachments: any[] = [];
  if ('attachments' in vcon) {
    if (!Array.isArray(vcon.attachments)) errors.push("Field 'attachments' must be a list.");
    else attachments = vcon.attachments;
  }
  let analyses: any[] = [];
  if ('analysis' in vcon) {
    if (!Array.isArray(vcon.analysis)) errors.push("Field 'analysis' must be a list.");
    else analyses = vcon.analysis;
  }
  const redacted = isPlainObject(vcon.redacted_from);

  // --- redacted_from / amended_from ----------------------------------------
  if ('redacted_from' in vcon && 'amended_from' in vcon) {
    errors.push('redacted_from and amended_from are mutually exclusive.');
  }
  if ('redacted_from' in vcon) {
    const rf = vcon.redacted_from;
    if (!isPlainObject(rf)) {
      errors.push("Field 'redacted_from' must be an object.");
    } else {
      if (!('type' in rf)) errors.push('redacted_from is missing required field: type');
      if ('url' in rf && !('content_hash' in rf)) errors.push('redacted_from with url must include content_hash.');
      checkContent(rf, 'redacted_from', errors, warnings, false);
    }
  }
  if ('amended_from' in vcon) {
    const af = vcon.amended_from;
    if (!isPlainObject(af)) {
      errors.push("Field 'amended_from' must be an object.");
    } else {
      if (!('uuid' in af) && !('url' in af)) {
        errors.push('amended_from must include uuid, or an external reference (url).');
      }
      if ('url' in af && !('content_hash' in af)) errors.push('amended_from with url must include content_hash.');
      checkContent(af, 'amended_from', errors, warnings, false);
    }
  }

  // --- extensions / critical -----------------------------------------------
  let extListed: any[] = [];
  if ('extensions' in vcon) {
    if (!Array.isArray(vcon.extensions) || !vcon.extensions.every((x: unknown) => typeof x === 'string')) {
      errors.push("Field 'extensions' must be a list of strings.");
    } else {
      extListed = vcon.extensions;
    }
  }
  let crit: any[] = [];
  if ('critical' in vcon) {
    if (!Array.isArray(vcon.critical) || !vcon.critical.every((x: unknown) => typeof x === 'string')) {
      errors.push("Field 'critical' must be a list of strings.");
    } else {
      crit = vcon.critical;
    }
  }
  for (const name of crit) {
    if (!extListed.includes(name)) {
      errors.push(`Extension '${name}' is listed in critical but not in extensions.`);
    }
  }
  const { names: used, unnamed } = extensionsInUse(vcon);
  for (const name of [...used].sort()) {
    if (!extListed.includes(name)) {
      errors.push(`Extension '${name}' is in use but is not listed in the extensions parameter.`);
    }
  }
  if (unnamed.length && extListed.length === 0) {
    errors.push(
      'Values outside the core vocabulary are in use but the extensions parameter lists no extension: ' +
        unnamed.join('; ') +
        '.'
    );
  }

  // --- dialog -----------------------------------------------------------------
  dialogs.forEach((dialog, i) => {
    if (!isPlainObject(dialog)) {
      errors.push(`Dialog at index ${i} must be a dictionary.`);
      return;
    }
    if (Object.keys(dialog).length === 0) return; // empty placeholder Dialog Object (4.5.1)
    const dialogType = dialog.type;
    if (!('type' in dialog)) {
      errors.push(`Dialog at index ${i} is missing required field: type`);
    } else if (LEGACY_DIALOG_TYPES.includes(dialogType)) {
      errors.push(
        `Dialog at index ${i} has type '${dialogType}', which was removed in 0.5.0 ` +
          '(use Events and Sessions; migrate with migrate040To050()).'
      );
    } else if (LIBRARY_DIALOG_TYPES.includes(dialogType) && extListed.length === 0) {
      warnings.push(
        `Dialog at index ${i} has type '${dialogType}', which core-05 does not define; ` +
          "it is read as 'recording' (written by older library versions)."
      );
    } else if (
      !CORE_DIALOG_TYPES.includes(dialogType) &&
      !LIBRARY_DIALOG_TYPES.includes(dialogType) &&
      extListed.length === 0
    ) {
      // A Dialog type outside the core vocabulary must come from a vCon
      // extension, which has to be listed in extensions (4.1.3).
      errors.push(`Dialog at index ${i} has an invalid type: ${dialogType}`);
    }
    for (const legacy of LEGACY_DIALOG_PARAMS) {
      if (legacy in dialog) errors.push(`Dialog at index ${i} has parameter '${legacy}', which was removed in 0.5.0.`);
    }
    if (dialogType === 'incomplete') {
      if (!('disposition' in dialog)) errors.push(`Dialog at index ${i} of type 'incomplete' must have a disposition.`);
      for (const forbidden of [
        'mediatype', 'filename', 'body', 'encoding', 'url', 'content_hash', 'message_id', 'redacted_segments'
      ]) {
        if (forbidden in dialog) {
          errors.push(`Dialog at index ${i} of type 'incomplete' must not have field: ${forbidden}`);
        }
      }
    }

    if ('parties' in dialog) {
      const dp = dialog.parties;
      if (!(Array.isArray(dp) || (typeof dp === 'number' && Number.isInteger(dp)))) {
        errors.push(`Dialog at index ${i} field 'parties' must be a list.`);
      } else {
        for (const partyIdx of flattenParties(dp)) {
          if (partyIdx === null) continue; // null placeholder for a channel with no contributor
          if (!isIndex(partyIdx) || partyIdx >= partyCount) {
            errors.push(`Dialog at index ${i} references invalid party index: ${partyIdx}`);
          }
        }
      }
    }
    if ('start' in dialog && parseDateTime(dialog.start) === undefined) {
      errors.push(`Dialog at index ${i} has an invalid 'start' format. Must be an ISO 8601 datetime string.`);
    }
    if (dialogType !== 'incomplete') {
      const hasContent = 'body' in dialog;
      if ('mediatype' in dialog) {
        if (!mediatypeOk(dialog.mediatype, dialogMimeTypes)) {
          errors.push(`Dialog at index ${i} has an invalid or missing mediatype: ${dialog.mediatype}`);
        }
      } else if (hasContent) {
        errors.push(`Dialog at index ${i} has an invalid or missing mediatype: missing`);
      }
    }
    if ('redacted_segments' in dialog) {
      const segs = dialog.redacted_segments;
      if (!Array.isArray(segs)) {
        errors.push(`Dialog at index ${i} field 'redacted_segments' must be a list.`);
      } else {
        segs.forEach((seg, n) => {
          if (!isPlainObject(seg) || !('start' in seg) || !('end' in seg)) {
            errors.push(`Dialog at index ${i} redacted_segments[${n}] requires start and end.`);
          }
        });
      }
    }
  });

  dialogs.forEach((dialog, i) => {
    if (isPlainObject(dialog) && dialog.type !== 'incomplete') {
      checkContent(dialog, `Dialog at index ${i}`, errors, warnings);
    }
  });

  // --- sessions -----------------------------------------------------------------
  if ((dialogCount || events.length) && sessions.length === 0) {
    errors.push('At least one Session Object MUST exist if the events array or the dialog array contains Objects.');
  }
  sessions.forEach((s, i) => {
    const r = validateSession(s, { partyCount, dialogCount, sessionCount, label: `Session at index ${i}` });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  });
  const referencedDialogs = new Set<number>();
  for (const s of sessions) {
    if (isPlainObject(s) && Array.isArray(s.dialog)) {
      for (const x of s.dialog) if (isIndex(x)) referencedDialogs.add(x);
    }
  }
  dialogs.forEach((d, i) => {
    if (isPlainObject(d) && Object.keys(d).length > 0 && !referencedDialogs.has(i)) {
      warnings.push(`Dialog at index ${i} is not referenced by any Session Object.`);
    }
  });
  const emptyDialogs = new Set<number>();
  dialogs.forEach((d, i) => {
    if (isPlainObject(d) && Object.keys(d).length === 0) emptyDialogs.add(i);
  });
  sessions.forEach((s, n) => {
    if (!isPlainObject(s)) return;
    if (Array.isArray(s.parties) && s.parties.length > 0 && s.originator === s.parties[0]) {
      warnings.push(
        `Session at index ${n} has originator equal to its first party; originator is ` +
          'only provided when the first party is not the originator (4.2.4).'
      );
    }
    const listed = asList(s.dialog).filter(isIndex).sort((a, b) => a - b);
    for (const x of [...new Set(listed)]) {
      if (emptyDialogs.has(x)) warnings.push(`Session at index ${n} lists dialog ${x}, which is an empty placeholder Dialog.`);
    }
  });

  // --- events ---------------------------------------------------------------------
  events.forEach((ev, i) => {
    const r = validateEvent(ev, { partyCount, dialogCount, sessionCount, label: `Event at index ${i}` });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (isPlainObject(ev) && ev.type === 'channel-contributors' && isIndex(ev.dialog)) {
      const di = ev.dialog;
      if (di < dialogCount && isPlainObject(dialogs[di]) && dialogs[di].type !== 'recording') {
        errors.push(`Event at index ${i} of type 'channel-contributors' must reference a 'recording' Dialog.`);
      }
    }
  });

  // --- attachments --------------------------------------------------------------
  attachments.forEach((attachment, i) => {
    if (!isPlainObject(attachment)) {
      errors.push(`Attachment at index ${i} must be a dictionary.`);
      return;
    }
    if (!('purpose' in attachment)) errors.push(`Attachment at index ${i} is missing required field: purpose`);
    const hasInline = 'body' in attachment && 'encoding' in attachment;
    const hasExternal = 'url' in attachment && 'content_hash' in attachment;
    if (!(hasInline || hasExternal || redacted)) {
      errors.push(`Attachment at index ${i} must include body+encoding or url+content_hash.`);
    }
    checkContent(attachment, `Attachment at index ${i}`, errors, warnings, hasInline || redacted);
    if ('encoding' in attachment && !CORE_ENCODINGS.includes(attachment.encoding) && extListed.length === 0) {
      errors.push(`Attachment at index ${i} has invalid encoding: ${attachment.encoding}`);
    }
    if ('body' in attachment && attachment.body !== '' && !('mediatype' in attachment)) {
      errors.push(`Attachment at index ${i} is missing required field: mediatype (needed for inline content)`);
    }
    if (!('start' in attachment)) errors.push(`Attachment at index ${i} is missing required field: start`);
    if (!('party' in attachment)) {
      errors.push(`Attachment at index ${i} is missing required field: party`);
    } else if (!isIndex(attachment.party) || attachment.party >= partyCount) {
      errors.push(`Attachment at index ${i} references invalid party index: ${attachment.party}`);
    }
    if (!('dialog' in attachment) && !('session' in attachment)) {
      errors.push(`Attachment at index ${i} must have at least one of dialog or session.`);
    }
    if ('dialog' in attachment) {
      const dv = attachment.dialog;
      if (!isIndex(dv) || dv >= dialogCount) {
        errors.push(`Attachment at index ${i} references invalid dialog index: ${dv}`);
      } else if (emptyDialogs.has(dv)) {
        warnings.push(`Attachment at index ${i} references dialog ${dv}, an empty placeholder Dialog.`);
      }
    }
    if ('session' in attachment) {
      const sv = attachment.session;
      const vals = Array.isArray(sv) ? sv : [sv];
      if (Array.isArray(sv) && sv.length === 0) {
        errors.push(`Attachment at index ${i} field 'session' must not be empty.`);
      }
      for (const v of vals) {
        if (!isIndex(v) || v >= sessionCount) {
          errors.push(`Attachment at index ${i} references invalid session index: ${v}`);
        }
      }
    }
  });

  // --- analysis ---------------------------------------------------------------------
  analyses.forEach((analysis, i) => {
    if (!isPlainObject(analysis)) {
      errors.push(`Analysis at index ${i} must be a dictionary.`);
      return;
    }
    for (const field of ['type', 'vendor']) {
      if (!(field in analysis)) errors.push(`Analysis at index ${i} is missing required field: ${field}`);
    }
    if ('body' in analysis && analysis.body !== '' && !('encoding' in analysis)) {
      errors.push(`Analysis at index ${i} is missing required field: encoding`);
    }
    if ('encoding' in analysis && !CORE_ENCODINGS.includes(analysis.encoding) && extListed.length === 0) {
      errors.push(`Analysis at index ${i} has invalid encoding: ${analysis.encoding}`);
    }
    checkContent(analysis, `Analysis at index ${i}`, errors, warnings);
    const refs: Array<[string, number, string]> = [
      ['dialog', dialogCount, 'dialog'],
      ['sessions', sessionCount, 'session'],
      ['attachment', attachments.length, 'attachment'],
      ['analysis', analyses.length, 'analysis']
    ];
    for (const [key, count, noun] of refs) {
      if (!(key in analysis)) continue;
      const val = analysis[key];
      if (!(typeof val === 'number' || Array.isArray(val))) {
        errors.push(`Analysis at index ${i} has an invalid '${key}' reference type.`);
        continue;
      }
      for (const v of Array.isArray(val) ? val : [val]) {
        if (!isIndex(v) || v >= count) {
          errors.push(`Analysis at index ${i} references invalid ${noun} index: ${v}`);
        } else if (key === 'analysis' && v === i) {
          errors.push(`Analysis at index ${i} must not reference itself in analysis.`);
        }
      }
    }
    if (!['dialog', 'sessions', 'attachment', 'analysis'].some(k => k in analysis)) {
      warnings.push(`Analysis at index ${i} should have at least one of dialog, sessions, attachment or analysis.`);
    }
  });

  // --- redacted_strings -----------------------------------------------------------
  const refsDeclared = new Set<number>();
  if ('redacted_strings' in vcon) {
    const rs = vcon.redacted_strings;
    if (!Array.isArray(rs)) {
      errors.push("Field 'redacted_strings' must be a list.");
    } else {
      if (rs.length > 99999) errors.push('A vCon MUST NOT have more than 99999 redacted substrings.');
      rs.forEach((item, n) => {
        if (!isPlainObject(item) || !Number.isInteger(item.ref)) {
          errors.push(`redacted_strings[${n}] requires an integer ref.`);
          return;
        }
        if (item.ref < 1 || item.ref > 99999) errors.push(`redacted_strings[${n}] ref must be between 1 and 99999.`);
        if (refsDeclared.has(item.ref)) errors.push(`redacted_strings[${n}] duplicates ref ${item.ref}.`);
        refsDeclared.add(item.ref);
      });
    }
  }
  const found = new Set<number>();
  const rest: Record<string, any> = {};
  for (const [k, v] of Object.entries(vcon)) if (k !== 'redacted_strings') rest[k] = v;
  scanRedactedRefs(rest, found);
  for (const ref of [...found].sort((a, b) => a - b)) {
    if (!refsDeclared.has(ref)) {
      errors.push(`__REDACTED_REF_${ref} appears in the vCon but has no entry in redacted_strings.`);
    }
  }

  return { errors, warnings };
}
