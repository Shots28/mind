import { useState } from 'react';
import { useTasks } from '../../contexts/TaskContext';
import { useContexts } from '../../contexts/ContextContext';
import { useProjects } from '../../contexts/ProjectContext';
import { useCategories } from '../../contexts/CategoryContext';
import DatePicker from '../Common/DatePicker';
import './TaskForm.css';

export default function TaskForm({ task = null, defaultCategory = 'must_do', defaultContextId = '', defaultDueDate = '', onClose }) {
  const { createTask, updateTask } = useTasks();
  const { contexts } = useContexts();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState(task?.priority || 'normal');
  const [category, setCategory] = useState(task?.category || defaultCategory);
  const [contextId, setContextId] = useState(task?.context_id || defaultContextId);
  const [projectId, setProjectId] = useState(task?.project_id || '');
  const [dueDate, setDueDate] = useState(task?.due_date || defaultDueDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        category,
        context_id: contextId || null,
        project_id: projectId || null,
        due_date: dueDate || null,
      };
      if (task) await updateTask(task.id, data);
      else await createTask(data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="task-form">
      {error && <div className="task-form-error">{error}</div>}
      <input
        type="text"
        className="input-field"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        required
      />
      <textarea
        className="input-field task-form-desc"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
      />
      <div className="task-form-row">
        <div className="task-form-field">
          <label>Category</label>
          <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="task-form-field">
          <label>Priority</label>
          <select className="input-field" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>
      <div className="task-form-row">
        <div className="task-form-field">
          <label>Context</label>
          <select className="input-field" value={contextId} onChange={(e) => setContextId(e.target.value)}>
            <option value="">None</option>
            {contexts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="task-form-field">
          <label>Project</label>
          <select className="input-field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">None</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="task-form-field">
        <label>Due Date</label>
        <DatePicker value={dueDate} onChange={setDueDate} />
      </div>
      <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
        {loading ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
      </button>
    </form>
  );
}
