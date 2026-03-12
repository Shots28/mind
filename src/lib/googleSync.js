/**
 * Helper utilities for Google Calendar sync operations.
 */

/**
 * Get sync status icon color.
 */
export function getSyncStatusColor(syncStatus) {
  switch (syncStatus) {
    case 'synced': return '#22c55e';
    case 'pending_push':
    case 'pending_pull': return '#eab308';
    case 'local': return 'var(--text-secondary)';
    default: return 'var(--text-secondary)';
  }
}

/**
 * Check if an event is from Google Calendar.
 */
export function isGoogleEvent(event) {
  return event?.source === 'google' || !!event?.google_event_id;
}

/**
 * Format time from ISO date string.
 */
export function formatEventTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Format a time range.
 */
export function formatTimeRange(startDate, endDate, allDay) {
  if (allDay) return 'All day';
  const start = formatEventTime(startDate);
  if (!endDate) return start;
  const end = formatEventTime(endDate);
  return `${start} - ${end}`;
}
