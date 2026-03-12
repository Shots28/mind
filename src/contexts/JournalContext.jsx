import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const JournalContext = createContext({});

const initialState = {
  entries: [],
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ENTRIES':
      return { ...state, entries: action.payload, loading: false };
    case 'ADD_ENTRY':
      return { ...state, entries: [action.payload, ...state.entries] };
    case 'DELETE_ENTRY':
      return { ...state, entries: state.entries.filter(e => e.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function JournalProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*, contexts(name, color)')
      .order('created_at', { ascending: false });
    if (!error) dispatch({ type: 'SET_ENTRIES', payload: data });
    else dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  useEffect(() => {
    if (user) fetchEntries();
    else dispatch({ type: 'SET_ENTRIES', payload: [] });
  }, [user, fetchEntries]);

  const createEntry = async (content, mood = null, context_id = null) => {
    const { data, error } = await supabase
      .from('journal_entries')
      .insert({ user_id: user.id, content, mood, context_id })
      .select('*, contexts(name, color)')
      .single();
    if (error) throw error;
    dispatch({ type: 'ADD_ENTRY', payload: data });
    return data;
  };

  const pendingDeleteRef = useRef(null);

  const deleteEntry = async (id, { undo: withUndo } = {}) => {
    const entry = state.entries.find(e => e.id === id);
    dispatch({ type: 'DELETE_ENTRY', payload: id });

    if (withUndo && entry) {
      if (pendingDeleteRef.current) {
        clearTimeout(pendingDeleteRef.current.timerId);
        pendingDeleteRef.current.flush();
      }
      const flush = async () => {
        await supabase.from('journal_entries').delete().eq('id', id);
        pendingDeleteRef.current = null;
      };
      const timerId = setTimeout(flush, 5000);
      pendingDeleteRef.current = { timerId, entry, flush };
      return;
    }

    const { error } = await supabase.from('journal_entries').delete().eq('id', id);
    if (error) {
      fetchEntries();
      throw error;
    }
  };

  const undoDeleteEntry = useCallback(() => {
    if (pendingDeleteRef.current) {
      clearTimeout(pendingDeleteRef.current.timerId);
      dispatch({ type: 'ADD_ENTRY', payload: pendingDeleteRef.current.entry });
      pendingDeleteRef.current = null;
    }
  }, []);

  return (
    <JournalContext.Provider value={{ ...state, createEntry, deleteEntry, undoDeleteEntry, fetchEntries }}>
      {children}
    </JournalContext.Provider>
  );
}

export const useJournal = () => useContext(JournalContext);
