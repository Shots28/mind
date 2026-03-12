import { useState } from 'react';
import { useHabits } from '../contexts/HabitContext';
import { useContexts } from '../contexts/ContextContext';
import HabitList from '../components/Habits/HabitList';
import HabitForm from '../components/Habits/HabitForm';
import HabitStats from '../components/Habits/HabitStats';
import Modal from '../components/Common/Modal';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import EmptyState from '../components/Common/EmptyState';
import { Plus, Repeat, Trash2, Edit3 } from 'lucide-react';
import './HabitsView.css';

export default function HabitsView() {
  const { habits, loading, deleteHabit } = useHabits();
  const { activeContext } = useContexts();
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = activeContext === 'all' ? habits : habits.filter(h => h.context_id === activeContext);

  return (
    <div className="habits-view">
      <div className="habits-header">
        <h2 className="section-title">Habits & Routines</h2>
        <button className="btn-primary" onClick={() => { setEditingHabit(null); setShowForm(true); }}>
          <Plus size={18} /><span>New Habit</span>
        </button>
      </div>

      <div className="habits-layout">
        <div className="habits-main">
          <div className="habits-section glass-panel">
            <h3 className="habits-section-title">Today's Routine</h3>
            <HabitList />
            {filtered.length === 0 && !loading && (
              <EmptyState icon={Repeat} title="No habits yet" description="Create a habit to build your daily routine." action="New Habit" onAction={() => setShowForm(true)} />
            )}
          </div>

          <div className="habits-section glass-panel">
            <h3 className="habits-section-title">All Habits</h3>
            <div className="habits-manage-list">
              {filtered.map(habit => (
                <div key={habit.id} className="habit-manage-item">
                  <div className="habit-manage-color" style={{ background: habit.color }} />
                  <div className="habit-manage-info">
                    <span className="habit-manage-title">{habit.title}</span>
                    <span className="habit-manage-freq">{habit.frequency}</span>
                  </div>
                  {habit.contexts?.name && (
                    <span className="habit-manage-context" style={{ color: habit.contexts.color }}>{habit.contexts.name}</span>
                  )}
                  <button className="btn-icon" onClick={() => { setEditingHabit(habit); setShowForm(true); }}>
                    <Edit3 size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => setDeleteTarget(habit)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="habits-sidebar">
          <div className="habits-section glass-panel">
            <h3 className="habits-section-title">Progress</h3>
            <HabitStats />
          </div>
        </div>
      </div>

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); setEditingHabit(null); }} title={editingHabit ? 'Edit Habit' : 'New Habit'}>
        <HabitForm habit={editingHabit} onClose={() => { setShowForm(false); setEditingHabit(null); }} />
      </Modal>
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { deleteHabit(deleteTarget.id); setDeleteTarget(null); }}
        title="Delete Habit"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.title}"? All completion history will be lost.` : ''}
      />
    </div>
  );
}
