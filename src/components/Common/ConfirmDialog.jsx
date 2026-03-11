import React from 'react';
import Modal from './Modal';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Delete', danger = true }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5' }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button className="btn-icon" onClick={onClose} style={{ padding: '8px 16px' }}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={() => { onConfirm(); onClose(); }}
          style={danger ? { background: 'var(--danger-color)' } : {}}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
