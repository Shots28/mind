/**
 * Returns a YYYY-MM-DD string in the user's local timezone.
 * Use this instead of date.toISOString().split('T')[0] which returns UTC.
 */
export function toLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
