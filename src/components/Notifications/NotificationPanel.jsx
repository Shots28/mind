import { useState, useRef, useEffect } from 'react';
import { useTasks } from '../../contexts/TaskContext';
import { Bell, AlertTriangle, Clock, CheckCircle, X } from 'lucide-react';
import './Notifications.css';

export default function NotificationPanel({ isOpen, onClose }) {
  const { tasks } = useTasks();
  const panelRef = useRef(null);
  const [dismissedIds, setDismissedIds] = useState(new Set());

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const today = new Date().toISOString().split('T')[0];

  const overdueTasks = tasks.filter(t => !t.is_completed && t.due_date && t.due_date < today);
  const dueTodayTasks = tasks.filter(t => !t.is_completed && t.due_date === today);
  const recentlyCompleted = tasks.filter(t => {
    if (!t.is_completed || !t.completed_at) return false;
    const completedTime = new Date(t.completed_at).getTime();
    return Date.now() - completedTime < 24 * 60 * 60 * 1000;
  });

  const allNotifications = [
    ...overdueTasks.map(t => ({ id: t.id, type: 'overdue', title: t.title, subtitle: `Due ${new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` })),
    ...dueTodayTasks.map(t => ({ id: t.id, type: 'due_today', title: t.title, subtitle: 'Due today' })),
    ...recentlyCompleted.map(t => ({ id: t.id, type: 'completed', title: t.title, subtitle: 'Completed' })),
  ];

  const notifications = allNotifications.filter(n => !dismissedIds.has(`${n.type}-${n.id}`));
  const badgeCount = notifications.filter(n => n.type === 'overdue' || n.type === 'due_today').length;

  const handleDismiss = (key) => {
    setDismissedIds(prev => new Set([...prev, key]));
  };

  const handleDismissAll = () => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      notifications.forEach(n => next.add(`${n.type}-${n.id}`));
      return next;
    });
  };

  const iconMap = {
    overdue: <AlertTriangle size={14} />,
    due_today: <Clock size={14} />,
    completed: <CheckCircle size={14} />,
  };

  if (!isOpen) {
    return (
      <div className="notification-wrapper">
        <button className="btn-icon" onClick={onClose}>
          <Bell size={20} />
          {badgeCount > 0 && <span className="notification-badge">{badgeCount}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="notification-wrapper" ref={panelRef}>
      <button className="btn-icon" onClick={onClose}>
        <Bell size={20} />
        {badgeCount > 0 && <span className="notification-badge">{badgeCount}</span>}
      </button>
      <div className="notification-panel glass-panel">
        <div className="notification-panel-header">
          <span>Notifications</span>
          <div className="notification-header-actions">
            {notifications.length > 0 && (
              <button className="notification-dismiss-all" onClick={handleDismissAll}>
                Clear all
              </button>
            )}
            <span className="notification-count">{notifications.length}</span>
          </div>
        </div>
        {notifications.length === 0 ? (
          <div className="notification-empty">All clear! No notifications.</div>
        ) : (
          <div className="notification-list">
            {notifications.map(n => (
              <div key={`${n.type}-${n.id}`} className={`notification-item ${n.type}`}>
                <div className={`notification-icon ${n.type}`}>{iconMap[n.type]}</div>
                <div className="notification-content">
                  <span className="notification-title">{n.title}</span>
                  <span className="notification-subtitle">{n.subtitle}</span>
                </div>
                <button
                  className="btn-icon notification-dismiss-btn"
                  onClick={() => handleDismiss(`${n.type}-${n.id}`)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
