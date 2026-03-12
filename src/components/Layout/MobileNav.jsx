import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Calendar, CheckSquare, Plus, Repeat } from 'lucide-react';
import TaskForm from '../Tasks/TaskForm';
import Modal from '../Common/Modal';
import './Layout.css';

const MobileNav = () => {
    const [showTaskForm, setShowTaskForm] = useState(false);

    const navItems = [
        { name: 'Today', path: '/today', icon: <Home size={22} /> },
        { name: 'Calendar', path: '/calendar', icon: <Calendar size={22} /> },
        { name: 'Add', icon: <Plus size={24} />, isAction: true },
        { name: 'Tasks', path: '/tasks', icon: <CheckSquare size={22} /> },
        { name: 'Habits', path: '/habits', icon: <Repeat size={22} /> },
    ];

    return (
        <nav className="mobile-nav glass-panel">
            {navItems.map(item =>
                item.isAction ? (
                    <button
                        key={item.name}
                        className="mobile-nav-item action-btn"
                        onClick={() => setShowTaskForm(true)}
                    >
                        {item.icon}
                    </button>
                ) : (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
                    >
                        {item.icon}
                        <span>{item.name}</span>
                    </NavLink>
                )
            )}

            <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
                <TaskForm onClose={() => setShowTaskForm(false)} />
            </Modal>
        </nav>
    );
};

export default MobileNav;
