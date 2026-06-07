import React, { createContext, useContext, useEffect, useReducer, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalDateString, isSameLocalDay } from '../lib/dates';
import { useAuth } from './AuthContext';
import { useRecentIds } from '../lib/useRecentIds';

const TaskContext = createContext({});

const initialState = {
  tasks: [],
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_TASKS':
      return { ...state, tasks: action.payload, loading: false };
    case 'ADD_TASK':
      return { ...state, tasks: [action.payload, ...state.tasks] };
    case 'UPDATE_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) };
    case 'DELETE_TASK':
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

function sortByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 2;
    const pb = PRIORITY_ORDER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
}

export function TaskProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const recentIds = useRecentIds();

  const fetchTasks = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    const { data, error } = await supabase
      .from('tasks')
      .select('*, contexts(name, color), projects(name, color)')
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });
    if (!error) dispatch({ type: 'SET_TASKS', payload: data });
    else dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  useEffect(() => {
    if (user) fetchTasks();
    else dispatch({ type: 'SET_TASKS', payload: [] });
  }, [user, fetchTasks]);

  // Realtime subscription so external writes (VAPI voice-agent tool calls,
  // other devices, background workers) show up without a page reload.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${user.id}`,
      }, async (payload) => {
        const id = payload.new?.id || payload.old?.id;
        if (recentIds.has(id)) return;

        if (payload.eventType === 'INSERT') {
          // Rehydrate joined relations (contexts, projects) since the raw
          // Realtime payload only includes base columns.
          const { data } = await supabase
            .from('tasks')
            .select('*, contexts(name, color), projects(name, color)')
            .eq('id', id)
            .single();
          dispatch({ type: 'ADD_TASK', payload: data || payload.new });
        } else if (payload.eventType === 'UPDATE') {
          dispatch({ type: 'UPDATE_TASK', payload: payload.new });
        } else if (payload.eventType === 'DELETE') {
          dispatch({ type: 'DELETE_TASK', payload: payload.old.id });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, recentIds]);

  const createTask = async (taskData) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...taskData, user_id: user.id })
      .select('*, contexts(name, color), projects(name, color)')
      .single();
    if (error) throw error;
    recentIds.add(data.id);
    dispatch({ type: 'ADD_TASK', payload: data });
    return data;
  };

  const updateTask = async (id, updates) => {
    recentIds.add(id);
    dispatch({ type: 'UPDATE_TASK', payload: { id, ...updates } });
    const { error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      fetchTasks();
      throw error;
    }
    // Refresh joined relations when relational fields change
    if (updates.project_id !== undefined || updates.context_id !== undefined) {
      const { data } = await supabase
        .from('tasks')
        .select('*, contexts(name, color), projects(name, color)')
        .eq('id', id)
        .single();
      if (data) dispatch({ type: 'UPDATE_TASK', payload: data });
    }
  };

  const toggleComplete = async (id, onComplete) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const is_completed = !task.is_completed;
    const completed_at = is_completed ? new Date().toISOString() : null;
    await updateTask(id, { is_completed, completed_at });
    if (is_completed && onComplete) onComplete();
  };

  const pendingDeleteRef = useRef(null);

  const deleteTask = async (id, { undo: withUndo } = {}) => {
    const task = state.tasks.find(t => t.id === id);
    recentIds.add(id);
    dispatch({ type: 'DELETE_TASK', payload: id });

    if (withUndo && task) {
      // Flush any previous pending delete immediately
      if (pendingDeleteRef.current) {
        clearTimeout(pendingDeleteRef.current.timerId);
        pendingDeleteRef.current.flush();
      }
      const flush = async () => {
        await supabase.from('tasks').delete().eq('id', id);
        pendingDeleteRef.current = null;
      };
      const timerId = setTimeout(flush, 5000);
      pendingDeleteRef.current = { timerId, task, flush };
      return;
    }

    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      fetchTasks();
      throw error;
    }
  };

  const undoDelete = useCallback(() => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timerId);
      dispatch({ type: 'ADD_TASK', payload: pendingDeleteRef.current.task });
      pendingDeleteRef.current = null;
    }
  }, []);

  const mustDoTasks = useMemo(() =>
    sortByPriority(state.tasks.filter(t => t.category === 'must_do' && !t.is_completed)),
    [state.tasks]
  );

  const upNextTasks = useMemo(() =>
    sortByPriority(state.tasks.filter(t => t.category === 'up_next' && !t.is_completed)),
    [state.tasks]
  );

  const completedTasks = useMemo(() =>
    state.tasks.filter(t => t.is_completed),
    [state.tasks]
  );

  const todayProgress = useMemo(() => {
    const today = toLocalDateString();
    const mustDo = state.tasks.filter(t => t.category === 'must_do');
    const todayCompleted = mustDo.filter(t => t.is_completed && isSameLocalDay(t.completed_at, today)).length;
    const totalMustDo = mustDo.length;
    const denom = totalMustDo || 1;
    return { completed: todayCompleted, total: totalMustDo, percent: Math.min(100, Math.round((todayCompleted / denom) * 100)) };
  }, [state.tasks]);

  const getTasksByCategory = useCallback((categoryId) => {
    return sortByPriority(state.tasks.filter(t => t.category === categoryId && !t.is_completed));
  }, [state.tasks]);

  return (
    <TaskContext.Provider value={{
      ...state,
      mustDoTasks,
      upNextTasks,
      completedTasks,
      todayProgress,
      createTask,
      updateTask,
      toggleComplete,
      deleteTask,
      undoDelete,
      fetchTasks,
      getTasksByCategory,
    }}>
      {children}
    </TaskContext.Provider>
  );
}

export const useTasks = () => useContext(TaskContext);
