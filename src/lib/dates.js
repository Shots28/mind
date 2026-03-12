/**
 * Returns a YYYY-MM-DD string in the user's configured timezone.
 * Checks for a timezone override in localStorage, falls back to browser timezone.
 */
export function toLocalDateString(date = new Date()) {
  const tz = localStorage.getItem('mind_timezone_override');
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      return parts; // en-CA formats as YYYY-MM-DD
    } catch {
      // Invalid timezone, fall through to default
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the user's current timezone string.
 */
export function getUserTimezone() {
  return localStorage.getItem('mind_timezone_override') || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Common IANA timezone options.
 */
export const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Phoenix',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];
