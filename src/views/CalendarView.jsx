import { useState, useMemo, useCallback } from 'react';
import useCalendar from '../hooks/useCalendar';
import { useEvents } from '../contexts/EventContext';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import { useCategories } from '../contexts/CategoryContext';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import TaskForm from '../components/Tasks/TaskForm';
import EventForm from '../components/Events/EventForm';
import InlineDatePicker from '../components/Tasks/InlineDatePicker';
import { toLocalDateString } from '../lib/dates';
import { isGoogleEvent, formatTimeRange } from '../lib/googleSync';
import RecurrenceActionDialog from '../components/Events/RecurrenceActionDialog';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import { useToast } from '../components/Common/Toast';
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock,
  Trash2, Edit3, Check, CheckSquare, Cloud, Lock, Repeat
} from 'lucide-react';
import './CalendarView.css';

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };
const VIEW_MODES = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
];

function DaySidebar({ selectedDate, selectedDateFormatted, events: dayEvents, tasks: dayTasks, onAddEvent, onAddTask, onEventClick, onDeleteEvent, onToggleComplete, onEditTask, onUpdateTask, quickTaskTitle, setQuickTaskTitle, onQuickAddTask }) {
  return (
    <div className="calendar-day-detail glass-panel">
      {selectedDate ? (
        <>
          <div className="day-detail-header">
            <h3>{selectedDateFormatted}</h3>
            <div className="day-detail-actions">
              <button className="btn-icon" onClick={onAddEvent} title="Add event"><Plus size={18} /></button>
              <button className="btn-icon" onClick={onAddTask} title="Add task"><CheckSquare size={18} /></button>
            </div>
          </div>

          {dayEvents.length > 0 && (
            <div className="day-section">
              <h4 className="day-section-title"><Calendar size={14} /> Events</h4>
              <div className="day-items">
                {dayEvents.map(event => (
                  <div key={event.id} className="day-item event-item" onClick={() => onEventClick(event)}>
                    {isGoogleEvent(event) ? <Cloud size={14} className="event-icon-google" /> : <Calendar size={14} />}
                    <div className="day-event-content">
                      <span>{event.title}</span>
                      {!event.all_day && (
                        <span className="day-event-time">{formatTimeRange(event.start_date, event.end_date, false)}</span>
                      )}
                    </div>
                    {(event.recurrence_rule || event._isRecurrenceInstance) && <Repeat size={12} className="event-recurrence-icon" />}
                    {event.is_read_only ? (
                      <Lock size={12} className="event-readonly-icon" />
                    ) : (
                      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onDeleteEvent(event); }}><Trash2 size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {dayTasks.length > 0 && (
            <div className="day-section">
              <h4 className="day-section-title"><Clock size={14} /> Tasks</h4>
              <div className="day-items">
                {dayTasks.map(task => (
                  <div key={task.id} className="day-item task-item-cal">
                    <div
                      className={`cal-task-checkbox ${task.is_completed ? 'checked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id); }}
                    >
                      {task.is_completed && <Check size={12} />}
                    </div>
                    <span className={task.is_completed ? 'completed-text' : ''} onClick={() => onEditTask(task)}>{task.title}</span>
                    <InlineDatePicker value={task.due_date} onChange={(d) => onUpdateTask(task.id, { due_date: d || null })}>
                      <button className="btn-icon" onClick={(e) => e.stopPropagation()}><Calendar size={14} /></button>
                    </InlineDatePicker>
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onEditTask(task); }}><Edit3 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dayEvents.length === 0 && dayTasks.length === 0 && (
            <p className="no-items-text">No events or tasks for this day.</p>
          )}

          <form className="cal-quick-add" onSubmit={onQuickAddTask}>
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
}

export default function CalendarView() {
  const calendar = useCalendar();
  const { events, createEvent, updateEvent, deleteEvent, getExpandedEvents } = useEvents();
  const { tasks, createTask, updateTask, toggleComplete } = useTasks();
  const { activeContext } = useContexts();
  const { categories } = useCategories();
  const { showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(toLocalDateString(new Date()));
  const [viewMode, setViewMode] = useState('month');
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [recurrenceAction, setRecurrenceAction] = useState(null); // { event, action: 'edit'|'delete' }
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Compute visible date range for recurrence expansion
  const visibleRange = useMemo(() => {
    const sel = new Date(selectedDate + 'T12:00:00');
    if (viewMode === 'month') {
      const start = new Date(calendar.year, calendar.month, 1);
      const end = new Date(calendar.year, calendar.month + 1, 0);
      return { start: toLocalDateString(start), end: toLocalDateString(end) };
    }
    if (viewMode === 'week') {
      const dayOfWeek = sel.getDay();
      const sunday = new Date(sel);
      sunday.setDate(sel.getDate() - dayOfWeek);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      return { start: toLocalDateString(sunday), end: toLocalDateString(saturday) };
    }
    return { start: selectedDate, end: selectedDate };
  }, [viewMode, selectedDate, calendar.year, calendar.month]);

  const filteredEvents = useMemo(() => {
    const expanded = getExpandedEvents(visibleRange.start, visibleRange.end);
    if (activeContext === 'all') return expanded;
    return expanded.filter(e => e.context_id === activeContext);
  }, [getExpandedEvents, visibleRange, activeContext]);

  const filteredTasks = useMemo(() => {
    if (activeContext === 'all') return tasks;
    return tasks.filter(t => t.context_id === activeContext);
  }, [tasks, activeContext]);

  const getEventsForDay = useCallback((dateString) => {
    return filteredEvents
      .filter(e => e.start_date && e.start_date.startsWith(dateString))
      .sort((a, b) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        return (a.start_date || '').localeCompare(b.start_date || '');
      });
  }, [filteredEvents]);

  const getTasksForDay = useCallback((dateString) => {
    return filteredTasks.filter(t => t.due_date === dateString)
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
  }, [filteredTasks]);

  const handleDayClick = (dateString) => {
    setSelectedDate(dateString);
  };

  const handleCreateEvent = async (eventData) => {
    await createEvent({
      ...eventData,
      context_id: eventData.context_id || (activeContext !== 'all' ? activeContext : null),
    });
    setShowEventForm(false);
  };

  const handleUpdateEvent = async (eventData) => {
    if (!editingEvent) return;
    // For recurrence instances, use the parent ID
    const eventId = editingEvent._parentId || editingEvent.id;
    await updateEvent(eventId, eventData);
    setEditingEvent(null);
  };

  const handleEventClick = (event) => {
    if (event._isRecurrenceInstance && !event.is_read_only) {
      setRecurrenceAction({ event, action: 'edit' });
    } else {
      setEditingEvent(event);
    }
  };

  const handleDeleteEvent = (event) => {
    if (event.is_read_only) return;
    if (event._isRecurrenceInstance || event.recurrence_rule) {
      setRecurrenceAction({ event, action: 'delete' });
    } else {
      confirmAndDelete(event);
    }
  };

  const confirmAndDelete = (event) => {
    setDeleteTarget(event);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const eventId = deleteTarget._parentId || deleteTarget.id;
    await deleteEvent(eventId);
    setDeleteTarget(null);
  };

  const handleRecurrenceChoice = async (choice) => {
    if (!recurrenceAction) return;
    const { event, action } = recurrenceAction;
    const masterId = event._parentId || event.id;

    if (action === 'edit') {
      if (choice === 'all') {
        // Edit master event — find the master from events array
        const master = events.find(e => e.id === masterId);
        setEditingEvent(master || event);
      } else {
        // Edit single instance — just open with the instance data
        setEditingEvent(event);
      }
    } else if (action === 'delete') {
      if (choice === 'all') {
        await confirmAndDelete({ ...event, id: masterId });
      } else {
        // Add this date as an exception to the recurring event
        const exceptionDate = event.start_date.substring(0, 10);
        const masterEvent = events.find(e => e.id === masterId);
        const currentExceptions = masterEvent?.exceptions || [];
        await updateEvent(masterId, {
          exceptions: [...currentExceptions, exceptionDate],
        });
        showToast('Instance removed');
      }
    }
    setRecurrenceAction(null);
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
      showToast('Task added');
    } catch (err) {
      console.error(err);
      showToast('Failed to add task', { type: 'error' });
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

  const daySidebarProps = {
    selectedDate,
    selectedDateFormatted,
    events: selectedDayEvents,
    tasks: selectedDayTasks,
    onAddEvent: () => setShowEventForm(true),
    onAddTask: () => setShowTaskForm(true),
    onEventClick: handleEventClick,
    onDeleteEvent: handleDeleteEvent,
    onToggleComplete: toggleComplete,
    onEditTask: setEditingTask,
    onUpdateTask: updateTask,
    quickTaskTitle,
    setQuickTaskTitle,
    onQuickAddTask: handleQuickAddTask,
  };

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
                        {dayEvents.some(e => isGoogleEvent(e)) && <span className="dot google-dot" />}
                        {dayEvents.some(e => !isGoogleEvent(e)) && <span className="dot event-dot" />}
                        {dayTasks.length > 0 && <span className="dot task-dot" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="calendar-sidebar">
            <DaySidebar {...daySidebarProps} />
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
                    {dayEvents.slice(0, 3).map(event => (
                      <div key={event.id} className="week-item week-event" onClick={(e) => { e.stopPropagation(); handleEventClick(event); }}>
                        {isGoogleEvent(event) ? <Cloud size={12} className="event-icon-google" /> : <Calendar size={12} />}
                        <span>{event.title}</span>
                      </div>
                    ))}
                    {dayTasks.slice(0, Math.max(0, 5 - Math.min(dayEvents.length, 3))).map(task => (
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
                    {(() => {
                      const shown = Math.min(dayEvents.length, 3) + Math.min(dayTasks.length, Math.max(0, 5 - Math.min(dayEvents.length, 3)));
                      const total = dayEvents.length + dayTasks.length;
                      const overflow = total - shown;
                      if (overflow > 0) return <span className="week-overflow">+{overflow} more</span>;
                      return null;
                    })()}
                    {dayEvents.length === 0 && dayTasks.length === 0 && (
                      <span className="week-empty">No items</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="calendar-sidebar">
            <DaySidebar {...daySidebarProps} />
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
                    <div key={event.id} className="day-item event-item" onClick={() => handleEventClick(event)}>
                      {isGoogleEvent(event) ? <Cloud size={14} className="event-icon-google" /> : <Calendar size={14} />}
                      <div className="day-event-content">
                        <span>{event.title}</span>
                        {event.location && <span className="day-event-location">{event.location}</span>}
                      </div>
                      {event.all_day ? (
                        <span className="event-badge">All day</span>
                      ) : event.start_date && (
                        <span className="event-badge">{formatTimeRange(event.start_date, event.end_date, false)}</span>
                      )}
                      {(event.recurrence_rule || event._isRecurrenceInstance) && <Repeat size={12} className="event-recurrence-icon" />}
                      {event.is_read_only ? (
                        <Lock size={12} className="event-readonly-icon" />
                      ) : (
                        <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event); }}><Trash2 size={14} /></button>
                      )}
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

      <Modal isOpen={showEventForm} onClose={() => setShowEventForm(false)} title="New Event">
        <EventForm
          date={selectedDate}
          onSubmit={handleCreateEvent}
          onCancel={() => setShowEventForm(false)}
        />
      </Modal>

      <Modal isOpen={!!editingEvent} onClose={() => setEditingEvent(null)} title={editingEvent?.is_read_only ? 'Event Details' : 'Edit Event'}>
        {editingEvent && (
          <EventForm
            initialData={editingEvent}
            onSubmit={handleUpdateEvent}
            onCancel={() => setEditingEvent(null)}
            isReadOnly={editingEvent.is_read_only}
          />
        )}
      </Modal>

      <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
        <TaskForm onClose={() => setShowTaskForm(false)} defaultDueDate={selectedDate} />
      </Modal>

      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task">
        <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />
      </Modal>

      {recurrenceAction && (
        <RecurrenceActionDialog
          action={recurrenceAction.action}
          onChoice={handleRecurrenceChoice}
          onCancel={() => setRecurrenceAction(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title="Delete Event"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title}"?${isGoogleEvent(deleteTarget) ? ' This will also delete it from Google Calendar.' : ''}` : ''}
      />
    </div>
  );
}
