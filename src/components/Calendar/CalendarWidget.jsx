import React from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';
import useCalendar from '../../hooks/useCalendar';
import { useEvents } from '../../contexts/EventContext';
import { useTasks } from '../../contexts/TaskContext';
import './Calendar.css';

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarWidget = () => {
    const calendar = useCalendar();
    const { events } = useEvents();
    const { tasks } = useTasks();

    const hasItemsOnDay = (dateString) => {
        const hasEvent = events.some(e => e.start_date && e.start_date.startsWith(dateString));
        const hasTask = tasks.some(t => t.due_date === dateString);
        return hasEvent || hasTask;
    };

    return (
        <div className="calendar-widget glass-panel">
            <div className="calendar-header">
                <h3 className="widget-title">
                    <CalIcon size={18} className="widget-icon" />
                    {calendar.monthName} {calendar.year}
                </h3>
                <div className="calendar-nav">
                    <button className="btn-icon" onClick={calendar.goToPrevMonth}><ChevronLeft size={16} /></button>
                    <button className="btn-icon" onClick={calendar.goToNextMonth}><ChevronRight size={16} /></button>
                </div>
            </div>

            <div className="calendar-grid">
                {daysOfWeek.map(day => (
                    <div key={day} className="calendar-day-header">{day}</div>
                ))}
                {Array.from({ length: calendar.emptySlots }).map((_, i) => (
                    <div key={`empty-${i}`} className="calendar-day empty"></div>
                ))}
                {calendar.days.map(day => {
                    const hasItems = hasItemsOnDay(day.dateString);
                    return (
                        <div
                            key={day.day}
                            className={`calendar-day ${day.isToday ? 'active' : ''} ${hasItems ? 'has-events' : ''}`}
                        >
                            {day.day}
                            {hasItems && <div className="event-dot"></div>}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CalendarWidget;
