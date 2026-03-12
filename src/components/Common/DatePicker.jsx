import { useState, useRef } from 'react';
import { Calendar, X } from 'lucide-react';
import CalendarDropdown from './CalendarDropdown';
import './DatePicker.css';

export default function DatePicker({ value, onChange, placeholder = 'Select date' }) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const displayValue = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <div className="datepicker-wrapper">
      <div className="datepicker-input" ref={inputRef} onClick={() => setIsOpen(!isOpen)}>
        <Calendar size={16} className="datepicker-icon" />
        <span className={`datepicker-value ${!value ? 'placeholder' : ''}`}>
          {displayValue || placeholder}
        </span>
        {value && (
          <button type="button" className="datepicker-clear" onClick={handleClear}>
            <X size={14} />
          </button>
        )}
      </div>
      <CalendarDropdown
        value={value}
        onChange={onChange}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={inputRef}
      />
    </div>
  );
}
