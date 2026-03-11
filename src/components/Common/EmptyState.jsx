import React from 'react';
import './EmptyState.css';

export default function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={40} className="empty-state-icon" />}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && onAction && (
        <button className="btn-primary" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
