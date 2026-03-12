import { useState } from 'react';
import { useHabits } from '../../contexts/HabitContext';
import { useContexts } from '../../contexts/ContextContext';
import { useToast } from '../Common/Toast';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6'];

export default function HabitForm({ habit = null, onClose }) {
  const { createHabit, updateHabit } = useHabits();
  const { contexts, activeContext } = useContexts();
  const { showToast } = useToast();
  const [title, setTitle] = useState(habit?.title || '');
  const [description, setDescription] = useState(habit?.description || '');
  const [frequency, setFrequency] = useState(habit?.frequency || 'daily');
  const [contextId, setContextId] = useState(habit?.context_id || (activeContext !== 'all' ? activeContext : ''));
  const [color, setColor] = useState(habit?.color || '#3b82f6');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim() || null,
        frequency,
        context_id: contextId || null,
        color,
      };
      if (habit) await updateHabit(habit.id, data);
      else await createHabit(data);
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to save habit', { type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <input
        type="text"
        className="input-field"
        placeholder="Habit name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        required
      />
      <textarea
        className="input-field"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        style={{ resize: 'vertical', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Frequency</label>
          <select className="input-field" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekends">Weekends</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Context</label>
          <select className="input-field" value={contextId} onChange={(e) => setContextId(e.target.value)}>
            <option value="">None</option>
            {contexts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Color</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: color === c ? '2px solid white' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
      </div>
      <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
        {loading ? 'Saving...' : habit ? 'Update Habit' : 'Create Habit'}
      </button>
    </form>
  );
}
