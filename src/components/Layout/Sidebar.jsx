import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    Home,

    CheckSquare,
    Book,
    Settings,
    LayoutDashboard,
    Repeat,
    Plus
} from 'lucide-react';
import TaskForm from '../Tasks/TaskForm';
import Modal from '../Common/Modal';
import './Layout.css';

const Sidebar = ({ onOpenSettings }) => {
    const [showTaskForm, setShowTaskForm] = useState(false);

    const navItems = [
        { name: 'Today', path: '/today', icon: <Home size={20} /> },
        { name: 'Tasks', path: '/tasks', icon: <CheckSquare size={20} /> },
        { name: 'Journal', path: '/journal', icon: <Book size={20} /> },
        { name: 'Habits', path: '/habits', icon: <Repeat size={20} /> },
        { name: 'Projects', path: '/projects', icon: <LayoutDashboard size={20} /> },
    ];

    return (
        <aside className="sidebar glass-panel">
            <div className="sidebar-header">
                <div className="logo-container">
                    <div className="logo-mark">M</div>
                    <span className="logo-text">Mind</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <NavLink
                        key={item.name}
                        to={item.path}
                        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    >
                        {item.icon}
                        <span>{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button className="btn-primary new-action-btn" onClick={() => setShowTaskForm(true)}>
                    <Plus size={18} />
                    <span>New</span>
                </button>
                <button className="nav-item settings-btn" onClick={onOpenSettings}>
                    <Settings size={20} />
                    <span>Settings</span>
                </button>
            </div>

            <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
                <TaskForm onClose={() => setShowTaskForm(false)} />
            </Modal>
        </aside>
    );
};

export default Sidebar;
