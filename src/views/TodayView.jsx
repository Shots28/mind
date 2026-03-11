import { useState, useMemo } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import { useHabits } from '../contexts/HabitContext';
import TaskList from '../components/Tasks/TaskList';
import HabitList from '../components/Habits/HabitList';
import HabitStats from '../components/Habits/HabitStats';
import CalendarWidget from '../components/Calendar/CalendarWidget';
import JournalWidget from '../components/Journal/JournalWidget';
import TaskForm from '../components/Tasks/TaskForm';
import Modal from '../components/Common/Modal';
import './Views.css';

export default function TodayView() {
  const { mustDoTasks, upNextTasks, tasks } = useTasks();
  const { activeContext } = useContexts();
  const { todayHabits } = useHabits();
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState('must_do');

  const today = new Date().toISOString().split('T')[0];

  const filteredMustDo = useMemo(() => {
    let filtered = mustDoTasks.filter(t => !t.due_date || t.due_date <= today);
    if (activeContext !== 'all') filtered = filtered.filter(t => t.context_id === activeContext);
    return filtered;
  }, [mustDoTasks, activeContext, today]);

  const filteredUpNext = useMemo(() => {
    let filtered = upNextTasks.filter(t => !t.due_date || t.due_date <= today);
    if (activeContext !== 'all') filtered = filtered.filter(t => t.context_id === activeContext);
    return filtered;
  }, [upNextTasks, activeContext, today]);
  const progress = useMemo(() => {
    const relevantTasks = activeContext === 'all' ? tasks : tasks.filter(t => t.context_id === activeContext);
    const todayCompleted = relevantTasks.filter(t => t.is_completed && t.completed_at && t.completed_at.startsWith(today)).length;
    const todayMustDo = relevantTasks.filter(t => t.category === 'must_do').length;
    const total = todayMustDo || 1;
    return { completed: todayCompleted, total: todayMustDo, percent: Math.round((todayCompleted / total) * 100) };
  }, [tasks, activeContext, today]);

  const handleAddTask = (category) => {
    setDefaultCategory(category);
    setShowTaskForm(true);
  };

  return (
    <div className="today-view">
      <div className="today-main-column">
        <div className="progress-banner glass-panel">
          <div className="progress-info">
            <h2>
              {progress.completed === 0
                ? "Ready to start your day"
                : `You've completed ${progress.completed} task${progress.completed !== 1 ? 's' : ''} today`}
            </h2>
            <p>
              {progress.total === 0
                ? "Add some Must-Do tasks to track your progress."
                : `${progress.percent}% through your Must-Do list.`}
            </p>
          </div>
          <div className="progress-ring">
            <svg viewBox="0 0 36 36">
              <path
                className="progress-ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="3"
              />
              <path
                className="progress-ring-fill"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="var(--accent-color)"
                strokeWidth="3"
                strokeDasharray={`${progress.percent}, 100`}
                strokeLinecap="round"
              />
              <text x="18" y="20.5" className="progress-text" textAnchor="middle" fill="var(--text-primary)" fontSize="8" fontWeight="600">
                {progress.percent}%
              </text>
            </svg>
          </div>
        </div>

        {todayHabits.length > 0 && (
          <div className="today-habits-section glass-panel" style={{ padding: '20px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="section-title">Daily Routine</h3>
              <HabitStats compact />
            </div>
            <HabitList compact />
          </div>
        )}

        <TaskList title="Must Do" tasks={filteredMustDo} category="must_do" onAdd={() => handleAddTask('must_do')} />
        <div style={{ height: '24px' }} />
        <TaskList title="Up Next" tasks={filteredUpNext} category="up_next" onAdd={() => handleAddTask('up_next')} />
      </div>

      <div className="today-side-column">
        <CalendarWidget />
        <JournalWidget />
      </div>

      <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
        <TaskForm defaultCategory={defaultCategory} defaultContextId={activeContext !== 'all' ? activeContext : ''} onClose={() => setShowTaskForm(false)} />
      </Modal>
    </div>
  );
}
