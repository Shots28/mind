import { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { useToast } from '../Common/Toast';
import { useJournal } from '../../contexts/JournalContext';
import ConfirmDialog from '../Common/ConfirmDialog';
import './Journal.css';

const MAX_HEIGHT = 150;

const MOOD_EMOJI = {
  great: '😄',
  good: '🙂',
  okay: '😐',
  bad: '🙁',
  terrible: '😞',
};

export default function JournalEntryCard({ entry, onDelete }) {
  const { showToast } = useToast();
  const { undoDeleteEntry } = useJournal();
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      setOverflows(contentRef.current.scrollHeight > MAX_HEIGHT);
    }
  }, [entry.content]);

  return (
    <div className="journal-history-entry glass-panel">
      <div className="journal-entry-header">
        <div className="journal-entry-meta">
          <span className="journal-entry-time">
            {entry.source === 'voice_agent' && <Phone size={12} className="journal-voice-badge" />}
            {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {entry.mood && MOOD_EMOJI[entry.mood] && (
            <span className="journal-entry-mood" title={entry.mood}>{MOOD_EMOJI[entry.mood]}</span>
          )}
        </div>
        {entry.contexts?.name && (
          <span className="journal-entry-context" style={{ color: entry.contexts.color }}>{entry.contexts.name}</span>
        )}
        {onDelete && (
          <button className="btn-icon" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button>
        )}
      </div>
      <div
        ref={contentRef}
        className={`journal-entry-body ${!expanded && overflows ? 'clamped' : ''}`}
        style={!expanded && overflows ? { maxHeight: MAX_HEIGHT } : undefined}
      >
        <p className="journal-entry-content">{entry.content}</p>
      </div>
      {overflows && (
        <button className="journal-expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? <><ChevronUp size={14} /> Show less</> : <><ChevronDown size={14} /> Show more</>}
        </button>
      )}
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          onDelete(entry.id, { undo: true });
          showToast('Entry deleted', { duration: 5000, action: { label: 'Undo', onClick: undoDeleteEntry } });
        }}
        title="Delete Entry"
        message="Are you sure you want to delete this journal entry?"
      />
    </div>
  );
}
