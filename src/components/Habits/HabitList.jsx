import { useHabits } from '../../contexts/HabitContext';
import { useContexts } from '../../contexts/ContextContext';
import { Flame } from 'lucide-react';
import './Habits.css';

export default function HabitList({ compact = false }) {
  const { todayHabits, todayLogs, toggleHabitLog, getStreak } = useHabits();
  const { activeContext } = useContexts();

  const filtered = activeContext === 'all'
    ? todayHabits
    : todayHabits.filter(h => h.context_id === activeContext);

  if (filtered.length === 0) return null;

  return (
    <div className={`habit-list ${compact ? 'compact' : ''}`}>
      {filtered.map(habit => {
        const done = todayLogs.some(l => l.habit_id === habit.id);
        const streak = getStreak(habit.id);
        return (
          <div key={habit.id} className={`habit-item ${done ? 'completed' : ''}`}>
            <div
              className={`habit-toggle ${done ? 'checked' : ''}`}
              style={{ borderColor: habit.color, background: done ? habit.color : 'transparent' }}
              onClick={() => toggleHabitLog(habit.id)}
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
