import { useState, useRef, useEffect } from 'react';
import { useProjects } from '../contexts/ProjectContext';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import { Plus, FolderOpen, MoreHorizontal, Trash2, Edit3, Archive } from 'lucide-react';
import './ProjectsView.css';

function ProjectForm({ onClose, project = null, contexts }) {
  const { createProject, updateProject } = useProjects();
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [contextId, setContextId] = useState(project?.context_id || '');
  const [color, setColor] = useState(project?.color || '#6366f1');
  const [loading, setLoading] = useState(false);

  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const data = { name: name.trim(), description: description.trim() || null, context_id: contextId || null, color };
      if (project) await updateProject(project.id, data);
      else await createProject(data);
      onClose();
    } catch (err) {
      console.error(err);
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

export default function ProjectsView() {
  const { projects, loading, deleteProject, updateProject } = useProjects();
  const { tasks } = useTasks();
  const { contexts } = useContexts();
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const menuRef = useRef(null);
  const { activeContext } = useContexts();

  useEffect(() => {
    if (menuOpen === null) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const getProjectStats = (projectId) => {
    const projectTasks = tasks.filter(t => t.project_id === projectId);
    const completed = projectTasks.filter(t => t.is_completed).length;
    return { total: projectTasks.length, completed, percent: projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0 };
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
        <EmptyState icon={FolderOpen} title="No projects yet" description="Create a project to organize your tasks." action="New Project" onAction={() => setShowForm(true)} />
      ) : (
        <div className="projects-grid">
          {activeProjects.map(project => {
            const stats = getProjectStats(project.id);
            return (
              <div key={project.id} className="project-card glass-panel" style={{ borderTopColor: project.color }}>
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
                        <button className="danger" onClick={() => { deleteProject(project.id); setMenuOpen(null); }}>
                          <Trash2 size={14} /><span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {project.description && <p className="project-card-desc">{project.description}</p>}
                {project.contexts && <span className="project-context-badge" style={{ color: project.contexts.color }}>{project.contexts.name}</span>}
                <div className="project-card-stats">
                  <div className="project-progress-bar">
                    <div className="project-progress-fill" style={{ width: `${stats.percent}%`, background: project.color }} />
                  </div>
                  <span className="project-stat-text">{stats.completed}/{stats.total} tasks</span>
                </div>
                {(() => {
                  const recentTasks = tasks.filter(t => t.project_id === project.id && !t.is_completed).slice(0, 3);
                  return recentTasks.length > 0 && (
                    <div className="project-recent-tasks">
                      {recentTasks.map(t => (
                        <div key={t.id} className="project-recent-task">{t.title}</div>
                      ))}
                    </div>
                  );
                })()}
              </div>
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
        <ProjectForm onClose={() => { setShowForm(false); setEditingProject(null); }} project={editingProject} contexts={contexts} />
      </Modal>
    </div>
  );
}
