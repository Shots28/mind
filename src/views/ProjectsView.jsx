import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects } from '../contexts/ProjectContext';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import TaskForm from '../components/Tasks/TaskForm';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import { Plus, FolderOpen, MoreHorizontal, Trash2, Edit3, Archive, Clock, ArrowRight, Check } from 'lucide-react';
import { useToast } from '../components/Common/Toast';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import './ProjectsView.css';

function ProjectForm({ onClose, project = null, contexts, showToast }) {
  const { createProject, updateProject } = useProjects();
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [contextId, setContextId] = useState(project?.context_id || '');
  const [color, setColor] = useState(project?.color || '#3b82f6');
  const [loading, setLoading] = useState(false);

  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const data = { name: name.trim(), description: description.trim() || null, context_id: contextId || null, color };
      if (project) await updateProject(project.id, data);
      else await createProject(data);
      onClose();
      showToast('Project saved');
    } catch (err) {
      console.error(err);
      showToast('Failed to save project', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <input type="text" className="input-field" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      <textarea className="input-field" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
      <select className="input-field" value={contextId} onChange={(e) => setContextId(e.target.value)}>
        <option value="">No context</option>
        {contexts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Color</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {colors.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
      <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
        {loading ? 'Saving...' : project ? 'Update Project' : 'Create Project'}
      </button>
    </form>
  );
}

function ProjectCard({ project, stats, recentTasks, menuOpen, setMenuOpen, setEditingProject, setShowForm, updateProject, deleteProject, undoDeleteProject, toggleComplete, createTask, setEditingTask, navigate, showToast }) {
  const [quickAdd, setQuickAdd] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (menuOpen !== project.id) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, project.id, setMenuOpen]);

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickAdd.trim() || adding) return;
    setAdding(true);
    try {
      await createTask({
        title: quickAdd.trim(),
        project_id: project.id,
        category: 'up_next',
        context_id: project.context_id || null,
      });
      setQuickAdd('');
      showToast('Task added');
    } catch (err) {
      console.error(err);
      showToast('Failed to add task', { type: 'error' });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="project-card glass-panel" style={{ borderTopColor: project.color }}>
      <div className="project-card-header">
        <h3 className="project-card-name">{project.name}</h3>
        <div className="project-menu-wrapper" ref={menuRef}>
          <button className="btn-icon" onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}>
            <MoreHorizontal size={18} />
          </button>
          {menuOpen === project.id && (
            <div className="project-menu glass-panel">
              <button onClick={() => { setEditingProject(project); setShowForm(true); setMenuOpen(null); }}>
                <Edit3 size={14} /><span>Edit</span>
              </button>
              <button onClick={() => { updateProject(project.id, { status: 'archived' }); setMenuOpen(null); }}>
                <Archive size={14} /><span>Archive</span>
              </button>
              <button className="danger" onClick={() => { setConfirmDelete(true); setMenuOpen(null); }}>
                <Trash2 size={14} /><span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {project.description && <p className="project-card-desc">{project.description}</p>}
      <div className="project-card-meta">
        {project.contexts && <span className="project-context-badge" style={{ color: project.contexts.color }}>{project.contexts.name}</span>}
        {stats.nearestDue && (
          <span className="project-due-date">
            <Clock size={12} />
            {new Date(stats.nearestDue + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <div className="project-card-stats">
        <div className="project-stat-row">
          <span className="project-task-count">{stats.total} task{stats.total !== 1 ? 's' : ''}</span>
          <span className="project-stat-text">{stats.completed} done</span>
        </div>
        <div className="project-progress-bar">
          <div className="project-progress-fill" style={{ width: `${stats.percent}%`, background: project.color }} />
        </div>
      </div>
      {recentTasks.length > 0 ? (
        <div className="project-recent-tasks">
          {recentTasks.map(t => (
            <div key={t.id} className="project-recent-task">
              <div
                className={`project-task-checkbox ${t.is_completed ? 'checked' : ''}`}
                onClick={(e) => { e.stopPropagation(); toggleComplete(t.id, () => showToast('Task completed!')); }}
              >
                {t.is_completed && <Check size={10} />}
              </div>
              <span className="project-task-title" onClick={() => setEditingTask(t)}>{t.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="project-empty-tasks">No active tasks</div>
      )}
      <form className="project-quick-add" onSubmit={handleQuickAdd}>
        <Plus size={14} className="project-quick-add-icon" />
        <input
          type="text"
          className="project-quick-add-input"
          placeholder="Add task..."
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          disabled={adding}
        />
      </form>
      <button className="project-view-all" onClick={() => navigate(`/tasks?project=${project.id}`)}>
        View all tasks <ArrowRight size={14} />
      </button>
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteProject(project.id, { undo: true });
          showToast('Project deleted', { duration: 5000, action: { label: 'Undo', onClick: undoDeleteProject } });
        }}
        title="Delete Project"
        message={`Are you sure you want to delete "${project.name}"? Tasks in this project will not be deleted.`}
      />
    </div>
  );
}

export default function ProjectsView() {
  const { projects, loading, deleteProject, undoDeleteProject, updateProject } = useProjects();
  const { tasks, toggleComplete, createTask } = useTasks();
  const { contexts, activeContext } = useContexts();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);

  const getProjectStats = (projectId) => {
    const projectTasks = tasks.filter(t => t.project_id === projectId);
    const completed = projectTasks.filter(t => t.is_completed).length;
    const activeTasks = projectTasks.filter(t => !t.is_completed);
    const withDue = activeTasks.filter(t => t.due_date).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const nearestDue = withDue.length > 0 ? withDue[0].due_date : null;
    return { total: projectTasks.length, completed, percent: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0, nearestDue };
  };

  const allActive = projects.filter(p => p.status === 'active');
  const allArchived = projects.filter(p => p.status !== 'active');
  const activeProjects = activeContext === 'all' ? allActive : allActive.filter(p => p.context_id === activeContext);
  const archivedProjects = activeContext === 'all' ? allArchived : allArchived.filter(p => p.context_id === activeContext);

  return (
    <div className="projects-view">
      <div className="projects-header">
        <h2 className="section-title">Projects</h2>
        <button className="btn-primary" onClick={() => { setEditingProject(null); setShowForm(true); }}>
          <Plus size={18} /><span>New Project</span>
        </button>
      </div>

      {activeProjects.length === 0 && !loading ? (
        <EmptyState icon={FolderOpen} title="No projects yet" description="Group related tasks together under a project." tips={["Tip: Keep projects focused — one clear goal per project works best."]} action="New Project" onAction={() => setShowForm(true)} />
      ) : (
        <div className="projects-grid">
          {activeProjects.map(project => {
            const stats = getProjectStats(project.id);
            const recentTasks = tasks.filter(t => t.project_id === project.id && !t.is_completed).slice(0, 5);
            return (
              <ProjectCard
                key={project.id}
                project={project}
                stats={stats}
                recentTasks={recentTasks}
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
                setEditingProject={setEditingProject}
                setShowForm={setShowForm}
                updateProject={updateProject}
                deleteProject={deleteProject}
                undoDeleteProject={undoDeleteProject}
                toggleComplete={toggleComplete}
                createTask={createTask}
                setEditingTask={setEditingTask}
                navigate={navigate}
                showToast={showToast}
              />
            );
          })}
        </div>
      )}

      {archivedProjects.length > 0 && (
        <div className="archived-section">
          <h3 className="section-title" style={{ marginTop: '32px' }}>Archived</h3>
          <div className="projects-grid">
            {archivedProjects.map(project => (
              <div key={project.id} className="project-card glass-panel archived" style={{ borderTopColor: project.color }}>
                <h3 className="project-card-name">{project.name}</h3>
                <button className="btn-icon" style={{ fontSize: '13px', color: 'var(--accent-color)' }} onClick={() => updateProject(project.id, { status: 'active' })}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditingProject(null); }} title={editingProject ? 'Edit Project' : 'New Project'}>
        <ProjectForm onClose={() => { setShowForm(false); setEditingProject(null); }} project={editingProject} contexts={contexts} showToast={showToast} />
      </Modal>

      <Modal isOpen={!!editingTask} onClose={() => setEditingTask(null)} title="Edit Task">
        <TaskForm task={editingTask} onClose={() => setEditingTask(null)} />
      </Modal>
    </div>
  );
}
