import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CheckSquare, Plus, MoreHorizontal, Calendar, BookOpen, FolderOpen, Repeat, Settings } from 'lucide-react';
import TaskForm from '../Tasks/TaskForm';
import Modal from '../Common/Modal';
import './Layout.css';

const MobileNav = ({ onOpenSettings }) => {
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [showMore, setShowMore] = useState(false);
    const moreRef = useRef(null);

    useEffect(() => {
        if (!showMore) return;
        const handleClickOutside = (e) => {
            if (moreRef.current && !moreRef.current.contains(e.target)) setShowMore(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMore]);

    return (
        <nav className="mobile-nav glass-panel">
            <NavLink to="/today" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
                <Home size={22} /><span>Today</span>
            </NavLink>
            <NavLink to="/tasks" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
                <CheckSquare size={22} /><span>Tasks</span>
            </NavLink>
            <button className="mobile-nav-item action-btn" onClick={() => setShowTaskForm(true)}>
                <Plus size={24} />
            </button>
            <NavLink to="/journal" className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}>
                <BookOpen size={22} /><span>Journal</span>
            </NavLink>
            <div className="mobile-nav-more-wrapper" ref={moreRef}>
                <button className={`mobile-nav-item ${showMore ? 'active' : ''}`} onClick={() => setShowMore(!showMore)}>
                    <MoreHorizontal size={22} /><span>More</span>
                </button>
                {showMore && (
                    <div className="mobile-nav-more-menu glass-panel">
                        <NavLink to="/calendar" className="mobile-more-item" onClick={() => setShowMore(false)}>
                            <Calendar size={18} /><span>Calendar</span>
                        </NavLink>
                        <NavLink to="/projects" className="mobile-more-item" onClick={() => setShowMore(false)}>
                            <FolderOpen size={18} /><span>Projects</span>
                        </NavLink>
                        <NavLink to="/habits" className="mobile-more-item" onClick={() => setShowMore(false)}>
                            <Repeat size={18} /><span>Habits</span>
                        </NavLink>
                        <button className="mobile-more-item" onClick={() => { onOpenSettings?.(); setShowMore(false); }}>
                            <Settings size={18} /><span>Settings</span>
                        </button>
                    </div>
                )}
            </div>

            <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
                <TaskForm onClose={() => setShowTaskForm(false)} />
            </Modal>
        </nav>
    );
};

export default MobileNav;
