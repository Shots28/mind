import { useEffect, useMemo } from 'react';
import { useHabits, isHabitDueOnDate } from '../../contexts/HabitContext';
import { useContexts } from '../../contexts/ContextContext';
import { Flame } from 'lucide-react';
import './Habits.css';

export default function HabitList({ compact = false, date }) {
  const { habits, todayHabits, todayLogs, toggleHabitLog, getStreak, fetchLogsForDate, getLogsForDate } = useHabits();
  const { activeContext } = useContexts();

  const today = new Date().toISOString().split('T')[0];
  const isToday = !date || date === today;

  useEffect(() => {
    if (!isToday && date) fetchLogsForDate(date);
  }, [date, isToday, fetchLogsForDate]);

  const dueHabits = useMemo(() => {
    if (isToday) return todayHabits;
    return habits.filter(h => isHabitDueOnDate(h, date));
  }, [isToday, todayHabits, habits, date]);

  const logs = isToday ? todayLogs : getLogsForDate(date);

  const filtered = activeContext === 'all'
    ? dueHabits
    : dueHabits.filter(h => h.context_id === activeContext);

  if (filtered.length === 0) return null;

  return (
    <div className={`habit-list ${compact ? 'compact' : ''}`}>
      {filtered.map(habit => {
        const done = logs.some(l => l.habit_id === habit.id);
        const streak = getStreak(habit.id);
        return (
          <div key={habit.id} className={`habit-item ${done ? 'completed' : ''}`}>
            <div
              className={`habit-toggle ${done ? 'checked' : ''} ${!isToday ? 'read-only' : ''}`}
              style={{ borderColor: habit.color, background: done ? habit.color : 'transparent' }}
              onClick={isToday ? () => toggleHabitLog(habit.id) : undefined}
            />
            <div className="habit-info">
              <span className="habit-title">{habit.title}</span>
              {habit.contexts?.name && !compact && (
                <span className="habit-context" style={{ color: habit.contexts.color }}>{habit.contexts.name}</span>
              )}
            </div>
            {streak > 0 && (
              <div className="habit-streak" style={{ color: habit.color }}>
                <Flame size={14} />
                <span>{streak}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
