import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalDateString } from '../../lib/dates';
import './DatePicker.css';

function CalendarDropdownInner({ value, onChange, onClose, triggerRef }) {
  const dropdownRef = useRef(null);
  const now = new Date();

  const initialDate = value ? new Date(value + 'T12:00:00') : now;
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());

  useLayoutEffect(() => {
    if (!triggerRef?.current || !dropdownRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dh = dropdownRef.current.offsetHeight;
    const vh = window.innerHeight;
    let top = rect.bottom + 4;
    if (top + dh > vh) top = rect.top - dh - 4;
    dropdownRef.current.style.top = `${top}px`;
    dropdownRef.current.style.left = `${rect.left}px`;
  }, [viewMonth, viewYear, triggerRef]);

  useEffect(() => {
    const handle = (e) => {
      const inTrigger = triggerRef?.current && triggerRef.current.contains(e.target);
      const inDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!inTrigger && !inDropdown) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [triggerRef, onClose]);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }, [viewMonth]);

  const days = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    return { daysInMonth, firstDay };
  }, [viewMonth, viewYear]);

  const monthName = new Date(viewYear, viewMonth).toLocaleString('default', { month: 'long' });
  const todayString = toLocalDateString(now);

  const handleSelect = (day) => {
    const date = new Date(viewYear, viewMonth, day);
    onChange(toLocalDateString(date));
    onClose();
  };

  return createPortal(
    <div ref={dropdownRef} className="datepicker-dropdown glass-panel" style={{ position: 'fixed', top: 0, left: 0 }}>
      <div className="datepicker-header">
        <button type="button" className="btn-icon" onClick={prevMonth}><ChevronLeft size={16} /></button>
        <span className="datepicker-month">{monthName} {viewYear}</span>
        <button type="button" className="btn-icon" onClick={nextMonth}><ChevronRight size={16} /></button>
      </div>
      <div className="datepicker-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="datepicker-grid">
        {Array.from({ length: days.firstDay }).map((_, i) => (
          <span key={`e-${i}`} className="datepicker-day empty" />
        ))}
        {Array.from({ length: days.daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <button
              key={day}
              type="button"
              className={`datepicker-day ${value === dateStr ? 'selected' : ''} ${dateStr === todayString ? 'today' : ''}`}
              onClick={() => handleSelect(day)}
            >
              {day}
            </button>
          );
        })}
      </div>
      <div className="datepicker-footer">
        <button type="button" className="datepicker-action" onClick={() => { onChange(todayString); onClose(); }}>Today</button>
        <button type="button" className="datepicker-action" onClick={() => { onChange(''); onClose(); }}>Clear</button>
      </div>
    </div>,
    document.body
  );
}

// Wrapper that mounts/unmounts inner component when isOpen changes,
// resetting viewMonth/viewYear to match value on each open
export default function CalendarDropdown({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <CalendarDropdownInner {...props} />;
}
