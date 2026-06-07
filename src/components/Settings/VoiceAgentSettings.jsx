import { useState } from 'react';
import { useVoiceAgent } from '../../contexts/VoiceAgentContext';
import { useToast } from '../Common/Toast';
import Modal from '../Common/Modal';
import VoiceAgentOnboarding from '../VoiceAgent/VoiceAgentOnboarding';
import CallHistory from './CallHistory';
import { Phone, PhoneCall, Clock, Calendar, Volume2, History } from 'lucide-react';
import './VoiceAgentSettings.css';

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', label: 'Warm & friendly' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', label: 'Calm & steady' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', label: 'Thoughtful & clear' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', label: 'Energetic & upbeat' },
];

const FREQUENCIES = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'custom', label: 'Custom' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function VoiceAgentSettings() {
  const { preferences, loading, updatePreferences, triggerTestCall } = useVoiceAgent();
  const { showToast } = useToast();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState(false);

  if (loading) return null;

  const isSetUp = preferences?.onboarding_completed;

  const handleUpdate = async (updates) => {
    setSaving(true);
    try {
      await updatePreferences(updates);
    } catch (err) {
      showToast('Failed to update settings', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestCall = async () => {
    setCalling(true);
    try {
      await triggerTestCall();
      showToast('Test call initiated! You should receive a call shortly.');
    } catch (err) {
      showToast('Failed to trigger test call', { type: 'error' });
    } finally {
      setCalling(false);
    }
  };

  const handleToggleDay = (day) => {
    const current = preferences?.call_days || [];
    const updated = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort();
    handleUpdate({ call_days: updated });
  };

  const voiceName = VOICES.find(v => v.id === preferences?.voice_id)?.name || 'Default';

  return (
    <div className="va-settings">
      <h3 className="settings-section-title">
        <PhoneCall size={16} /> AI Check-ins
      </h3>

      {!isSetUp ? (
        <>
          <p className="settings-hint">
            Get a daily AI phone call to check in on your habits, manage tasks, and journal.
          </p>
          <button
            className="btn-primary va-setup-btn"
            onClick={() => setShowOnboarding(true)}
          >
            <Phone size={16} /> Set up AI Check-ins
          </button>
        </>
      ) : (
        <div className="va-settings-grid">
          {/* Active toggle */}
          <div className="va-setting-row">
            <div className="va-setting-label">
              <Phone size={14} />
              <span>Active</span>
            </div>
            <label className="va-toggle">
              <input
                type="checkbox"
                checked={preferences?.is_active || false}
                onChange={(e) => handleUpdate({ is_active: e.target.checked })}
              />
              <span className="va-toggle-slider" />
            </label>
          </div>

          {/* Phone number */}
          <div className="va-setting-row">
            <div className="va-setting-label">
              <Phone size={14} />
              <span>{preferences?.phone_number || 'No phone'}</span>
            </div>
            <span className="va-verified-badge">
              {preferences?.phone_verified ? 'Verified' : 'Not verified'}
            </span>
          </div>

          {/* Call time */}
          <div className="va-setting-row">
            <div className="va-setting-label">
              <Clock size={14} />
              <span>Call time</span>
            </div>
            <input
              type="time"
              className="va-time-input"
              value={preferences?.preferred_call_time?.substring(0, 5) || '21:00'}
              onChange={(e) => handleUpdate({ preferred_call_time: e.target.value })}
            />
          </div>

          {/* Frequency */}
          <div className="va-setting-row va-setting-column">
            <div className="va-setting-label">
              <Calendar size={14} />
              <span>Frequency</span>
            </div>
            <div className="va-freq-pills">
              {FREQUENCIES.map(f => (
                <button
                  key={f.value}
                  className={`va-pill ${preferences?.call_frequency === f.value ? 'selected' : ''}`}
                  onClick={() => handleUpdate({ call_frequency: f.value })}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {preferences?.call_frequency === 'custom' && (
              <div className="va-day-pills">
                {DAYS.map((day, i) => (
                  <button
                    key={i}
                    className={`va-day-pill ${(preferences?.call_days || []).includes(i) ? 'selected' : ''}`}
                    onClick={() => handleToggleDay(i)}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Voice */}
          <div className="va-setting-row">
            <div className="va-setting-label">
              <Volume2 size={14} />
              <span>Voice: {voiceName}</span>
            </div>
            <select
              className="va-voice-select"
              value={preferences?.voice_id || VOICES[0].id}
              onChange={(e) => handleUpdate({ voice_id: e.target.value })}
            >
              {VOICES.map(v => (
                <option key={v.id} value={v.id}>{v.name} — {v.label}</option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="va-actions">
            <button
              className="va-action-btn"
              onClick={handleTestCall}
              disabled={calling || !preferences?.is_active}
            >
              <PhoneCall size={14} />
              {calling ? 'Calling...' : 'Call Me Now'}
            </button>
            <button
              className="va-action-btn"
              onClick={() => setShowHistory(true)}
            >
              <History size={14} />
              Call History
            </button>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      <Modal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        title=""
        size="medium"
      >
        <VoiceAgentOnboarding
          onComplete={() => setShowOnboarding(false)}
        />
      </Modal>

      {/* Call History Modal */}
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        title="Call History"
        size="medium"
      >
        <CallHistory />
      </Modal>
    </div>
  );
}
