import { useState, useMemo } from 'react';
import { describeRecurrence } from '../../lib/recurrence';
import './RecurrenceSelector.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const PRESETS = [
  { label: 'Does not repeat', value: '' },
  { label: 'Daily', value: 'RRULE:FREQ=DAILY' },
  { label: 'Every weekday (Mon-Fri)', value: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Weekly', value: '__weekly__' },
  { label: 'Monthly', value: '__monthly__' },
  { label: 'Yearly', value: '__yearly__' },
  { label: 'Custom...', value: '__custom__' },
];

export default function RecurrenceSelector({ value, onChange, startDate }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFreq, setCustomFreq] = useState('WEEKLY');
  const [customInterval, setCustomInterval] = useState(1);
  const [customEndType, setCustomEndType] = useState('never');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customCount, setCustomCount] = useState(10);

  const dayOfWeek = useMemo(() => {
    if (!startDate) return 'MO';
    const d = new Date(startDate + 'T12:00:00');
    return DAY_CODES[d.getDay()];
  }, [startDate]);

  const dayOfMonth = useMemo(() => {
    if (!startDate) return 1;
    return new Date(startDate + 'T12:00:00').getDate();
  }, [startDate]);

  const handlePresetChange = (preset) => {
    if (preset === '__custom__') {
      setShowCustom(true);
      return;
    }

    setShowCustom(false);

    if (preset === '__weekly__') {
      onChange(`RRULE:FREQ=WEEKLY;BYDAY=${dayOfWeek}`);
    } else if (preset === '__monthly__') {
      onChange(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`);
    } else if (preset === '__yearly__') {
      onChange(`RRULE:FREQ=YEARLY`);
    } else {
      onChange(preset);
    }
  };

  const buildCustomRule = () => {
    let rule = `RRULE:FREQ=${customFreq}`;
    if (customInterval > 1) rule += `;INTERVAL=${customInterval}`;
    if (customEndType === 'date' && customEndDate) {
      rule += `;UNTIL=${customEndDate.replace(/-/g, '')}T235959Z`;
    } else if (customEndType === 'count' && customCount > 0) {
      rule += `;COUNT=${customCount}`;
    }
    onChange(rule);
    setShowCustom(false);
  };

  // Determine which preset matches the current value
  const currentPreset = useMemo(() => {
    if (!value) return '';
    if (value === 'RRULE:FREQ=DAILY') return 'RRULE:FREQ=DAILY';
    if (value === 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return value;
    if (value.startsWith('RRULE:FREQ=WEEKLY;BYDAY=') && !value.includes('INTERVAL')) return '__weekly__';
    if (value.startsWith('RRULE:FREQ=MONTHLY')) return '__monthly__';
    if (value.startsWith('RRULE:FREQ=YEARLY')) return '__yearly__';
    return '__custom__';
  }, [value]);

  return (
    <div className="recurrence-selector">
      <select
        className="recurrence-select"
        value={showCustom ? '__custom__' : currentPreset}
        onChange={(e) => handlePresetChange(e.target.value)}
      >
        {PRESETS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {showCustom && (
        <div className="recurrence-custom">
          <div className="recurrence-custom-row">
            <span>Every</span>
            <input
              type="number"
              min="1"
              max="99"
              value={customInterval}
              onChange={(e) => setCustomInterval(parseInt(e.target.value) || 1)}
              className="recurrence-custom-input"
            />
            <select
              value={customFreq}
              onChange={(e) => setCustomFreq(e.target.value)}
              className="recurrence-custom-select"
            >
              <option value="DAILY">day(s)</option>
              <option value="WEEKLY">week(s)</option>
              <option value="MONTHLY">month(s)</option>
              <option value="YEARLY">year(s)</option>
            </select>
          </div>

          <div className="recurrence-custom-row">
            <span>Ends</span>
            <select
              value={customEndType}
              onChange={(e) => setCustomEndType(e.target.value)}
              className="recurrence-custom-select"
            >
              <option value="never">Never</option>
              <option value="date">On date</option>
              <option value="count">After occurrences</option>
            </select>
            {customEndType === 'date' && (
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="recurrence-custom-date"
                min={startDate}
              />
            )}
            {customEndType === 'count' && (
              <input
                type="number"
                min="1"
                max="999"
                value={customCount}
                onChange={(e) => setCustomCount(parseInt(e.target.value) || 1)}
                className="recurrence-custom-input"
              />
            )}
          </div>

          <button
            type="button"
            className="btn-primary recurrence-custom-apply"
            onClick={buildCustomRule}
          >
            Apply
          </button>
        </div>
      )}

      {value && !showCustom && (
        <span className="recurrence-preview">{describeRecurrence(value)}</span>
      )}
    </div>
  );
}
