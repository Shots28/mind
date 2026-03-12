import { useState, useMemo } from 'react';
import { useContexts } from '../../contexts/ContextContext';
import { useGoogleSync } from '../../contexts/GoogleSyncContext';
import { Calendar, Clock, MapPin, AlignLeft, Repeat, Cloud, Lock } from 'lucide-react';
import { useToast } from '../Common/Toast';
import RecurrenceSelector from './RecurrenceSelector';
import './EventForm.css';

export default function EventForm({ initialData, date, onSubmit, onCancel, isReadOnly }) {
  const { contexts, activeContext } = useContexts();
  const { getCalendarForContext, hasSyncEnabled } = useGoogleSync();

  const [title, setTitle] = useState(initialData?.title || '');
  const [allDay, setAllDay] = useState(initialData?.all_day ?? true);
  const [startDate, setStartDate] = useState(
    initialData?.start_date
      ? (initialData.all_day ? initialData.start_date.substring(0, 10) : initialData.start_date.substring(0, 10))
      : (date || new Date().toISOString().substring(0, 10))
  );
  const [startTime, setStartTime] = useState(
    initialData?.start_date && !initialData.all_day
      ? initialData.start_date.substring(11, 16)
      : '09:00'
  );
  const [endDate, setEndDate] = useState(
    initialData?.end_date
      ? (initialData.all_day ? initialData.end_date.substring(0, 10) : initialData.end_date.substring(0, 10))
      : (date || new Date().toISOString().substring(0, 10))
  );
  const [endTime, setEndTime] = useState(
    initialData?.end_date && !initialData.all_day
      ? initialData.end_date.substring(11, 16)
      : '10:00'
  );
  const [description, setDescription] = useState(initialData?.description || '');
  const [location, setLocation] = useState(initialData?.location || '');
  const [contextId, setContextId] = useState(initialData?.context_id || (activeContext !== 'all' ? activeContext : null));
  const [recurrenceRule, setRecurrenceRule] = useState(initialData?.recurrence_rule || '');
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(initialData?.description || initialData?.location || initialData?.recurrence_rule)
  );

  const mappedCalendar = useMemo(() => {
    if (!hasSyncEnabled) return null;
    return getCalendarForContext(contextId);
  }, [contextId, hasSyncEnabled, getCalendarForContext]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);

    try {
      const eventData = {
        title: title.trim(),
        all_day: allDay,
        context_id: contextId || null,
        description: description.trim() || null,
        location: location.trim() || null,
        recurrence_rule: recurrenceRule || null,
      };

      if (allDay) {
        eventData.start_date = new Date(startDate + 'T12:00:00').toISOString();
        if (endDate && endDate !== startDate) {
          eventData.end_date = new Date(endDate + 'T12:00:00').toISOString();
        }
      } else {
        eventData.start_date = new Date(`${startDate}T${startTime}:00`).toISOString();
        eventData.end_date = new Date(`${endDate}T${endTime}:00`).toISOString();
      }

      await onSubmit(eventData);
    } catch (err) {
      console.error(err);
      showToast('Failed to save event', { type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (isReadOnly) {
    return (
      <div className="event-form-readonly">
        <div className="event-form-readonly-header">
          <Lock size={14} />
          <span>Read-only event</span>
        </div>
        <h3>{initialData?.title}</h3>
        {initialData?.description && <p>{initialData.description}</p>}
        {initialData?.location && <p className="event-form-location"><MapPin size={12} /> {initialData.location}</p>}
        <button className="btn-ghost" onClick={onCancel}>Close</button>
      </div>
    );
  }

  return (
    <form className="event-form" onSubmit={handleSubmit}>
      <input
        type="text"
        className="event-form-title input-field"
        placeholder="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      <div className="event-form-row">
        <label className="event-form-toggle">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          <span>All day</span>
        </label>
      </div>

      <div className="event-form-dates">
        <div className="event-form-date-row">
          <Calendar size={14} />
          <input
            type="date"
            className="event-form-date-input"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }}
          />
          {!allDay && (
            <input
              type="time"
              className="event-form-time-input"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          )}
        </div>
        <div className="event-form-date-row">
          <Clock size={14} />
          <input
            type="date"
            className="event-form-date-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate}
          />
          {!allDay && (
            <input
              type="time"
              className="event-form-time-input"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          )}
        </div>
      </div>

      {/* Context selector */}
      <div className="event-form-row">
        <select
          className="event-form-select"
          value={contextId || ''}
          onChange={(e) => setContextId(e.target.value || null)}
        >
          <option value="">No context</option>
          {contexts.map(ctx => (
            <option key={ctx.id} value={ctx.id}>{ctx.name}</option>
          ))}
        </select>
        {mappedCalendar && (
          <span className="event-form-sync-hint">
            <Cloud size={12} />
            {mappedCalendar.calendar_name}
          </span>
        )}
      </div>

      {/* Advanced fields toggle */}
      <button
        type="button"
        className="event-form-advanced-toggle"
        onClick={() => setShowAdvanced(!showAdvanced)}
      >
        {showAdvanced ? 'Hide details' : 'Add details'}
      </button>

      {showAdvanced && (
        <div className="event-form-advanced">
          <div className="event-form-field">
            <MapPin size={14} />
            <input
              type="text"
              className="input-field"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="event-form-field">
            <AlignLeft size={14} />
            <textarea
              className="input-field event-form-textarea"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="event-form-field">
            <Repeat size={14} />
            <RecurrenceSelector
              value={recurrenceRule}
              onChange={setRecurrenceRule}
              startDate={startDate}
            />
          </div>
        </div>
      )}

      <div className="event-form-actions">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={!title.trim() || submitting}>
          {initialData ? 'Save' : 'Create Event'}
        </button>
      </div>
    </form>
  );
}
