import React, { createContext, useContext, useEffect, useReducer, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../lib/dates';
import { useAuth } from './AuthContext';

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

  const createTask = async (taskData) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ ...taskData, user_id: user.id })
      .select('*, contexts(name, color), projects(name, color)')
      .single();
    if (error) throw error;
    dispatch({ type: 'ADD_TASK', payload: data });
    return data;
  };

  const updateTask = async (id, updates) => {
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

  const deleteTask = async (id) => {
    dispatch({ type: 'DELETE_TASK', payload: id });
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) {
      fetchTasks();
      throw error;
    }
  };

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
    const todayCompleted = state.tasks.filter(t => t.is_completed && t.completed_at && t.completed_at.startsWith(today)).length;
    const todayMustDo = state.tasks.filter(t => t.category === 'must_do' && !t.is_completed).length;
    const total = todayMustDo || 1;
    return { completed: todayCompleted, total: todayMustDo, percent: Math.min(100, Math.round((todayCompleted / total) * 100)) };
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
      fetchTasks,
      getTasksByCategory,
    }}>
      {children}
    </TaskContext.Provider>
  );
}

export const useTasks = () => useContext(TaskContext);
