import { describe, it, expect } from 'vitest';
import { expandRecurringEvent, describeRecurrence } from '../recurrence';

describe('expandRecurringEvent', () => {
  const baseEvent = {
    id: 'evt-1',
    title: 'Daily standup',
    start_date: '2026-03-01T09:00:00.000Z',
    end_date: '2026-03-01T09:30:00.000Z',
  };

  it('returns the event as-is when there is no recurrence_rule', () => {
    const result = expandRecurringEvent(baseEvent, '2026-03-01', '2026-03-31');
    expect(result).toEqual([baseEvent]);
  });

  it('returns the event as-is for Google-sourced events', () => {
    const googleEvent = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY', source: 'google' };
    const result = expandRecurringEvent(googleEvent, '2026-03-01', '2026-03-31');
    expect(result).toEqual([googleEvent]);
  });

  it('expands daily events across a range', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-05T23:59:59Z');
    expect(result).toHaveLength(5);
    result.forEach(instance => {
      expect(instance._isRecurrenceInstance).toBe(true);
      expect(instance._parentId).toBe('evt-1');
    });
  });

  it('respects COUNT limit', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY;COUNT=3' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-31');
    expect(result).toHaveLength(3);
  });

  it('respects UNTIL date', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY;UNTIL=20260305' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-31T23:59:59Z');
    // UNTIL=20260305 parses as 2026-03-05 midnight; event at 09:00 > midnight, so only 4
    expect(result).toHaveLength(4);
    expect(result[result.length - 1].start_date).toContain('2026-03-04');
  });

  it('handles INTERVAL for daily events', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY;INTERVAL=2' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-07T23:59:59Z');
    // March 1, 3, 5, 7 = 4 instances
    expect(result).toHaveLength(4);
  });

  it('expands weekly events', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=WEEKLY' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-31');
    // March 1 is a Sunday; Sundays in March: 1, 8, 15, 22, 29 = 5
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  it('expands weekly with BYDAY', () => {
    const event = {
      ...baseEvent,
      start_date: '2026-03-02T09:00:00.000Z', // Monday
      recurrence_rule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR',
    };
    const result = expandRecurringEvent(event, '2026-03-02', '2026-03-08T23:59:59Z');
    // Mon 2, Wed 4, Fri 6 = 3
    expect(result).toHaveLength(3);
  });

  it('expands monthly events', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=MONTHLY' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-06-30T23:59:59Z');
    // March, April, May, June = 4
    expect(result).toHaveLength(4);
  });

  it('preserves event duration in instances', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-02');
    const instance = result[0];
    const start = new Date(instance.start_date);
    const end = new Date(instance.end_date);
    expect(end - start).toBe(30 * 60 * 1000); // 30 minutes
  });

  it('generates unique IDs for each instance', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-05T23:59:59Z');
    const ids = result.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('skips exception dates', () => {
    const event = {
      ...baseEvent,
      recurrence_rule: 'RRULE:FREQ=DAILY',
      exceptions: ['2026-03-03', '2026-03-05'],
    };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-05T23:59:59Z');
    // 1, 2, 4, 5 in range minus exceptions 3 and 5 → 1, 2, 4 = 3
    expect(result).toHaveLength(3);
    const dates = result.map(r => r.start_date.substring(0, 10));
    expect(dates).not.toContain('2026-03-03');
    expect(dates).not.toContain('2026-03-05');
  });

  it('handles empty exceptions array', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY', exceptions: [] };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-03-03T23:59:59Z');
    expect(result).toHaveLength(3);
  });

  it('only returns instances within the requested range', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY' };
    const result = expandRecurringEvent(event, '2026-03-03', '2026-03-05T23:59:59Z');
    expect(result).toHaveLength(3);
    result.forEach(r => {
      const d = new Date(r.start_date);
      expect(d >= new Date('2026-03-03')).toBe(true);
      expect(d <= new Date('2026-03-05T23:59:59Z')).toBe(true);
    });
  });

  it('respects maxOccurrences limit', () => {
    const event = { ...baseEvent, recurrence_rule: 'RRULE:FREQ=DAILY' };
    const result = expandRecurringEvent(event, '2026-03-01', '2026-12-31', 10);
    expect(result).toHaveLength(10);
  });
});

describe('describeRecurrence', () => {
  it('returns empty string for null input', () => {
    expect(describeRecurrence(null)).toBe('');
    expect(describeRecurrence(undefined)).toBe('');
    expect(describeRecurrence('')).toBe('');
  });

  it('describes daily frequency', () => {
    expect(describeRecurrence('RRULE:FREQ=DAILY')).toBe('Daily');
  });

  it('describes weekly frequency', () => {
    expect(describeRecurrence('RRULE:FREQ=WEEKLY')).toBe('Weekly');
  });

  it('describes monthly frequency', () => {
    expect(describeRecurrence('RRULE:FREQ=MONTHLY')).toBe('Monthly');
  });

  it('describes interval', () => {
    expect(describeRecurrence('RRULE:FREQ=DAILY;INTERVAL=2')).toBe('Every 2 days');
  });

  it('describes BYDAY', () => {
    expect(describeRecurrence('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('Weekly on Mon, Wed, Fri');
  });

  it('describes COUNT', () => {
    expect(describeRecurrence('RRULE:FREQ=DAILY;COUNT=5')).toBe('Daily, 5 times');
  });

  it('describes UNTIL', () => {
    const result = describeRecurrence('RRULE:FREQ=DAILY;UNTIL=20260315');
    expect(result).toContain('until');
    expect(result).toContain('2026-03-15');
  });
});
