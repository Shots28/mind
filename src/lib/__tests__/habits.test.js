import { describe, it, expect } from 'vitest';

// isHabitDueOnDay is not exported, so we replicate it here for testing.
// This matches the logic in HabitContext.jsx
function isHabitDueOnDay(habit, day) {
  switch (habit.frequency) {
    case 'daily': return true;
    case 'weekdays': return day >= 1 && day <= 5;
    case 'weekends': return day === 0 || day === 6;
    case 'custom': return habit.custom_days?.includes(day) ?? false;
    default: return true;
  }
}

describe('isHabitDueOnDay', () => {
  it('daily habits are due every day', () => {
    const habit = { frequency: 'daily' };
    for (let day = 0; day <= 6; day++) {
      expect(isHabitDueOnDay(habit, day)).toBe(true);
    }
  });

  it('weekday habits are due Mon-Fri only', () => {
    const habit = { frequency: 'weekdays' };
    expect(isHabitDueOnDay(habit, 0)).toBe(false); // Sunday
    expect(isHabitDueOnDay(habit, 1)).toBe(true);  // Monday
    expect(isHabitDueOnDay(habit, 2)).toBe(true);  // Tuesday
    expect(isHabitDueOnDay(habit, 3)).toBe(true);  // Wednesday
    expect(isHabitDueOnDay(habit, 4)).toBe(true);  // Thursday
    expect(isHabitDueOnDay(habit, 5)).toBe(true);  // Friday
    expect(isHabitDueOnDay(habit, 6)).toBe(false); // Saturday
  });

  it('weekend habits are due Sat-Sun only', () => {
    const habit = { frequency: 'weekends' };
    expect(isHabitDueOnDay(habit, 0)).toBe(true);  // Sunday
    expect(isHabitDueOnDay(habit, 1)).toBe(false); // Monday
    expect(isHabitDueOnDay(habit, 5)).toBe(false); // Friday
    expect(isHabitDueOnDay(habit, 6)).toBe(true);  // Saturday
  });

  it('custom habits are due on specified days', () => {
    const habit = { frequency: 'custom', custom_days: [1, 3, 5] }; // Mon, Wed, Fri
    expect(isHabitDueOnDay(habit, 0)).toBe(false);
    expect(isHabitDueOnDay(habit, 1)).toBe(true);
    expect(isHabitDueOnDay(habit, 2)).toBe(false);
    expect(isHabitDueOnDay(habit, 3)).toBe(true);
    expect(isHabitDueOnDay(habit, 4)).toBe(false);
    expect(isHabitDueOnDay(habit, 5)).toBe(true);
    expect(isHabitDueOnDay(habit, 6)).toBe(false);
  });

  it('custom habits with no custom_days returns false', () => {
    const habit = { frequency: 'custom' };
    expect(isHabitDueOnDay(habit, 1)).toBe(false);
  });

  it('custom habits with empty custom_days returns false', () => {
    const habit = { frequency: 'custom', custom_days: [] };
    expect(isHabitDueOnDay(habit, 1)).toBe(false);
  });

  it('unknown frequency defaults to true', () => {
    const habit = { frequency: 'unknown_value' };
    expect(isHabitDueOnDay(habit, 3)).toBe(true);
  });

  it('undefined frequency defaults to true', () => {
    const habit = {};
    expect(isHabitDueOnDay(habit, 3)).toBe(true);
  });
});
