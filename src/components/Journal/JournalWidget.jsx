import { useState, useMemo } from 'react';
import { Send } from 'lucide-react';
import { useJournal } from '../../contexts/JournalContext';
import { useContexts } from '../../contexts/ContextContext';
import './Journal.css';

const JournalWidget = () => {
    const { entries, createEntry } = useJournal();
    const { activeContext } = useContexts();
    const [entry, setEntry] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const todayEntries = useMemo(() => {
        const today = new Date().toDateString();
        return entries
            .filter(e => new Date(e.created_at).toDateString() === today)
            .slice(0, 3);
    }, [entries]);

    const handleSubmit = async () => {
        if (!entry.trim() || submitting) return;
        setSubmitting(true);
        try {
            await createEntry(entry.trim(), null, activeContext !== 'all' ? activeContext : null);
            setEntry('');
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

    return (
        <div className="journal-widget glass-panel">
            <h3 className="widget-title">Capture Thought</h3>
            <div className="journal-input-area">
                <textarea
                    className="input-field journal-textarea"
                    placeholder="What's on your mind?"
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className="journal-actions">
                    <span className="journal-hint">⌘+Enter</span>
                    <button
                        className="btn-primary journal-submit"
                        onClick={handleSubmit}
                        disabled={!entry.trim() || submitting}
                    >
                        <span>{submitting ? '...' : 'Log'}</span>
                        <Send size={16} />
                    </button>
                </div>
            </div>

            {todayEntries.length > 0 && (
                <div className="recent-entries">
                    {todayEntries.map(e => (
                        <div key={e.id} className="journal-entry">
                            <div className="entry-time">
                                {new Date(e.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                            <p className="entry-text">{e.content}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default JournalWidget;
