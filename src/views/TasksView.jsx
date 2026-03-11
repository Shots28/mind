import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { useTasks } from '../contexts/TaskContext';
import { useContexts } from '../contexts/ContextContext';
import { useProjects } from '../contexts/ProjectContext';
import TaskList, { TaskItem } from '../components/Tasks/TaskList';
import TaskForm from '../components/Tasks/TaskForm';
import Modal from '../components/Common/Modal';
import EmptyState from '../components/Common/EmptyState';
import { Plus, CheckSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import './TasksView.css';

export default function TasksView() {
  const { mustDoTasks, upNextTasks, completedTasks, updateTask } = useTasks();
  const { activeContext } = useContexts();
  const { projects } = useProjects();
  const [searchParams] = useSearchParams();
  const projectFilter = searchParams.get('project');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [filter, setFilter] = useState('active');
  const [groupBy, setGroupBy] = useState('category');
  const [dateFilter, setDateFilter] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const shiftDate = (dir) => {
    const d = dateFilter ? new Date(dateFilter + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + dir);
    setDateFilter(d.toISOString().split('T')[0]);
  };

  const filteredMustDo = useMemo(() => {
    let filtered = activeContext === 'all' ? mustDoTasks : mustDoTasks.filter(t => t.context_id === activeContext);
    if (projectFilter) filtered = filtered.filter(t => t.project_id === projectFilter);
    if (dateFilter) filtered = filtered.filter(t => t.due_date === dateFilter);
    return filtered;
  }, [mustDoTasks, activeContext, projectFilter, dateFilter]);

  const filteredUpNext = useMemo(() => {
    let filtered = activeContext === 'all' ? upNextTasks : upNextTasks.filter(t => t.context_id === activeContext);
    if (projectFilter) filtered = filtered.filter(t => t.project_id === projectFilter);
    if (dateFilter) filtered = filtered.filter(t => t.due_date === dateFilter);
    return filtered;
  }, [upNextTasks, activeContext, projectFilter, dateFilter]);

  const filteredCompleted = useMemo(() => {
    let filtered = activeContext === 'all' ? completedTasks : completedTasks.filter(t => t.context_id === activeContext);
    if (projectFilter) filtered = filtered.filter(t => t.project_id === projectFilter);
    if (dateFilter) filtered = filtered.filter(t => t.due_date === dateFilter);
    return filtered;
  }, [completedTasks, activeContext, projectFilter, dateFilter]);

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

  const handleDragStart = (event) => {
    setActiveTask(event.active.data.current?.task || null);
  };

  const handleCategoryDragEnd = (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const task = active.data.current?.task;
    if (!task) return;
    if (task.category !== over.id) {
      updateTask(task.id, { category: over.id });
    }
  };

  const handleProjectDragEnd = (event) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;
    const task = active.data.current?.task;
    if (!task) return;
    const newProjectId = over.id === 'none' ? null : over.id;
    const currentProjectId = task.project_id || null;
    if (currentProjectId !== newProjectId) {
      updateTask(task.id, { project_id: newProjectId });
    }
  };

  return (
    <div className="tasks-view">
      <div className="tasks-header-wrap">
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
        <div className="date-nav">
          <button className={`filter-btn ${!dateFilter ? 'active' : ''}`} onClick={() => setDateFilter(null)}>All Dates</button>
          <span className="filter-divider" />
          <button className="btn-icon date-nav-arrow" onClick={() => shiftDate(-1)}><ChevronLeft size={16} /></button>
          <button
            className={`filter-btn date-nav-label ${dateFilter ? 'active' : ''}`}
            onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
          >
            {dateFilter
              ? new Date(dateFilter + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : 'Today'}
          </button>
          <button className="btn-icon date-nav-arrow" onClick={() => shiftDate(1)}><ChevronRight size={16} /></button>
        </div>
      </div>

      {(filter === 'active' || filter === 'all') && groupBy === 'category' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleCategoryDragEnd}>
          <TaskList title="Must Do" tasks={filteredMustDo} category="must_do" draggable droppableId="must_do" />
          <div style={{ height: '24px' }} />
          <TaskList title="Up Next" tasks={filteredUpNext} category="up_next" draggable droppableId="up_next" />
          <DragOverlay>
            {activeTask ? <div className="drag-overlay"><TaskItem task={activeTask} /></div> : null}
          </DragOverlay>
        </DndContext>
      )}

      {(filter === 'active' || filter === 'all') && groupBy === 'project' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleProjectDragEnd}>
          {projectGroups.map(([key, group]) => (
            <div key={key}>
              <TaskList title={group.name} tasks={group.tasks} draggable droppableId={key} />
              <div style={{ height: '16px' }} />
            </div>
          ))}
          <DragOverlay>
            {activeTask ? <div className="drag-overlay"><TaskItem task={activeTask} /></div> : null}
          </DragOverlay>
        </DndContext>
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
