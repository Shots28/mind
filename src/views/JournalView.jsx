import { useState, useMemo } from 'react';
import { useJournal } from '../contexts/JournalContext';
import { useContexts } from '../contexts/ContextContext';
import EmptyState from '../components/Common/EmptyState';
import { Send, BookOpen, Trash2 } from 'lucide-react';
import './JournalView.css';

export default function JournalView() {
  const { entries, loading, createEntry, deleteEntry } = useJournal();
  const { activeContext } = useContexts();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createEntry(content.trim(), null, activeContext !== 'all' ? activeContext : null);
      setContent('');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  const groupedEntries = useMemo(() => {
    const filtered = activeContext === 'all' ? entries : entries.filter(e => e.context_id === activeContext);
    const groups = {};
    filtered.forEach(entry => {
      const date = new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
    });
    return Object.entries(groups);
  }, [entries, activeContext]);

  return (
    <div className="journal-view">
      <div className="journal-compose glass-panel">
        <h3 className="section-title">What's on your mind?</h3>
        <textarea
          className="input-field journal-view-textarea"
          placeholder="Write your thoughts, reflections, quick notes..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
        />
        <div className="journal-compose-footer">
          <span className="journal-hint">Ctrl+Enter to submit</span>
          <button className="btn-primary" onClick={handleSubmit} disabled={!content.trim() || submitting}>
            <Send size={16} />
            <span>{submitting ? 'Logging...' : 'Log'}</span>
          </button>
        </div>
      </div>

      <div className="journal-history">
        {groupedEntries.length === 0 && !loading ? (
          <EmptyState icon={BookOpen} title="No journal entries yet" description="Start writing to capture your thoughts." />
        ) : (
          groupedEntries.map(([date, dayEntries]) => (
            <div key={date} className="journal-day-group">
              <h4 className="journal-day-label">{date}</h4>
              {dayEntries.map(entry => (
                <div key={entry.id} className="journal-history-entry glass-panel">
                  <div className="journal-entry-header">
                    <span className="journal-entry-time">
                      {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {entry.contexts?.name && (
                      <span className="journal-entry-context" style={{ color: entry.contexts.color }}>{entry.contexts.name}</span>
                    )}
                    <button className="btn-icon" onClick={() => deleteEntry(entry.id)}><Trash2 size={14} /></button>
                  </div>
                  <p className="journal-entry-content">{entry.content}</p>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
