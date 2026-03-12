import { Repeat } from 'lucide-react';
import './RecurrenceActionDialog.css';

export default function RecurrenceActionDialog({ action, onChoice, onCancel }) {
  const isDelete = action === 'delete';
  const title = isDelete ? 'Delete recurring event' : 'Edit recurring event';

  return (
    <div className="recurrence-dialog-overlay" onClick={onCancel}>
      <div className="recurrence-dialog glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="recurrence-dialog-header">
          <Repeat size={16} />
          <h3>{title}</h3>
        </div>
        <p className="recurrence-dialog-text">
          This is a recurring event. What would you like to {isDelete ? 'delete' : 'edit'}?
        </p>
        <div className="recurrence-dialog-actions">
          <button className="recurrence-dialog-btn" onClick={() => onChoice('single')}>
            This event only
          </button>
          <button className="recurrence-dialog-btn" onClick={() => onChoice('all')}>
            All events in the series
          </button>
          <button className="recurrence-dialog-btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
