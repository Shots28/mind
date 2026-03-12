import { useState, useRef } from 'react';
import CalendarDropdown from '../Common/CalendarDropdown';

export default function InlineDatePicker({ value, onChange, children }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);

  const handleClick = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <>
      <span ref={triggerRef} onClick={handleClick} className="inline-date-trigger">
        {children}
      </span>
      <CalendarDropdown
        value={value}
        onChange={onChange}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
      />
    </>
  );
}
