import { useState, useMemo, useCallback } from 'react';
import { toLocalDateString } from '../lib/dates';

export default function useCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth(prev => {
      if (prev === 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(prev => {
      if (prev === 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
  }, []);

  const calendarData = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const monthName = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' });

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const date = new Date(currentYear, currentMonth, day);
      const isToday = date.toDateString() === now.toDateString();
      return { day, date, isToday, dateString: toLocalDateString(date) };
    });

    return {
      year: currentYear,
      month: currentMonth,
      monthName,
      days,
      emptySlots: firstDayOfWeek,
      daysInMonth,
    };
  }, [currentMonth, currentYear]);

  return { ...calendarData, goToPrevMonth, goToNextMonth, goToToday };
}
