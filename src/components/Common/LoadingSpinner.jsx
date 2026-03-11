import React from 'react';
import './LoadingSpinner.css';

export default function LoadingSpinner({ size = 'medium', fullPage = false }) {
  if (fullPage) {
    return (
      <div className="loading-fullpage">
        <div className={`spinner spinner-${size}`} />
      </div>
    );
  }
  return <div className={`spinner spinner-${size}`} />;
}
