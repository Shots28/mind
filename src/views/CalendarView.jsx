import { useState, useMemo } from 'react';
import useCalendar from '../hooks/useCalendar';
import { useEvents } from '../contexts/EventContext';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import TaskForm from '../components/Tasks/TaskForm';
import InlineDatePicker from '../components/Tasks/InlineDatePicker';
import { ChevronLeft, ChevronRight, Plus, Calendar, Clock, Trash2, Edit3 } from 'lucide-react';
import './CalendarView.css';

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

export default function CalendarView() {
  const calendar = useCalendar();
  const { events, createEvent, deleteEvent } = useEvents();
  const { tasks, updateTask } = useTasks();
  const { activeContext } = useContexts();
  const [selectedDate, setSelectedDate] = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', all_day: true });
  const [editingTask, setEditingTask] = useState(null);

  const filteredEvents = useMemo(() => {
    if (activeContext === 'all') return events;
    return events.filter(e => e.context_id === activeContext);
  }, [events, activeContext]);

  const filteredTasks = useMemo(() => {
    if (activeContext === 'all') return tasks;
    return tasks.filter(t => t.context_id === activeContext);
  }, [tasks, activeContext]);

  const getEventsForDay = (dateString) => {
    return filteredEvents.filter(e => e.start_date && e.start_date.startsWith(dateString));
  };

  const getTasksForDay = (dateString) => {
    return filteredTasks.filter(t => t.due_date === dateString)
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
  };

  const handleDayClick = (day) => {
    setSelectedDate(day.dateString);
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.title.trim()) return;
    try {
      await createEvent({
        title: newEvent.title,
        start_date: new Date(selectedDate).toISOString(),
        all_day: newEvent.all_day,
        context_id: activeContext !== 'all' ? activeContext : null,
      });
      setNewEvent({ title: '', all_day: true });
      setShowEventForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];
  const selectedDayTasks = selectedDate ? getTasksForDay(selectedDate) : [];

  return (
    <div className="calendar-view">
      <div className="calendar-main">
        <div className="calendar-nav glass-panel">
          <button className="btn-icon" onClick={calendar.goToPrevMonth}><ChevronLeft size={20} /></button>
          <h2 className="calendar-month-title">{calendar.monthName} {calendar.year}</h2>
          <button className="btn-icon" onClick={calendar.goToNextMonth}><ChevronRight size={20} /></button>
          <button className="btn-icon calendar-today-btn" onClick={calendar.goToToday}>Today</button>
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
                onClick={() => handleDayClick(day)}
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
        <div className="calendar-day-detail glass-panel">
          {selectedDate ? (
            <>
              <div className="day-detail-header">
                <h3>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
                <button className="btn-icon" onClick={() => setShowEventForm(true)}><Plus size={18} /></button>
              </div>
              {selectedDayEvents.length === 0 && selectedDayTasks.length === 0 ? (
                <p className="no-items-text">No events or tasks for this day.</p>
              ) : (
                <div className="day-items">
                  {selectedDayEvents.map(event => (
                    <div key={event.id} className="day-item event-item">
                      <Calendar size={14} />
                      <span>{event.title}</span>
                      <button className="btn-icon" onClick={() => deleteEvent(event.id)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {selectedDayTasks.map(task => (
                    <div key={task.id} className="day-item task-item-cal" onClick={() => setEditingTask(task)}>
                      <Clock size={14} />
                      <span className={task.is_completed ? 'completed-text' : ''}>{task.title}</span>
                      <InlineDatePicker value={task.due_date} onChange={(d) => updateTask(task.id, { due_date: d || null })}>
                        <button className="btn-icon" onClick={(e) => e.stopPropagation()}><Calendar size={14} /></button>
                      </InlineDatePicker>
                      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setEditingTask(task); }}><Edit3 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={Calendar} title="Select a day" description="Click a date to see events and tasks." />
          )}
        </div>

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

        <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task">
          <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />
        </Modal>
      </div>
    </div>
  );
}
