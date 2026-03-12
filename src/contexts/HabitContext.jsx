import { createContext, useContext, useEffect, useReducer, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../lib/dates';
import { useAuth } from './AuthContext';

const HabitContext = createContext({});

const initialState = {
  habits: [],
  todayLogs: [],
  weekLogs: [],
  dateLogs: {},
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_HABITS':
      return { ...state, habits: action.payload, loading: false };
    case 'ADD_HABIT':
      return { ...state, habits: [...state.habits, action.payload] };
    case 'UPDATE_HABIT':
      return { ...state, habits: state.habits.map(h => h.id === action.payload.id ? { ...h, ...action.payload } : h) };
    case 'DELETE_HABIT':
      return { ...state, habits: state.habits.filter(h => h.id !== action.payload) };
    case 'SET_TODAY_LOGS':
      return { ...state, todayLogs: action.payload };
    case 'ADD_LOG':
      return { ...state, todayLogs: [...state.todayLogs, action.payload] };
    case 'REMOVE_LOG':
      return { ...state, todayLogs: state.todayLogs.filter(l => l.id !== action.payload) };
    case 'SET_WEEK_LOGS':
      return { ...state, weekLogs: action.payload };
    case 'SET_DATE_LOGS':
      return { ...state, dateLogs: { ...state.dateLogs, [action.payload.date]: action.payload.logs } };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

function isHabitDueToday(habit) {
  const day = new Date().getDay(); // 0=Sun
  return isHabitDueOnDay(habit, day);
}

export function isHabitDueOnDate(habit, dateStr) {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  return isHabitDueOnDay(habit, day);
}

function isHabitDueOnDay(habit, day) {
  switch (habit.frequency) {
    case 'daily': return true;
    case 'weekdays': return day >= 1 && day <= 5;
    case 'weekends': return day === 0 || day === 6;
    case 'custom': return habit.custom_days?.includes(day) ?? false;
    default: return true;
  }
}

export function HabitProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchHabits = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    const { data, error } = await supabase
      .from('habits')
      .select('*, contexts(name, color)')
      .eq('is_active', true)
      .order('position', { ascending: true });
    if (!error) dispatch({ type: 'SET_HABITS', payload: data });
    else dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  const fetchTodayLogs = useCallback(async () => {
    if (!user) return;
    const today = toLocalDateString();
    const { data } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('date', today);
    if (data) dispatch({ type: 'SET_TODAY_LOGS', payload: data });
  }, [user]);

  const fetchWeekLogs = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const { data } = await supabase
      .from('habit_logs')
      .select('*')
      .gte('date', toLocalDateString(weekAgo))
      .lte('date', toLocalDateString(now));
    if (data) dispatch({ type: 'SET_WEEK_LOGS', payload: data });
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchHabits();
      fetchTodayLogs();
      fetchWeekLogs();
    } else {
      dispatch({ type: 'SET_HABITS', payload: [] });
      dispatch({ type: 'SET_TODAY_LOGS', payload: [] });
      dispatch({ type: 'SET_WEEK_LOGS', payload: [] });
    }
  }, [user, fetchHabits, fetchTodayLogs, fetchWeekLogs]);

  const createHabit = async (habitData) => {
    const { data, error } = await supabase
      .from('habits')
      .insert({ ...habitData, user_id: user.id })
      .select('*, contexts(name, color)')
      .single();
    if (error) throw error;
    dispatch({ type: 'ADD_HABIT', payload: data });
    return data;
  };

  const updateHabit = async (id, updates) => {
    dispatch({ type: 'UPDATE_HABIT', payload: { id, ...updates } });
    const { error } = await supabase
      .from('habits')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { fetchHabits(); throw error; }
  };

  const pendingDeleteRef = useRef(null);

  const deleteHabit = async (id, { undo: withUndo } = {}) => {
    const habit = state.habits.find(h => h.id === id);
    dispatch({ type: 'DELETE_HABIT', payload: id });

    if (withUndo && habit) {
      if (pendingDeleteRef.current) {
        clearTimeout(pendingDeleteRef.current.timerId);
        pendingDeleteRef.current.flush();
      }
      const flush = async () => {
        await supabase.from('habits').delete().eq('id', id);
        pendingDeleteRef.current = null;
      };
      const timerId = setTimeout(flush, 5000);
      pendingDeleteRef.current = { timerId, habit, flush };
      return;
    }

    const { error } = await supabase.from('habits').delete().eq('id', id);
    if (error) { fetchHabits(); throw error; }
  };

  const undoDeleteHabit = useCallback(() => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timerId);
      dispatch({ type: 'ADD_HABIT', payload: pendingDeleteRef.current.habit });
      pendingDeleteRef.current = null;
    }
  }, []);

  const fetchLogsForDate = useCallback(async (dateStr) => {
    if (!user) return;
    if (state.dateLogs[dateStr]) return;
    const { data } = await supabase
      .from('habit_logs')
      .select('*')
      .eq('date', dateStr);
    if (data) dispatch({ type: 'SET_DATE_LOGS', payload: { date: dateStr, logs: data } });
  }, [user, state.dateLogs]);

  const getLogsForDate = useCallback((dateStr) => {
    return state.dateLogs[dateStr] || [];
  }, [state.dateLogs]);

  const toggleHabitLog = async (habitId, date) => {
    const targetDate = date || toLocalDateString();
    const today = toLocalDateString();
    const isToday = targetDate === today;
    const logs = isToday ? state.todayLogs : (state.dateLogs[targetDate] || []);
    const existing = logs.find(l => l.habit_id === habitId);
    if (existing) {
      if (isToday) {
        dispatch({ type: 'REMOVE_LOG', payload: existing.id });
      } else {
        dispatch({ type: 'SET_DATE_LOGS', payload: { date: targetDate, logs: logs.filter(l => l.id !== existing.id) } });
      }
      await supabase.from('habit_logs').delete().eq('id', existing.id);
    } else {
      const { data, error } = await supabase
        .from('habit_logs')
        .insert({ habit_id: habitId, user_id: user.id, date: targetDate })
        .select()
        .single();
      if (!error) {
        if (isToday) {
          dispatch({ type: 'ADD_LOG', payload: data });
        } else {
          dispatch({ type: 'SET_DATE_LOGS', payload: { date: targetDate, logs: [...logs, data] } });
        }
      }
    }
    fetchWeekLogs();
  };

  const todayHabits = useMemo(() =>
    state.habits.filter(isHabitDueToday),
    [state.habits]
  );

  const todayProgress = useMemo(() => {
    const total = todayHabits.length;
    const completed = todayHabits.filter(h => state.todayLogs.some(l => l.habit_id === h.id)).length;
    return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
  }, [todayHabits, state.todayLogs]);

  const getStreak = useCallback((habitId) => {
    const logs = state.weekLogs.filter(l => l.habit_id === habitId);
    const dates = new Set(logs.map(l => l.date));
    const habit = state.habits.find(h => h.id === habitId);
    let streak = 0;
    const d = new Date();
    // weekLogs only covers 7 days, so cap iteration accordingly
    for (let i = 0; i < 7; i++) {
      const dateStr = toLocalDateString(d);
      // Skip days when the habit is not due
      if (habit && !isHabitDueOnDay(habit, d.getDay())) {
        d.setDate(d.getDate() - 1);
        continue;
      }
      if (dates.has(dateStr)) streak++;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }, [state.weekLogs, state.habits]);

  return (
    <HabitContext.Provider value={{
      ...state,
      todayHabits,
      todayProgress,
      createHabit,
      updateHabit,
      deleteHabit,
      undoDeleteHabit,
      toggleHabitLog,
      getStreak,
      fetchHabits,
      fetchLogsForDate,
      getLogsForDate,
    }}>
      {children}
    </HabitContext.Provider>
  );
}

export const useHabits = () => useContext(HabitContext);
