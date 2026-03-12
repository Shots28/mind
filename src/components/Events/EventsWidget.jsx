import { useState, useMemo } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import { useEvents } from '../../contexts/EventContext';
import { useContexts } from '../../contexts/ContextContext';
import './EventsWidget.css';

export default function EventsWidget({ date }) {
  const { events, createEvent, deleteEvent } = useEvents();
  const { activeContext } = useContexts();
  const [quickAdd, setQuickAdd] = useState('');
  const [adding, setAdding] = useState(false);

  const dateEvents = useMemo(() => {
    if (!date) return [];
    let filtered = events.filter(e => e.start_date && e.start_date.startsWith(date));
    if (activeContext !== 'all') filtered = filtered.filter(e => e.context_id === activeContext);
    return filtered;
  }, [events, date, activeContext]);

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

  return (
    <div className="events-widget glass-panel">
      <h3 className="widget-title">Events</h3>
      {dateEvents.length > 0 ? (
        <div className="events-list">
          {dateEvents.map(event => (
            <div key={event.id} className="event-item-widget">
              <Calendar size={14} className="event-icon" />
              <span className="event-title">{event.title}</span>
              {event.contexts?.name && (
                <span className="event-context" style={{ color: event.contexts.color }}>{event.contexts.name}</span>
              )}
              <button className="btn-icon event-delete" onClick={() => deleteEvent(event.id)}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
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
