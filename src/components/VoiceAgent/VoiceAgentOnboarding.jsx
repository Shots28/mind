import { useState } from 'react';
import { useVoiceAgent } from '../../contexts/VoiceAgentContext';
import { useToast } from '../Common/Toast';
import { getUserTimezone } from '../../lib/dates';
import { ArrowRight, ArrowLeft, Phone, Volume2, Check } from 'lucide-react';
import './VoiceAgentOnboarding.css';

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', label: 'Warm & friendly', sampleUrl: null },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', label: 'Calm & steady', sampleUrl: null },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', label: 'Thoughtful & clear', sampleUrl: null },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', label: 'Energetic & upbeat', sampleUrl: null },
];

const FREQUENCIES = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'weekends', label: 'Weekends only' },
  { value: 'custom', label: 'Custom days' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function VoiceAgentOnboarding({ onComplete }) {
  const { updatePreferences } = useVoiceAgent();
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [callTime, setCallTime] = useState('21:00');
  const [frequency, setFrequency] = useState('daily');
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const totalSteps = 5;

  const formatPhoneForDisplay = (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const getE164 = () => {
    const digits = phoneNumber.replace(/\D/g, '');
    return `+1${digits}`;
  };

  const handlePhoneSubmit = () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit US phone number');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await updatePreferences({
        phone_number: getE164(),
        phone_verified: true, // skip verification for now
        voice_id: selectedVoice,
        preferred_call_time: callTime,
        call_frequency: frequency,
        call_days: frequency === 'custom' ? customDays : null,
        timezone: getUserTimezone(),
        is_active: true,
        onboarding_completed: true,
      });
      showToast('AI check-ins activated!');
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day) => {
    setCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  return (
    <div className="va-onboarding">
      <div className="va-onboarding-container glass-panel">
        {step === 0 && (
          <div className="va-step">
            <div className="va-icon-circle">
              <Phone size={28} />
            </div>
            <h2 className="va-step-title">Meet your AI check-in partner</h2>
            <p className="va-step-desc">
              Zenith can call you daily to check in on your habits,
              help manage tasks, and journal your thoughts.
              You just answer the phone.
            </p>
            <button className="btn-primary va-cta" onClick={() => setStep(1)}>
              Get started <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="va-step">
            <h2 className="va-step-title">What's your phone number?</h2>
            <p className="va-step-desc">We'll call you at this number for check-ins.</p>
            {error && <p className="va-error">{error}</p>}
            <div className="va-phone-input">
              <span className="va-phone-prefix">+1</span>
              <input
                type="tel"
                className="input-field"
                placeholder="(555) 123-4567"
                value={formatPhoneForDisplay(phoneNumber)}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                autoFocus
              />
            </div>
            <button
              className="btn-primary va-cta"
              onClick={handlePhoneSubmit}
              disabled={phoneNumber.replace(/\D/g, '').length !== 10 || loading}
            >
              Continue <ArrowRight size={16} />
            </button>
            <button className="va-back" onClick={() => setStep(0)}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="va-step">
            <h2 className="va-step-title">Pick your AI voice</h2>
            <p className="va-step-desc">Choose how your check-in partner sounds.</p>
            <div className="va-voice-list">
              {VOICES.map(voice => (
                <button
                  key={voice.id}
                  className={`va-voice-option ${selectedVoice === voice.id ? 'selected' : ''}`}
                  onClick={() => setSelectedVoice(voice.id)}
                >
                  <Volume2 size={16} />
                  <div className="va-voice-info">
                    <span className="va-voice-name">{voice.name}</span>
                    <span className="va-voice-label">{voice.label}</span>
                  </div>
                  {selectedVoice === voice.id && <Check size={16} className="va-voice-check" />}
                </button>
              ))}
            </div>
            <button className="btn-primary va-cta" onClick={() => setStep(3)}>
              Continue <ArrowRight size={16} />
            </button>
            <button className="va-back" onClick={() => setStep(1)}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="va-step">
            <h2 className="va-step-title">When should we call?</h2>
            <p className="va-step-desc">Pick a time and how often you'd like check-ins.</p>
            <div className="va-schedule-section">
              <label className="va-label">Time</label>
              <input
                type="time"
                className="input-field"
                value={callTime}
                onChange={(e) => setCallTime(e.target.value)}
              />
            </div>
            <div className="va-schedule-section">
              <label className="va-label">Frequency</label>
              <div className="va-frequency-options">
                {FREQUENCIES.map(f => (
                  <button
                    key={f.value}
                    className={`va-freq-option ${frequency === f.value ? 'selected' : ''}`}
                    onClick={() => setFrequency(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {frequency === 'custom' && (
              <div className="va-schedule-section">
                <label className="va-label">Days</label>
                <div className="va-day-picker">
                  {DAYS.map((day, i) => (
                    <button
                      key={i}
                      className={`va-day-btn ${customDays.includes(i) ? 'selected' : ''}`}
                      onClick={() => toggleDay(i)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button className="btn-primary va-cta" onClick={() => setStep(4)}>
              Continue <ArrowRight size={16} />
            </button>
            <button className="va-back" onClick={() => setStep(2)}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="va-step">
            <div className="va-icon-circle va-success">
              <Check size={28} />
            </div>
            <h2 className="va-step-title">You're all set!</h2>
            <p className="va-step-desc">
              Your AI check-in partner will call you
              {frequency === 'daily' && ' every day'}
              {frequency === 'weekdays' && ' on weekdays'}
              {frequency === 'weekends' && ' on weekends'}
              {frequency === 'custom' && ` on ${customDays.map(d => DAYS[d]).join(', ')}`}
              {' '}at {new Date(`2000-01-01T${callTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
            </p>
            {error && <p className="va-error">{error}</p>}
            <button
              className="btn-primary va-cta"
              onClick={handleFinish}
              disabled={loading}
            >
              {loading ? 'Activating...' : 'Activate check-ins'} <ArrowRight size={16} />
            </button>
            <button className="va-back" onClick={() => setStep(3)}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        )}

        <div className="va-dots">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className={`va-dot ${step === i ? 'active' : ''} ${step > i ? 'done' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
