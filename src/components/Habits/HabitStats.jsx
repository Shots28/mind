import { useEffect, useMemo } from 'react';
import { useHabits, isHabitDueOnDate } from '../../contexts/HabitContext';
import { Flame, TrendingUp } from 'lucide-react';

export default function HabitStats({ compact = false, date }) {
  const { habits, todayProgress, todayHabits, weekLogs, fetchLogsForDate, getLogsForDate } = useHabits();

  const today = new Date().toISOString().split('T')[0];
  const isToday = !date || date === today;

  useEffect(() => {
    if (!isToday && date) fetchLogsForDate(date);
  }, [date, isToday, fetchLogsForDate]);

  const dueHabits = useMemo(() => {
    if (isToday) return todayHabits;
    return habits.filter(h => isHabitDueOnDate(h, date));
  }, [isToday, todayHabits, habits, date]);

  const progress = useMemo(() => {
    if (isToday) return todayProgress;
    const logs = getLogsForDate(date);
    const total = dueHabits.length;
    const completed = dueHabits.filter(h => logs.some(l => l.habit_id === h.id)).length;
    return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
  }, [isToday, todayProgress, date, dueHabits, getLogsForDate]);

  const weekData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = weekLogs.filter(l => l.date === dateStr);
      const completed = new Set(dayLogs.map(l => l.habit_id)).size;
      days.push({
        label: d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
        completed,
        total: dueHabits.length || 1,
      });
    }
    return days;
  }, [weekLogs, dueHabits]);

  if (dueHabits.length === 0) return null;

  const maxCompleted = Math.max(...weekData.map(d => d.completed), 1);

  return (
    <div className={`habit-stats ${compact ? 'compact' : ''}`}>
      <div className="habit-stats-summary">
        <div className="habit-stat">
          <Flame size={16} className="habit-stat-icon" />
          <span className="habit-stat-value">{progress.completed}/{progress.total}</span>
          <span className="habit-stat-label">{isToday ? 'today' : 'done'}</span>
        </div>
        <div className="habit-stat">
          <TrendingUp size={16} className="habit-stat-icon" />
          <span className="habit-stat-value">{progress.percent}%</span>
          <span className="habit-stat-label">done</span>
        </div>
      </div>
      {!compact && (
        <div className="habit-week-chart">
          {weekData.map((day, i) => (
            <div key={i} className="habit-bar-col">
              <div className="habit-bar-track">
                <div
                  className="habit-bar-fill"
                  style={{ height: `${(day.completed / maxCompleted) * 100}%` }}
                />
              </div>
              <span className="habit-bar-label">{day.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
