import { useState, useMemo } from 'react';
import { Send } from 'lucide-react';
import { useJournal } from '../../contexts/JournalContext';
import { useContexts } from '../../contexts/ContextContext';
import { toLocalDateString } from '../../lib/dates';
import JournalEntryCard from './JournalEntryCard';
import './Journal.css';

const JournalWidget = ({ date }) => {
    const { entries, createEntry } = useJournal();
    const { activeContext } = useContexts();
    const [entry, setEntry] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const targetDate = date || toLocalDateString();

    const dateEntries = useMemo(() => {
        return entries
            .filter(e => toLocalDateString(new Date(e.created_at)) === targetDate)
            .slice(0, 3);
    }, [entries, targetDate]);

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

            {dateEntries.length > 0 && (
                <div className="recent-entries">
                    {dateEntries.map(e => (
                        <JournalEntryCard key={e.id} entry={e} compact />
                    ))}
                </div>
            )}
        </div>
    );
};

export default JournalWidget;
