import { useState, useMemo, useCallback } from 'react';
import useCalendar from '../hooks/useCalendar';
import { useEvents } from '../contexts/EventContext';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import { useCategories } from '../contexts/CategoryContext';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import TaskForm from '../components/Tasks/TaskForm';
import InlineDatePicker from '../components/Tasks/InlineDatePicker';
import { toLocalDateString } from '../lib/dates';
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock,
  Trash2, Edit3, Check, CheckSquare
} from 'lucide-react';
import './CalendarView.css';

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
const VIEW_MODES = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

export default function CalendarView() {
  const calendar = useCalendar();
  const { events, createEvent, deleteEvent } = useEvents();
  const { tasks, createTask, updateTask, toggleComplete } = useTasks();
  const { activeContext } = useContexts();
  const { categories } = useCategories();
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()));
  const [viewMode, setViewMode] = useState('month');
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', all_day: true });
  const [editingTask, setEditingTask] = useState(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');

  const filteredEvents = useMemo(() => {
    if (activeContext === 'all') return events;
    return events.filter(e => e.context_id === activeContext);
  }, [events, activeContext]);

  const filteredTasks = useMemo(() => {
    if (activeContext === 'all') return tasks;
    return tasks.filter(t => t.context_id === activeContext);
  }, [tasks, activeContext]);

  const getEventsForDay = useCallback((dateString) => {
    return filteredEvents.filter(e => e.start_date && e.start_date.startsWith(dateString));
  }, [filteredEvents]);

  const getTasksForDay = useCallback((dateString) => {
    return filteredTasks.filter(t => t.due_date === dateString)
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
  }, [filteredTasks]);

  const handleDayClick = (dateString) => {
    setSelectedDate(dateString);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.title.trim()) return;
    try {
      await createEvent({
        title: newEvent.title,
        start_date: new Date(selectedDate + 'T12:00:00').toISOString(),
        all_day: newEvent.all_day,
        context_id: activeContext !== 'all' ? activeContext : null,
      });
      setNewEvent({ title: '', all_day: true });
      setShowEventForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleQuickAddTask = async (e) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    try {
      await createTask({
        title: quickTaskTitle.trim(),
        due_date: selectedDate,
        category: categories[0]?.id || 'must_do',
        context_id: activeContext !== 'all' ? activeContext : null,
      });
      setQuickTaskTitle('');
    } catch (err) {
      console.error(err);
    }
  };

  // Week computation
  const weekDays = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    const dayOfWeek = d.getDay();
    const sunday = new Date(d);
    sunday.setDate(d.getDate() - dayOfWeek);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + i);
      const ds = toLocalDateString(date);
      days.push({
        date,
        dateString: ds,
        day: date.getDate(),
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        isToday: ds === toLocalDateString(new Date()),
        isSelected: ds === selectedDate,
      });
    }
    return days;
  }, [selectedDate]);

  const goToPrevWeek = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    setSelectedDate(toLocalDateString(d));
  };

  const goToNextWeek = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    setSelectedDate(toLocalDateString(d));
  };

  const goToPrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toLocalDateString(d));
  };

  const goToNextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(toLocalDateString(d));
  };

  const goToToday = () => {
    const today = toLocalDateString(new Date());
    setSelectedDate(today);
    calendar.goToToday();
  };

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const selectedDayTasks = selectedDate ? getTasksForDay(selectedDate) : [];
  const selectedDateFormatted = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  // Week title
  const weekTitle = useMemo(() => {
    if (weekDays.length === 0) return '';
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${start.toLocaleDateString('en-US', { month: 'short' })} ${start.getDate()} - ${end.toLocaleDateString('en-US', { month: 'short' })} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekDays]);

  const DaySidebar = () => (
    <div className="calendar-day-detail glass-panel">
      {selectedDate ? (
        <>
          <div className="day-detail-header">
            <h3>{selectedDateFormatted}</h3>
            <div className="day-detail-actions">
              <button className="btn-icon" onClick={() => setShowEventForm(true)} title="Add event"><Plus size={18} /></button>
              <button className="btn-icon" onClick={() => setShowTaskForm(true)} title="Add task"><CheckSquare size={18} /></button>
            </div>
          </div>

          {selectedDayEvents.length > 0 && (
            <div className="day-section">
              <h4 className="day-section-title"><Calendar size={14} /> Events</h4>
              <div className="day-items">
                {selectedDayEvents.map(event => (
                  <div key={event.id} className="day-item event-item">
                    <Calendar size={14} />
                    <span>{event.title}</span>
                    <button className="btn-icon" onClick={() => deleteEvent(event.id)}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedDayTasks.length > 0 && (
            <div className="day-section">
              <h4 className="day-section-title"><Clock size={14} /> Tasks</h4>
              <div className="day-items">
                {selectedDayTasks.map(task => (
                  <div key={task.id} className="day-item task-item-cal">
                    <div
                      className={`cal-task-checkbox ${task.is_completed ? 'checked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleComplete(task.id); }}
                    >
                      {task.is_completed && <Check size={12} />}
                    </div>
                    <span className={task.is_completed ? 'completed-text' : ''} onClick={() => setEditingTask(task)}>{task.title}</span>
                    <InlineDatePicker value={task.due_date} onChange={(d) => updateTask(task.id, { due_date: d || null })}>
                      <button className="btn-icon" onClick={(e) => e.stopPropagation()}><Calendar size={14} /></button>
                    </InlineDatePicker>
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setEditingTask(task); }}><Edit3 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 && (
            <p className="no-items-text">No events or tasks for this day.</p>
          )}

          <form className="cal-quick-add" onSubmit={handleQuickAddTask}>
            <Plus size={16} className="cal-quick-add-icon" />
            <input
              type="text"
              className="cal-quick-add-input"
              placeholder="Quick add task..."
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
            />
          </form>
        </>
      ) : (
        <EmptyState icon={Calendar} title="Select a day" description="Click a date to see events and tasks." />
      )}
    </div>
  );

  return (
    <div className="calendar-view">
      {viewMode === 'month' && (
        <>
          <div className="calendar-main">
            <div className="calendar-nav glass-panel">
              <button className="btn-icon" onClick={calendar.goToPrevMonth}><ChevronLeft size={20} /></button>
              <h2 className="calendar-month-title">{calendar.monthName} {calendar.year}</h2>
              <button className="btn-icon" onClick={calendar.goToNextMonth}><ChevronRight size={20} /></button>
              <button className="btn-icon calendar-today-btn" onClick={goToToday}>Today</button>
              <div className="view-mode-toggle">
                {VIEW_MODES.map(m => (
                  <button key={m.id} className={`view-mode-btn ${viewMode === m.id ? 'active' : ''}`} onClick={() => setViewMode(m.id)}>{m.label}</button>
                ))}
              </div>
            </div>

            <div className="calendar-grid-full glass-panel">
              {dayHeaders.map(d => (
                <div key={d} className="calendar-day-header">{d}</div>
              ))}
              {Array.from({ length: calendar.emptySlots }).map((_, i) => (
                <div key={`empty-${i}`} className="calendar-cell empty" />
              ))}
              {calendar.days.map(day => {
                const dayEvents = getEventsForDay(day.dateString);
                const dayTasks = getTasksForDay(day.dateString);
                const hasItems = dayEvents.length > 0 || dayTasks.length > 0;
                const isSelected = selectedDate === day.dateString;
                return (
                  <div
                    key={day.day}
                    className={`calendar-cell ${day.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasItems ? 'has-items' : ''}`}
                    onClick={() => handleDayClick(day.dateString)}
                  >
                    <span className="cell-day-number">{day.day}</span>
                    {hasItems && (
                      <div className="cell-dots">
                        {dayEvents.length > 0 && <span className="dot event-dot" />}
                        {dayTasks.length > 0 && <span className="dot task-dot" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="calendar-sidebar">
            <DaySidebar />
          </div>
        </>
      )}

      {viewMode === 'week' && (
        <div className="calendar-week-layout">
          <div className="calendar-nav glass-panel">
            <button className="btn-icon" onClick={goToPrevWeek}><ChevronLeft size={20} /></button>
            <h2 className="calendar-month-title">{weekTitle}</h2>
            <button className="btn-icon" onClick={goToNextWeek}><ChevronRight size={20} /></button>
            <button className="btn-icon calendar-today-btn" onClick={goToToday}>Today</button>
            <div className="view-mode-toggle">
              {VIEW_MODES.map(m => (
                <button key={m.id} className={`view-mode-btn ${viewMode === m.id ? 'active' : ''}`} onClick={() => setViewMode(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>

          <div className="week-grid">
            {weekDays.map(day => {
              const dayEvents = getEventsForDay(day.dateString);
              const dayTasks = getTasksForDay(day.dateString);
              return (
                <div
                  key={day.dateString}
                  className={`week-day-column glass-panel ${day.isToday ? 'today' : ''} ${day.isSelected ? 'selected' : ''}`}
                  onClick={() => handleDayClick(day.dateString)}
                >
                  <div className="week-day-header">
                    <span className="week-day-name">{day.dayName}</span>
                    <span className={`week-day-number ${day.isToday ? 'today-number' : ''}`}>{day.day}</span>
                  </div>
                  <div className="week-day-items">
                    {dayEvents.map(event => (
                      <div key={event.id} className="week-item week-event">
                        <Calendar size={12} />
                        <span>{event.title}</span>
                      </div>
                    ))}
                    {dayTasks.map(task => (
                      <div key={task.id} className="week-item week-task">
                        <div
                          className={`cal-task-checkbox small ${task.is_completed ? 'checked' : ''}`}
                          onClick={(e) => { e.stopPropagation(); toggleComplete(task.id); }}
                        >
                          {task.is_completed && <Check size={10} />}
                        </div>
                        <span className={task.is_completed ? 'completed-text' : ''}>{task.title}</span>
                      </div>
                    ))}
                    {dayEvents.length === 0 && dayTasks.length === 0 && (
                      <span className="week-empty">No items</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="calendar-sidebar">
            <DaySidebar />
          </div>
        </div>
      )}

      {viewMode === 'day' && (
        <div className="calendar-day-layout">
          <div className="calendar-nav glass-panel">
            <button className="btn-icon" onClick={goToPrevDay}><ChevronLeft size={20} /></button>
            <h2 className="calendar-month-title">{selectedDateFormatted}</h2>
            <button className="btn-icon" onClick={goToNextDay}><ChevronRight size={20} /></button>
            <button className="btn-icon calendar-today-btn" onClick={goToToday}>Today</button>
            <div className="view-mode-toggle">
              {VIEW_MODES.map(m => (
                <button key={m.id} className={`view-mode-btn ${viewMode === m.id ? 'active' : ''}`} onClick={() => setViewMode(m.id)}>{m.label}</button>
              ))}
            </div>
          </div>

          <div className="day-full-view">
            <div className="day-full-section glass-panel">
              <div className="day-full-section-header">
                <h3><Calendar size={16} /> Events</h3>
                <button className="btn-icon" onClick={() => setShowEventForm(true)}><Plus size={18} /></button>
              </div>
              {selectedDayEvents.length > 0 ? (
                <div className="day-items">
                  {selectedDayEvents.map(event => (
                    <div key={event.id} className="day-item event-item">
                      <Calendar size={14} />
                      <span>{event.title}</span>
                      {event.all_day ? (
                        <span className="event-badge">All day</span>
                      ) : event.start_date && (
                        <span className="event-badge">{new Date(event.start_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                      <button className="btn-icon" onClick={() => deleteEvent(event.id)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-items-text">No events scheduled.</p>
              )}
            </div>

            <div className="day-full-section glass-panel">
              <div className="day-full-section-header">
                <h3><CheckSquare size={16} /> Tasks</h3>
                <button className="btn-icon" onClick={() => setShowTaskForm(true)}><Plus size={18} /></button>
              </div>
              {selectedDayTasks.length > 0 ? (
                <div className="day-items">
                  {selectedDayTasks.map(task => (
                    <div key={task.id} className="day-item task-item-cal">
                      <div
                        className={`cal-task-checkbox ${task.is_completed ? 'checked' : ''}`}
                        onClick={() => toggleComplete(task.id)}
                      >
                        {task.is_completed && <Check size={12} />}
                      </div>
                      <div className="day-task-content">
                        <span className={task.is_completed ? 'completed-text' : ''} onClick={() => setEditingTask(task)}>{task.title}</span>
                        <div className="day-task-meta">
                          {task.priority && task.priority !== 'normal' && (
                            <span className={`task-priority ${task.priority}`}>{task.priority}</span>
                          )}
                          {task.contexts?.name && (
                            <span className="task-context" style={{ color: task.contexts.color }}>{task.contexts.name}</span>
                          )}
                          {task.projects?.name && (
                            <span className="task-project">{task.projects.name}</span>
                          )}
                        </div>
                      </div>
                      <button className="btn-icon" onClick={() => setEditingTask(task)}><Edit3 size={14} /></button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-items-text">No tasks due.</p>
              )}
              <form className="cal-quick-add" onSubmit={handleQuickAddTask}>
                <Plus size={16} className="cal-quick-add-icon" />
                <input
                  type="text"
                  className="cal-quick-add-input"
                  placeholder="Quick add task..."
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                />
              </form>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={showEventForm} onClose={() => setShowEventForm(false)} title="New Event" size="small">
        <form onSubmit={handleCreateEvent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="text"
            className="input-field"
            placeholder="Event title"
            value={newEvent.title}
            onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
            autoFocus
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={newEvent.all_day}
              onChange={(e) => setNewEvent(prev => ({ ...prev, all_day: e.target.checked }))}
            />
            All day event
          </label>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>Create Event</button>
        </form>
      </Modal>

      <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
        <TaskForm onClose={() => setShowTaskForm(false)} defaultDueDate={selectedDate} />
      </Modal>

      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task">
        <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />
      </Modal>
    </div>
  );
}
