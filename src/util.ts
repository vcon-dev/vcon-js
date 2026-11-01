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

/**
 * Parse an ISO 8601 / RFC 3339 date-time string to epoch milliseconds, or
 * undefined if it is not one. A date-time with no offset is read as UTC, as the
 * Python reference does, so results do not depend on the machine's time zone.
 */
export function parseDateTime(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const m = DATE_RE.exec(value.trim());
  if (!m) return undefined;
  const [, y, mo, d, h = '00', mi = '00', s = '00', frac = '', tz = 'Z'] = m;
  let offset = tz.toUpperCase();
  if (offset !== 'Z') {
    const digits = offset.slice(1).replace(':', '');
    offset = offset[0] + digits.slice(0, 2) + ':' + (digits.slice(2) || '00');
  }
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${frac}${offset}`);
  return Number.isNaN(ms) ? undefined : ms;
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
