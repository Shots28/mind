import { useState, useRef, useEffect } from 'react';
import { Check, MoreHorizontal, AlertCircle, Trash2, Edit3, ArrowUpDown, Plus, GripVertical, ChevronDown } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useTasks } from '../../contexts/TaskContext';
import { useContexts } from '../../contexts/ContextContext';
import { useCategories } from '../../contexts/CategoryContext';
import { useToast } from '../Common/Toast';
import TaskForm from './TaskForm';
import Modal from '../Common/Modal';
import InlineDatePicker from './InlineDatePicker';
import './Tasks.css';

const DraggableWrapper = ({ id, data, children }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data });
    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
    };
    return (
        <div ref={setNodeRef} style={style}>
            <div className="drag-handle" {...attributes} {...listeners}>
                <GripVertical size={14} />
            </div>
            {children}
        </div>
    );
};

const TaskItem = ({ task }) => {
    const { toggleComplete, deleteTask, updateTask } = useTasks();
    const { categories } = useCategories();
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
                            <InlineDatePicker value={task.due_date} onChange={(d) => updateTask(task.id, { due_date: d || null })}>
                                <span className="task-due-date inline-date-clickable">
                                    {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                            </InlineDatePicker>
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
                            {categories.filter(c => c.id !== task.category).map(c => (
                                <button key={c.id} onClick={() => {
                                    updateTask(task.id, { category: c.id });
                                    setMenuOpen(false);
                                }}>
                                    <ArrowUpDown size={14} /><span>Move to {c.name}</span>
                                </button>
                            ))}
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

const DroppableList = ({ droppableId, children }) => {
    const { setNodeRef, isOver } = useDroppable({ id: droppableId });
    return (
        <div className={`task-list ${isOver ? 'droppable-over' : ''}`} ref={setNodeRef}>
            {children}
        </div>
    );
};

const TaskList = ({ tasks, title, category, defaultDueDate, draggable = false, droppableId, collapsible = true }) => {
    const { createTask } = useTasks();
    const { activeContext } = useContexts();
    const [quickAdd, setQuickAdd] = useState('');
    const [adding, setAdding] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

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

    const taskItems = tasks.map(task => (
        draggable ? (
            <DraggableWrapper key={task.id} id={task.id} data={{ task }}>
                <TaskItem task={task} />
            </DraggableWrapper>
        ) : (
            <TaskItem key={task.id} task={task} />
        )
    ));

    const emptyState = tasks.length === 0 && category !== 'completed' && (
        <div className="task-list-empty">No tasks yet</div>
    );

    const quickAddForm = category && category !== 'completed' && (
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
    );

    const listContent = collapsed ? null : (
        <>
            {emptyState}
            {taskItems}
            {quickAddForm}
        </>
    );

    return (
        <div className="task-list-container">
            {title && (
                <div className={`section-header ${collapsible ? 'collapsible' : ''}`} onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}>
                    <h3 className="section-title">
                        {title}
                        {tasks.length > 0 && <span className="section-count">{tasks.length}</span>}
                    </h3>
                    {collapsible && (
                        <ChevronDown size={16} className={`section-chevron ${collapsed ? '' : 'expanded'}`} />
                    )}
                </div>
            )}
            {draggable ? (
                <DroppableList droppableId={droppableId || category}>
                    {listContent}
                </DroppableList>
            ) : (
                <div className="task-list">
                    {listContent}
                </div>
            )}
        </div>
    );
};

export { TaskItem };
export default TaskList;
