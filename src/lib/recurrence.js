/**
 * Lightweight recurrence expansion without rrule dependency.
 * For Google-sourced events, instances come from the API directly.
 * This is only used for locally-created recurring events.
 */

const FREQ_MAP = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  YEARLY: 'year',
};

function parseRRule(rruleStr) {
  const parts = rruleStr.replace('RRULE:', '').split(';');
  const rule = {};
  for (const part of parts) {
    const [key, value] = part.split('=');
    rule[key] = value;
  }
  return rule;
}

function addInterval(date, freq, interval) {
  const d = new Date(date);
  switch (freq) {
    case 'DAILY': d.setDate(d.getDate() + interval); break;
    case 'WEEKLY': d.setDate(d.getDate() + interval * 7); break;
    case 'MONTHLY': d.setMonth(d.getMonth() + interval); break;
    case 'YEARLY': d.setFullYear(d.getFullYear() + interval); break;
  }
  return d;
}

function matchesByDay(date, byDay) {
  const days = byDay.split(',');
  const dayMap = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  return days.some(d => dayMap[d] === date.getDay());
}

/**
 * Expand a recurring event into individual occurrences within a date range.
 * Returns array of event-like objects with computed start/end dates.
 */
export function expandRecurringEvent(event, rangeStart, rangeEnd, maxOccurrences = 200) {
  if (!event.recurrence_rule) return [event];

  // For Google-sourced recurring events with instances already stored,
  // don't expand -- they're already in the events array
  if (event.source === 'google') return [event];

  const rule = parseRRule(event.recurrence_rule);
  const freq = rule.FREQ;
  const interval = parseInt(rule.INTERVAL) || 1;
  const count = rule.COUNT ? parseInt(rule.COUNT) : null;
  const until = rule.UNTIL ? new Date(rule.UNTIL.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) : null;
  const byDay = rule.BYDAY;

  if (!freq) return [event];

  const eventStart = new Date(event.start_date);
  const duration = event.end_date
    ? new Date(event.end_date) - eventStart
    : 0;

  const exceptions = new Set(event.exceptions || []);
  const instances = [];
  let current = new Date(eventStart);
  let occurrenceCount = 0;

  const rStart = new Date(rangeStart);
  const rEnd = new Date(rangeEnd);

  while (current <= rEnd && occurrenceCount < maxOccurrences) {
    if (until && current > until) break;
    if (count && occurrenceCount >= count) break;

    let matches = true;
    if (byDay && freq === 'WEEKLY') {
      matches = matchesByDay(current, byDay);
    }

    // Skip dates that are in the exceptions list
    const dateStr = current.toISOString().substring(0, 10);
    if (exceptions.has(dateStr)) {
      matches = false;
    }

    if (matches && current >= rStart) {
      instances.push({
        ...event,
        id: `${event.id}_${current.toISOString()}`,
        _parentId: event.id,
        _isRecurrenceInstance: true,
        start_date: current.toISOString(),
        end_date: duration ? new Date(current.getTime() + duration).toISOString() : null,
      });
    }

    if (matches) occurrenceCount++;

    if (byDay && freq === 'WEEKLY') {
      // Step one day at a time within weeks
      current = new Date(current);
      current.setDate(current.getDate() + 1);
      // If we've completed a week, jump by (interval - 1) more weeks
      if (current.getDay() === eventStart.getDay() && interval > 1) {
        current.setDate(current.getDate() + (interval - 1) * 7);
      }
    } else {
      current = addInterval(current, freq, interval);
    }
  }

  return instances;
}

/**
 * Get a human-readable description of an RRULE.
 */
export function describeRecurrence(rruleStr) {
  if (!rruleStr) return '';
  const rule = parseRRule(rruleStr);

  const dayNames = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };
  const interval = parseInt(rule.INTERVAL) || 1;
  const freq = rule.FREQ;

  let desc = '';
  if (interval === 1) {
    desc = freq === 'DAILY' ? 'Daily' :
      freq === 'WEEKLY' ? 'Weekly' :
      freq === 'MONTHLY' ? 'Monthly' :
      freq === 'YEARLY' ? 'Yearly' : '';
  } else {
    desc = `Every ${interval} ${FREQ_MAP[freq] || ''}s`;
  }

  if (rule.BYDAY) {
    const days = rule.BYDAY.split(',').map(d => dayNames[d] || d);
    desc += ` on ${days.join(', ')}`;
  }

  if (rule.COUNT) desc += `, ${rule.COUNT} times`;
  if (rule.UNTIL) {
    const d = rule.UNTIL.replace(/(\d{4})(\d{2})(\d{2}).*/, '$1-$2-$3');
    desc += ` until ${d}`;
  }

  return desc;
}
