import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Calendar, CheckSquare, Plus, Settings } from 'lucide-react';
import TaskForm from '../Tasks/TaskForm';
import Modal from '../Common/Modal';
import './Layout.css';

const MobileNav = ({ onOpenSettings }) => {
    const [showTaskForm, setShowTaskForm] = useState(false);

    const navItems = [
        { name: 'Today', path: '/today', icon: <Home size={22} /> },
        { name: 'Calendar', path: '/calendar', icon: <Calendar size={22} /> },
        { name: 'Add', icon: <Plus size={24} />, isAction: true, action: 'task' },
        { name: 'Tasks', path: '/tasks', icon: <CheckSquare size={22} /> },
        { name: 'Settings', icon: <Settings size={22} />, isAction: true, action: 'settings' },
    ];

    const handleAction = (action) => {
        if (action === 'task') setShowTaskForm(true);
        if (action === 'settings') onOpenSettings?.();
    };

    return (
        <nav className="mobile-nav glass-panel">
            {navItems.map(item =>
                item.isAction ? (
                    <button
                        key={item.name}
                        className={`mobile-nav-item ${item.action === 'task' ? 'action-btn' : ''}`}
                        onClick={() => handleAction(item.action)}
                    >
                        {item.icon}
                        {item.action !== 'task' && <span>{item.name}</span>}
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
