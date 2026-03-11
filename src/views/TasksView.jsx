import { useState, useMemo } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import { useProjects } from '../contexts/ProjectContext';
import TaskList from '../components/Tasks/TaskList';
import TaskForm from '../components/Tasks/TaskForm';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import { Plus, CheckSquare } from 'lucide-react';
import './TasksView.css';

export default function TasksView() {
  const { mustDoTasks, upNextTasks, completedTasks } = useTasks();
  const { activeContext } = useContexts();
  const { projects } = useProjects();
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [filter, setFilter] = useState('active');
  const [groupBy, setGroupBy] = useState('category');

  const filteredMustDo = useMemo(() => {
    if (activeContext === 'all') return mustDoTasks;
    return mustDoTasks.filter(t => t.context_id === activeContext);
  }, [mustDoTasks, activeContext]);

  const filteredUpNext = useMemo(() => {
    if (activeContext === 'all') return upNextTasks;
    return upNextTasks.filter(t => t.context_id === activeContext);
  }, [upNextTasks, activeContext]);

  const filteredCompleted = useMemo(() => {
    if (activeContext === 'all') return completedTasks;
    return completedTasks.filter(t => t.context_id === activeContext);
  }, [completedTasks, activeContext]);

  const allActive = useMemo(() => [...filteredMustDo, ...filteredUpNext], [filteredMustDo, filteredUpNext]);

  const projectGroups = useMemo(() => {
    if (groupBy !== 'project') return [];
    const groups = {};
    allActive.forEach(t => {
      const key = t.project_id || 'none';
      if (!groups[key]) groups[key] = { name: t.projects?.name || 'No Project', tasks: [] };
      groups[key].tasks.push(t);
    });
    return Object.entries(groups).sort((a, b) => {
      if (a[0] === 'none') return 1;
      if (b[0] === 'none') return -1;
      return a[1].name.localeCompare(b[1].name);
    });
  }, [allActive, groupBy]);

  return (
    <div className="tasks-view">
      <div className="tasks-header">
        <div className="tasks-filters">
          <button className={`filter-btn ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Active</button>
          <button className={`filter-btn ${filter === 'completed' ? 'active' : ''}`} onClick={() => setFilter('completed')}>Completed</button>
          <button className={`filter-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <span className="filter-divider" />
          <button className={`filter-btn ${groupBy === 'category' ? 'active' : ''}`} onClick={() => setGroupBy('category')}>By Category</button>
          <button className={`filter-btn ${groupBy === 'project' ? 'active' : ''}`} onClick={() => setGroupBy('project')}>By Project</button>
        </div>
        <button className="btn-primary" onClick={() => setShowTaskForm(true)}>
          <Plus size={18} />
          <span>New Task</span>
        </button>
      </div>

      {(filter === 'active' || filter === 'all') && groupBy === 'category' && (
        <>
          <TaskList title="Must Do" tasks={filteredMustDo} category="must_do" />
          <div style={{ height: '24px' }} />
          <TaskList title="Up Next" tasks={filteredUpNext} category="up_next" />
        </>
      )}

      {(filter === 'active' || filter === 'all') && groupBy === 'project' && (
        <>
          {projectGroups.map(([key, group]) => (
            <div key={key}>
              <TaskList title={group.name} tasks={group.tasks} />
              <div style={{ height: '16px' }} />
            </div>
          ))}
        </>
      )}

      {(filter === 'completed' || filter === 'all') && filteredCompleted.length > 0 && (
        <>
          <div style={{ height: '24px' }} />
          <TaskList title="Completed" tasks={filteredCompleted} category="completed" />
        </>
      )}

      {filter === 'active' && filteredMustDo.length === 0 && filteredUpNext.length === 0 && (
        <EmptyState
          icon={CheckSquare}
          title="No active tasks"
          description="Create a task to get started."
          action="New Task"
          onAction={() => setShowTaskForm(true)}
        />
      )}

      <Modal isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} title="New Task">
        <TaskForm defaultContextId={activeContext !== 'all' ? activeContext : ''} onClose={() => setShowTaskForm(false)} />
      </Modal>
    </div>
  );
}
