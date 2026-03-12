import { useState, useMemo } from 'react';
import { Calendar, Plus, Trash2, Cloud, Lock, ChevronDown, ChevronUp, Repeat } from 'lucide-react';
import { useEvents } from '../../contexts/EventContext';
import { useContexts } from '../../contexts/ContextContext';
import { isGoogleEvent, formatTimeRange, getSyncStatusColor } from '../../lib/googleSync';
import './EventsWidget.css';

const MAX_VISIBLE = 5;

export default function EventsWidget({ date }) {
  const { createEvent, deleteEvent, getExpandedEvents } = useEvents();
  const { activeContext } = useContexts();
  const [quickAdd, setQuickAdd] = useState('');
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const dateEvents = useMemo(() => {
    if (!date) return [];
    const expanded = getExpandedEvents(date, date);
    let filtered = expanded.filter(e => e.start_date && e.start_date.startsWith(date));
    if (activeContext !== 'all') filtered = filtered.filter(e => e.context_id === activeContext);
    // Sort: all-day first, then by start time
    return filtered.sort((a, b) => {
      if (a.all_day && !b.all_day) return -1;
      if (!a.all_day && b.all_day) return 1;
      return (a.start_date || '').localeCompare(b.start_date || '');
    });
  }, [getExpandedEvents, date, activeContext]);

  const visibleEvents = expanded ? dateEvents : dateEvents.slice(0, MAX_VISIBLE);
  const hiddenCount = dateEvents.length - MAX_VISIBLE;

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickAdd.trim() || adding) return;
    setAdding(true);
    try {
      await createEvent({
        title: quickAdd.trim(),
        start_date: new Date(date + 'T12:00:00').toISOString(),
        all_day: true,
        context_id: activeContext !== 'all' ? activeContext : null,
      });
      setQuickAdd('');
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (event) => {
    if (isGoogleEvent(event)) {
      if (!confirm('This will also delete the event from Google Calendar. Continue?')) return;
    }
    await deleteEvent(event.id);
  };

  return (
    <div className="events-widget glass-panel">
      <h3 className="widget-title">Events</h3>
      {dateEvents.length > 0 ? (
        <div className="events-list">
          {visibleEvents.map(event => (
            <div key={event.id} className="event-item-widget">
              {isGoogleEvent(event) ? (
                <Cloud size={14} className="event-icon event-icon-google" />
              ) : (
                <Calendar size={14} className="event-icon" />
              )}
              <div className="event-item-content">
                <span className="event-title">{event.title}</span>
                {!event.all_day && (
                  <span className="event-time">{formatTimeRange(event.start_date, event.end_date, false)}</span>
                )}
              </div>
              {event.sync_status && event.sync_status !== 'local' && (
                <span className="event-sync-dot" style={{ background: getSyncStatusColor(event.sync_status) }} title={event.sync_status} />
              )}
              {(event.recurrence_rule || event._isRecurrenceInstance) && (
                <Repeat size={11} className="event-recurrence" />
              )}
              {event.contexts?.name && (
                <span className="event-context" style={{ color: event.contexts.color }}>{event.contexts.name}</span>
              )}
              {event.is_read_only ? (
                <Lock size={12} className="event-readonly" />
              ) : (
                <button className="btn-icon event-delete" onClick={() => handleDelete(event)}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <button className="events-show-more" onClick={() => setExpanded(!expanded)}>
              {expanded ? (
                <><ChevronUp size={12} /> Show less</>
              ) : (
                <><ChevronDown size={12} /> Show {hiddenCount} more</>
              )}
            </button>
          )}
        </div>
      ) : (
        <p className="events-empty">No events for this day</p>
      )}
      <form className="events-quick-add" onSubmit={handleQuickAdd}>
        <Plus size={14} className="events-add-icon" />
        <input
          type="text"
          className="events-add-input"
          placeholder="Add event..."
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          disabled={adding}
        />
      </form>
    </div>
  );
}
