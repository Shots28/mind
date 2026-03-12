import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, ChevronDown, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useContexts } from '../../contexts/ContextContext';
import { useTasks } from '../../contexts/TaskContext';
import NotificationPanel from '../Notifications/NotificationPanel';
import './Layout.css';

const routeTitles = {
    '/today': 'Today',
    '/calendar': 'Calendar',
    '/tasks': 'Tasks',
    '/journal': 'Journal',
    '/habits': 'Habits',
    '/projects': 'Projects',
};

const TopBar = ({ onOpenSettings }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, signOut } = useAuth();
    const { contexts, activeContext, setActiveContext } = useContexts();
    const { tasks } = useTasks();
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    const contextMenuRef = useRef(null);
    const userMenuRef = useRef(null);
    const searchRef = useRef(null);

    const pageTitle = routeTitles[location.pathname] || 'Mind';
    const currentDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
    const activeContextName = activeContext === 'all'
        ? 'All Contexts'
        : contexts.find(c => c.id === activeContext)?.name || 'All Contexts';

    // overdue count removed — handled by NotificationPanel

    const searchResults = searchQuery.trim()
        ? tasks.filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
        : [];

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) setShowContextMenu(false);
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
            if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearchResults(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
    };

    return (
        <header className="top-bar">
            <div className="top-bar-left">
                <div className="context-switcher glass-panel" ref={contextMenuRef}>
                    <div className="context-switcher-btn" onClick={() => setShowContextMenu(!showContextMenu)}>
                        <div className="context-indicator" style={activeContext !== 'all' ? { background: contexts.find(c => c.id === activeContext)?.color } : {}}></div>
                        <span className="context-name">{activeContextName}</span>
                        <ChevronDown size={16} className="context-icon" />
                    </div>
                    {showContextMenu && (
                        <div className="context-dropdown glass-panel">
                            <button
                                className={`context-option ${activeContext === 'all' ? 'active' : ''}`}
                                onClick={() => { setActiveContext('all'); setShowContextMenu(false); }}
                            >
                                <div className="context-indicator"></div>
                                <span>All Contexts</span>
                            </button>
                            {contexts.map(ctx => (
                                <button
                                    key={ctx.id}
                                    className={`context-option ${activeContext === ctx.id ? 'active' : ''}`}
                                    onClick={() => { setActiveContext(ctx.id); setShowContextMenu(false); }}
                                >
                                    <div className="context-indicator" style={{ background: ctx.color }}></div>
                                    <span>{ctx.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="top-bar-center">
                <h1 className="page-title">{pageTitle}</h1>
                <span className="current-date">{currentDate}</span>
            </div>

            <div className="top-bar-right">
                <div className="search-container" ref={searchRef}>
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search Mind..."
                        className="input-field search-input"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setShowSearchResults(true); }}
                        onFocus={() => searchQuery && setShowSearchResults(true)}
                    />
                    {showSearchResults && searchResults.length > 0 && (
                        <div className="search-dropdown glass-panel">
                            {searchResults.map(task => (
                                <button key={task.id} className="search-result" onClick={() => {
                                    navigate('/tasks');
                                    setSearchQuery('');
                                    setShowSearchResults(false);
                                }}>
                                    <span className={task.is_completed ? 'completed-text' : ''}>{task.title}</span>
                                    {task.contexts && <span className="search-result-context">{task.contexts.name}</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <NotificationPanel
                    isOpen={showNotifications}
                    onClose={() => setShowNotifications(!showNotifications)}
                />
                <div className="user-menu-wrapper" ref={userMenuRef}>
                    <div className="user-avatar" onClick={() => setShowUserMenu(!showUserMenu)}>
                        <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=6366f1&color=fff&size=64`} alt={userName} />
                    </div>
                    {showUserMenu && (
                        <div className="user-dropdown glass-panel">
                            <div className="user-dropdown-header">
                                <span className="user-dropdown-name">{userName}</span>
                                <span className="user-dropdown-email">{user?.email}</span>
                            </div>
                            <div className="user-dropdown-divider" />
                            <button className="user-dropdown-item" onClick={() => { onOpenSettings?.(); setShowUserMenu(false); }}>
                                <Settings size={16} />
                                <span>Settings</span>
                            </button>
                            <button className="user-dropdown-item" onClick={handleSignOut}>
                                <LogOut size={16} />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default TopBar;
