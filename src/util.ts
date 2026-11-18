/**
 * Small helpers shared by the model, validation and migration code.
 */

/** True for a non-negative integer (a valid array index). */
export function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** True for an integer of any sign. */
export function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

export function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Wrap a scalar in a list; undefined and null become an empty list. */
export function asList<T = any>(value: T | T[] | null | undefined): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Parse an ISO 8601 / RFC 3339 date-time string to integer epoch microseconds,
 * or undefined if it is not one. A date-time with no offset is read as UTC, as
 * the Python reference does, so results do not depend on the machine's time
 * zone. Out-of-range fields (month 13, February 30, hour 24, second 60, an
 * offset of 24 hours or more) are rejected rather than rolled over. Fractional
 * seconds keep microsecond precision (digits past the sixth are dropped), so
 * timestamps written by microsecond-precision writers compare and subtract
 * exactly.
 */
export function parseDateTimeMicros(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const m = DATE_RE.exec(value.trim());
  if (!m) return undefined;
  const [, ys, mos, ds, hs = '00', mis = '00', ss = '00', frac = '', tz = 'Z'] = m;
  const [y, mo, d, h, mi, s] = [ys, mos, ds, hs, mis, ss].map(Number);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return undefined;
  const dim = mo === 2 && isLeapYear(y) ? 29 : DAYS_IN_MONTH[mo - 1];
  if (d > dim || h > 23 || mi > 59 || s > 59) return undefined;
  let offsetMinutes = 0;
  const t = tz.toUpperCase();
  if (t !== 'Z') {
    const digits = t.slice(1).replace(':', '');
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2) || '0');
    if (oh > 23 || om > 59) return undefined;
    offsetMinutes = (t[0] === '-' ? -1 : 1) * (oh * 60 + om);
  }
  const date = new Date(Date.UTC(2000, mo - 1, d, h, mi, s));
  date.setUTCFullYear(y);
  const micros = frac ? Number(frac.slice(1, 7).padEnd(6, '0')) : 0;
  return date.getTime() * 1000 + micros - offsetMinutes * 60_000_000;
}

/**
 * Parse an ISO 8601 / RFC 3339 date-time string to epoch milliseconds, or
 * undefined if it is not one. See parseDateTimeMicros for the rules.
 */
export function parseDateTime(value: unknown): number | undefined {
  const us = parseDateTimeMicros(value);
  return us === undefined ? undefined : Math.floor(us / 1000);
}

/** Convert a Date to an ISO string; pass other values through. */
export function toIso<T>(value: T | Date): T | string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Deep copy of JSON-compatible data. */
export function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/**
 * Emit a deprecation or compatibility warning. Uses process.emitWarning when
 * available (so it can be silenced with --no-warnings), else console.warn.
 */
export function warn(message: string, code = 'DeprecationWarning'): void {
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(message, code);
  } else if (typeof console !== 'undefined') {
    console.warn(`${code}: ${message}`);
  }
}

/** Decode a base64url string (padded or not) to a UTF-8 string. Throws on non-base64url input. */
export function base64UrlDecodeToString(input: string): string {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(input)) throw new Error('not base64url');
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.replace(/=+$/, '').length % 4)) % 4);
  if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Python-style repr for report messages: strings in single quotes, other values as JSON. */
export function repr(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (value === undefined) return 'None';
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return JSON.stringify(value);
}

/** Python-style repr of a list of strings, e.g. ['a', 'b']. */
export function reprList(values: unknown[]): string {
  return `[${values.map(repr).join(', ')}]`;
}
