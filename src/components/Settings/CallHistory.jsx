import { useEffect, useState } from 'react';
import { useVoiceAgent } from '../../contexts/VoiceAgentContext';
import { Phone, PhoneOff, PhoneMissed, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import './CallHistory.css';

const STATUS_CONFIG = {
  completed: { icon: Phone, label: 'Completed', color: 'var(--success-color)' },
  'in-progress': { icon: Phone, label: 'In progress', color: 'var(--accent-color)' },
  scheduled: { icon: Clock, label: 'Scheduled', color: 'var(--text-secondary)' },
  ringing: { icon: Phone, label: 'Ringing', color: 'var(--accent-color)' },
  'no-answer': { icon: PhoneMissed, label: 'No answer', color: 'var(--warning-color, #f59e0b)' },
  failed: { icon: PhoneOff, label: 'Failed', color: 'var(--danger-color)' },
};

function formatDuration(seconds) {
  if (!seconds) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function CallItem({ call }) {
  const [expanded, setExpanded] = useState(false);
  const config = STATUS_CONFIG[call.status] || STATUS_CONFIG.failed;
  const Icon = config.icon;

  const date = new Date(call.scheduled_at);
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="ch-item">
      <button className="ch-item-header" onClick={() => setExpanded(!expanded)}>
        <Icon size={14} style={{ color: config.color }} />
        <div className="ch-item-info">
          <span className="ch-item-date">{dateStr} at {timeStr}</span>
          <span className="ch-item-meta" style={{ color: config.color }}>
            {config.label}
            {call.duration_seconds ? ` · ${formatDuration(call.duration_seconds)}` : ''}
          </span>
        </div>
        {call.transcript && (
          expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
        )}
      </button>
      {expanded && call.transcript && (
        <div className="ch-transcript">
          <p className="ch-transcript-label">Transcript</p>
          <p className="ch-transcript-text">{call.transcript}</p>
          {call.summary && (
            <>
              <p className="ch-transcript-label">Summary</p>
              <p className="ch-transcript-text">{call.summary}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function CallHistory() {
  const { calls, fetchCalls } = useVoiceAgent();

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  if (!calls || calls.length === 0) {
    return (
      <div className="ch-empty">
        <Phone size={24} />
        <p>No calls yet</p>
        <p className="ch-empty-hint">Your call history will appear here after your first AI check-in.</p>
      </div>
    );
  }

  return (
    <div className="ch-list">
      {calls.map(call => (
        <CallItem key={call.id} call={call} />
      ))}
    </div>
  );
}
