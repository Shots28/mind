import React from 'react';
import './EmptyState.css';

export default function EmptyState({ icon: Icon, title, description, tips, action, onAction }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={40} className="empty-state-icon" />}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {tips && tips.length > 0 && (
        <div className="empty-state-tips">
          {tips.map((tip, i) => (
            <p key={i} className="empty-state-tip">{tip}</p>
          ))}
        </div>
      )}
      {action && onAction && (
        <button className="btn-primary" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
