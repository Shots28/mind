import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { toLocalDateString } from '../../lib/dates';
import './DatePicker.css';

export default function DatePicker({ value, onChange, placeholder = 'Select date' }) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const now = new Date();

  const initialDate = value ? new Date(value + 'T12:00:00') : now;
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());

  // Position the dropdown after it renders (in portal, so fixed works correctly)
  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current || !dropdownRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const dropdownHeight = dropdownRef.current.offsetHeight;
    const viewportHeight = window.innerHeight;

    let top = rect.bottom + 4;
    if (top + dropdownHeight > viewportHeight) {
      top = rect.top - dropdownHeight - 4;
    }

    dropdownRef.current.style.top = `${top}px`;
    dropdownRef.current.style.left = `${rect.left}px`;
  }, [isOpen, viewMonth, viewYear]);

  // Click-outside: check both inputRef and dropdownRef since they're in different DOM trees
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => {
      const inInput = inputRef.current && inputRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inInput && !inDropdown) setIsOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00');
      setViewMonth(d.getMonth());
      setViewYear(d.getFullYear());
    }
  }, [value]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const days = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    return { daysInMonth, firstDay };
  }, [viewMonth, viewYear]);

  const monthName = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' });

  const handleSelect = (day) => {
    const date = new Date(viewYear, viewMonth, day);
    onChange(toLocalDateString(date));
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
  };

  const handleToday = () => {
    onChange(toLocalDateString(now));
    setIsOpen(false);
  };

  const displayValue = value
    ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const todayString = toLocalDateString(now);

  const dropdown = isOpen ? createPortal(
    <div ref={dropdownRef} className="datepicker-dropdown glass-panel" style={{ position: 'fixed', top: 0, left: 0 }}>
      <div className="datepicker-header">
        <button type="button" className="btn-icon" onClick={prevMonth}><ChevronLeft size={16} /></button>
        <span className="datepicker-month">{monthName} {viewYear}</span>
        <button type="button" className="btn-icon" onClick={nextMonth}><ChevronRight size={16} /></button>
      </div>
      <div className="datepicker-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="datepicker-grid">
        {Array.from({ length: days.firstDay }).map((_, i) => (
          <span key={`e-${i}`} className="datepicker-day empty" />
        ))}
        {Array.from({ length: days.daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isSelected = value === dateStr;
          const isToday = dateStr === todayString;
          return (
            <button
              key={day}
              type="button"
              className={`datepicker-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => handleSelect(day)}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="datepicker-footer">
        <button type="button" className="datepicker-action" onClick={handleToday}>Today</button>
        <button type="button" className="datepicker-action" onClick={() => { onChange(''); setIsOpen(false); }}>Clear</button>
      </div>
    </div>,
    document.body
  ) : null;

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
      {dropdown}
    </div>
  );
}
