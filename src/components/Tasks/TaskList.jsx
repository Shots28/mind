import { useState, useRef, useEffect } from 'react';
import { Check, MoreHorizontal, AlertCircle, Trash2, Edit3, ArrowUpDown, Plus } from 'lucide-react';
import { useTasks } from '../../contexts/TaskContext';
import { useContexts } from '../../contexts/ContextContext';
import { useToast } from '../Common/Toast';
import TaskForm from './TaskForm';
import Modal from '../Common/Modal';
import './Tasks.css';

const TaskItem = ({ task }) => {
    const { toggleComplete, deleteTask, updateTask } = useTasks();
    const { showToast } = useToast();
    const [menuOpen, setMenuOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const menuRef = useRef(null);

    const contextName = task.contexts?.name;
    const contextColor = task.contexts?.color || 'var(--text-secondary)';
    const projectName = task.projects?.name;
    const projectColor = task.projects?.color || 'var(--text-secondary)';

    useEffect(() => {
        if (!menuOpen) return;
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen]);

    return (
        <>
            <div className={`task-item ${task.is_completed ? 'completed' : ''}`}>
                <div
                    className={`task-checkbox ${task.is_completed ? 'checked' : ''}`}
                    onClick={() => toggleComplete(task.id, () => showToast('Task completed!'))}
                    role="checkbox"
                    aria-checked={task.is_completed}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && toggleComplete(task.id, () => showToast('Task completed!'))}
                >
                    {task.is_completed && <Check size={14} className="check-icon" />}
                </div>

                <div className="task-content" onClick={() => setEditing(true)} style={{ cursor: 'pointer' }}>
                    <span className="task-title">{task.title}</span>
                    {task.description && (
                        <p className="task-description">{task.description}</p>
                    )}
                    <div className="task-meta">
                        {contextName && <span className="task-context" style={{ color: contextColor }}>{contextName}</span>}
                        {projectName && <span className="task-project" style={{ color: projectColor }}>{projectName}</span>}
                        {task.priority && task.priority !== 'normal' && (
                            <span className={`task-priority ${task.priority}`}>
                                <AlertCircle size={12} /> {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                            </span>
                        )}
                        {task.due_date && (
                            <span className="task-due-date">
                                {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                        )}
                    </div>
                </div>

                <div className="task-actions-wrapper" ref={menuRef}>
                    <button className="btn-icon task-action" onClick={() => setMenuOpen(!menuOpen)}>
                        <MoreHorizontal size={18} />
                    </button>
                    {menuOpen && (
                        <div className="task-menu glass-panel">
                            <button onClick={() => { setEditing(true); setMenuOpen(false); }}>
                                <Edit3 size={14} /><span>Edit</span>
                            </button>
                            <button onClick={() => {
                                updateTask(task.id, { category: task.category === 'must_do' ? 'up_next' : 'must_do' });
                                setMenuOpen(false);
                            }}>
                                <ArrowUpDown size={14} /><span>Move to {task.category === 'must_do' ? 'Up Next' : 'Must Do'}</span>
                            </button>
                            <button className="danger" onClick={() => { deleteTask(task.id); setMenuOpen(false); }}>
                                <Trash2 size={14} /><span>Delete</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <Modal isOpen={editing} onClose={() => setEditing(false)} title="Edit Task">
                <TaskForm task={task} onClose={() => setEditing(false)} />
            </Modal>
        </>
    );
};

const TaskList = ({ tasks, title, category, defaultDueDate }) => {
    const { createTask } = useTasks();
    const { activeContext } = useContexts();
    const [quickAdd, setQuickAdd] = useState('');
    const [adding, setAdding] = useState(false);

    const handleQuickAdd = async (e) => {
        e.preventDefault();
        if (!quickAdd.trim()) return;
        setAdding(true);
        try {
            await createTask({
                title: quickAdd.trim(),
                category: category || 'up_next',
                context_id: activeContext !== 'all' ? activeContext : null,
                due_date: defaultDueDate || null,
            });
            setQuickAdd('');
        } catch (err) {
            console.error(err);
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="task-list-container">
            {title && <h3 className="section-title">{title}</h3>}
            <div className="task-list">
                {tasks.length === 0 && category !== 'completed' && (
                    <div className="task-list-empty">No tasks yet</div>
                )}
                {tasks.map(task => (
                    <TaskItem key={task.id} task={task} />
                ))}
                {category && category !== 'completed' && (
                    <form className="quick-add-form" onSubmit={handleQuickAdd}>
                        <Plus size={16} className="quick-add-icon" />
                        <input
                            type="text"
                            className="quick-add-input"
                            placeholder="Add a task..."
                            value={quickAdd}
                            onChange={(e) => setQuickAdd(e.target.value)}
                            disabled={adding}
                        />
                    </form>
                )}
            </div>
        </div>
    );
};

export default TaskList;
