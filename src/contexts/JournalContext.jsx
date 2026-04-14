import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useRecentIds } from '../lib/useRecentIds';

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
  const recentIds = useRecentIds();

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

  // Realtime: VAPI voice agent writes entries via create_journal_entry and
  // auto-generates one from the call transcript at end-of-call. Both should
  // show up instantly on the Journal page.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('journal-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'journal_entries',
        filter: `user_id=eq.${user.id}`,
      }, async (payload) => {
        const id = payload.new?.id || payload.old?.id;
        if (recentIds.has(id)) return;

        if (payload.eventType === 'INSERT') {
          const { data } = await supabase
            .from('journal_entries')
            .select('*, contexts(name, color)')
            .eq('id', id)
            .single();
          dispatch({ type: 'ADD_ENTRY', payload: data || payload.new });
        } else if (payload.eventType === 'DELETE') {
          dispatch({ type: 'DELETE_ENTRY', payload: payload.old.id });
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, recentIds]);

  const createEntry = async (content, mood = null, context_id = null) => {
    const { data, error } = await supabase
      .from('journal_entries')
      .insert({ user_id: user.id, content, mood, context_id })
      .select('*, contexts(name, color)')
      .single();
    if (error) throw error;
    recentIds.add(data.id);
    dispatch({ type: 'ADD_ENTRY', payload: data });
    return data;
  };

  const pendingDeleteRef = useRef(null);

  const deleteEntry = async (id, { undo: withUndo } = {}) => {
    const entry = state.entries.find(e => e.id === id);
    recentIds.add(id);
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
