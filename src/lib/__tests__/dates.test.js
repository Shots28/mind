import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toLocalDateString, getUserTimezone, TIMEZONE_OPTIONS } from '../dates';

describe('toLocalDateString', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('formats a date as YYYY-MM-DD', () => {
    const date = new Date(2026, 2, 15); // March 15, 2026
    const result = toLocalDateString(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2026-03-15');
  });

  it('pads single-digit months and days', () => {
    const date = new Date(2026, 0, 5); // January 5
    const result = toLocalDateString(date);
    expect(result).toBe('2026-01-05');
  });

  it('defaults to current date when called with no arguments', () => {
    const result = toLocalDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses timezone override from localStorage when set', () => {
    localStorage.setItem('zenith_timezone_override', 'America/New_York');
    // Use a UTC midnight date that would be previous day in US Eastern
    const date = new Date('2026-03-15T03:00:00Z');
    const result = toLocalDateString(date);
    // In ET (UTC-4 in March), 03:00 UTC = 23:00 ET on March 14
    expect(result).toBe('2026-03-14');
  });

  it('falls through to default format for invalid timezone', () => {
    localStorage.setItem('zenith_timezone_override', 'Invalid/Timezone');
    const date = new Date(2026, 2, 15);
    const result = toLocalDateString(date);
    expect(result).toBe('2026-03-15');
  });
});

describe('getUserTimezone', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns browser timezone when no override is set', () => {
    const result = getUserTimezone();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns override timezone when set in localStorage', () => {
    localStorage.setItem('zenith_timezone_override', 'Europe/London');
    expect(getUserTimezone()).toBe('Europe/London');
  });
});

describe('TIMEZONE_OPTIONS', () => {
  it('is a non-empty array of strings', () => {
    expect(Array.isArray(TIMEZONE_OPTIONS)).toBe(true);
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(20);
    TIMEZONE_OPTIONS.forEach(tz => {
      expect(typeof tz).toBe('string');
      expect(tz).toContain('/');
    });
  });
});
