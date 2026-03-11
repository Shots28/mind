import { useMemo } from 'react';
import { useHabits } from '../../contexts/HabitContext';
import { Flame, TrendingUp } from 'lucide-react';

export default function HabitStats({ compact = false }) {
  const { todayProgress, todayHabits, weekLogs } = useHabits();

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
        total: todayHabits.length || 1,
      });
    }
    return days;
  }, [weekLogs, todayHabits]);

  if (todayHabits.length === 0) return null;

  const maxCompleted = Math.max(...weekData.map(d => d.completed), 1);

  return (
    <div className={`habit-stats ${compact ? 'compact' : ''}`}>
      <div className="habit-stats-summary">
        <div className="habit-stat">
          <Flame size={16} className="habit-stat-icon" />
          <span className="habit-stat-value">{todayProgress.completed}/{todayProgress.total}</span>
          <span className="habit-stat-label">today</span>
        </div>
        <div className="habit-stat">
          <TrendingUp size={16} className="habit-stat-icon" />
          <span className="habit-stat-value">{todayProgress.percent}%</span>
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
