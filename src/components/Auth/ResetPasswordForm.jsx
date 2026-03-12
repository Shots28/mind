import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Lock } from 'lucide-react';
import './AuthPage.css';

export default function ResetPasswordForm() {
  const { updatePassword, recoveryMode } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(password);
      navigate('/today', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!recoveryMode) {
    return (
      <div className="auth-page">
        <div className="auth-container glass-panel">
          <div className="auth-header">
            <div className="auth-logo">
              <div className="logo-mark">Z</div>
              <span className="logo-text">Zenith</span>
            </div>
          </div>
          <div className="auth-success">
            <h3>Invalid or expired link</h3>
            <p>This password reset link is no longer valid. Please request a new one.</p>
            <button className="btn-link" onClick={() => navigate('/login', { replace: true })}>
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container glass-panel">
        <div className="auth-header">
          <div className="auth-logo">
            <div className="logo-mark">Z</div>
            <span className="logo-text">Zenith</span>
          </div>
        </div>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
          Set new password
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', marginBottom: '24px' }}>
          Enter your new password below.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input
              type="password"
              className="input-field"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              minLength={6}
            />
          </div>
          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input
              type="password"
              className="input-field"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button type="submit" className="btn-primary auth-submit" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
