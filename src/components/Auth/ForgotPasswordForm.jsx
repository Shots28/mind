import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Mail, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordForm({ onBack }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="auth-success">
        <h3>Check your email</h3>
        <p>We sent a password reset link to <strong>{email}</strong>. Click the link in the email to reset your password.</p>
        <button className="btn-link" onClick={onBack}>Back to Sign In</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.5', margin: '0 0 8px' }}>
        Enter your email and we'll send you a link to reset your password.
      </p>
      {error && <div className="auth-error">{error}</div>}
      <div className="input-group">
        <Mail size={18} className="input-icon" />
        <input
          type="email"
          className="input-field"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <button type="submit" className="btn-primary auth-submit" disabled={loading}>
        {loading ? 'Sending...' : 'Send Reset Link'}
      </button>
      <button type="button" className="btn-link" onClick={onBack}>
        <ArrowLeft size={14} /> Back to Sign In
      </button>
    </form>
  );
}
