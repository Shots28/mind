import { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import './Journal.css';

const MAX_HEIGHT = 150;

export default function JournalEntryCard({ entry, onDelete, compact = false }) {
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      setOverflows(contentRef.current.scrollHeight > MAX_HEIGHT);
    }
  }, [entry.content]);

  return (
    <div className="journal-history-entry glass-panel">
      <div className="journal-entry-header">
        <span className="journal-entry-time">
          {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
        {entry.contexts?.name && (
          <span className="journal-entry-context" style={{ color: entry.contexts.color }}>{entry.contexts.name}</span>
        )}
        {onDelete && (
          <button className="btn-icon" onClick={() => onDelete(entry.id)}><Trash2 size={14} /></button>
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
    </div>
  );
}
