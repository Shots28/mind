import { useState, useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import { useHabits } from '../contexts/HabitContext';
import { isHabitDueOnDate } from '../contexts/HabitContext';
import TaskList from '../components/Tasks/TaskList';
import { TaskItem } from '../components/Tasks/TaskList';
import HabitList from '../components/Habits/HabitList';
import HabitStats from '../components/Habits/HabitStats';
import CalendarWidget from '../components/Calendar/CalendarWidget';
import JournalWidget from '../components/Journal/JournalWidget';
import TaskForm from '../components/Tasks/TaskForm';
import Modal from '../components/Common/Modal';
import './Views.css';

export default function TodayView() {
  const { mustDoTasks, upNextTasks, tasks, updateTask } = useTasks();
  const { activeContext } = useContexts();
  const { habits } = useHabits();
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState('must_do');
  const [activeTask, setActiveTask] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const isToday = selectedDate === today;

  const shiftDate = (dir) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const handleDragStart = (event) => {
    const task = event.active.data.current?.task;
    setActiveTask(task || null);
  };

  const handleDragEnd = (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const task = active.data.current?.task;
    if (!task) return;
    if (task.category !== over.id) {
      updateTask(task.id, { category: over.id });
    }
  };

  const filteredMustDo = useMemo(() => {
    let filtered = mustDoTasks.filter(t => !t.due_date || t.due_date <= selectedDate);
    if (activeContext !== 'all') filtered = filtered.filter(t => t.context_id === activeContext);
    return filtered;
  }, [mustDoTasks, activeContext, selectedDate]);

  const filteredUpNext = useMemo(() => {
    let filtered = upNextTasks.filter(t => !t.due_date || t.due_date <= selectedDate);
    if (activeContext !== 'all') filtered = filtered.filter(t => t.context_id === activeContext);
    return filtered;
  }, [upNextTasks, activeContext, selectedDate]);

  const progress = useMemo(() => {
    const relevantTasks = activeContext === 'all' ? tasks : tasks.filter(t => t.context_id === activeContext);
    const dateCompleted = relevantTasks.filter(t => t.is_completed && t.completed_at && t.completed_at.startsWith(selectedDate)).length;
    const dateMustDo = relevantTasks.filter(t => t.category === 'must_do').length;
    const total = dateMustDo || 1;
    return { completed: dateCompleted, total: dateMustDo, percent: Math.round((dateCompleted / total) * 100) };
  }, [tasks, activeContext, selectedDate]);

  const hasHabitsForDate = useMemo(() => {
    return habits.some(h => isHabitDueOnDate(h, selectedDate));
  }, [habits, selectedDate]);

  const handleAddTask = (category) => {
    setDefaultCategory(category);
    setShowTaskForm(true);
  };

  return (
    <div className="today-view">
      <div className="today-main-column">
        <div className="day-nav">
          <button className="btn-icon day-nav-arrow" onClick={() => shiftDate(-1)}>
            <ChevronLeft size={20} />
          </button>
          <h1 className="day-nav-label">{dateLabel}</h1>
          <button className="btn-icon day-nav-arrow" onClick={() => shiftDate(1)}>
            <ChevronRight size={20} />
          </button>
          {!isToday && (
            <button className="filter-btn day-nav-today" onClick={() => setSelectedDate(today)}>
              Today
            </button>
          )}
        </div>

        <div className="progress-banner glass-panel">
          <div className="progress-info">
            <h2>
              {progress.completed === 0
                ? (isToday ? "Ready to start your day" : "No tasks completed")
                : `${progress.completed} task${progress.completed !== 1 ? 's' : ''} completed`}
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

        {hasHabitsForDate && (
          <div className="today-habits-section glass-panel" style={{ padding: '20px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 className="section-title">Daily Routine</h3>
              <HabitStats compact date={selectedDate} />
            </div>
            <HabitList compact date={selectedDate} />
          </div>
        )}

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <TaskList title="Must Do" tasks={filteredMustDo} category="must_do" defaultDueDate={selectedDate} draggable droppableId="must_do" onAdd={() => handleAddTask('must_do')} />
          <div style={{ height: '24px' }} />
          <TaskList title="Up Next" tasks={filteredUpNext} category="up_next" defaultDueDate={selectedDate} draggable droppableId="up_next" onAdd={() => handleAddTask('up_next')} />
          <DragOverlay>
            {activeTask ? <div className="drag-overlay"><TaskItem task={activeTask} /></div> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="today-side-column">
        <CalendarWidget selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        <JournalWidget date={selectedDate} />
      </div>

      <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
        <TaskForm defaultCategory={defaultCategory} defaultContextId={activeContext !== 'all' ? activeContext : ''} defaultDueDate={selectedDate} onClose={() => setShowTaskForm(false)} />
      </Modal>
    </div>
  );
}
