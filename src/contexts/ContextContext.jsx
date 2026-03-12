import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const ContextContext = createContext({});

const initialState = {
  contexts: [],
  activeContext: 'all',
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONTEXTS':
      return { ...state, contexts: action.payload, loading: false };
    case 'ADD_CONTEXT':
      return { ...state, contexts: [...state.contexts, action.payload] };
    case 'UPDATE_CONTEXT':
      return { ...state, contexts: state.contexts.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };
    case 'DELETE_CONTEXT':
      return { ...state, contexts: state.contexts.filter(c => c.id !== action.payload), activeContext: state.activeContext === action.payload ? 'all' : state.activeContext };
    case 'SET_ACTIVE':
      return { ...state, activeContext: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function ContextProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchContexts = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    const { data, error } = await supabase
      .from('contexts')
      .select('*')
      .order('position', { ascending: true });
    if (!error) dispatch({ type: 'SET_CONTEXTS', payload: data });
    else dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  useEffect(() => {
    if (user) fetchContexts();
    else dispatch({ type: 'SET_CONTEXTS', payload: [] });
  }, [user, fetchContexts]);

  const createContext_ = async (name, color = '#3b82f6') => {
    const { data, error } = await supabase
      .from('contexts')
      .insert({ user_id: user.id, name, color, position: state.contexts.length })
      .select()
      .single();
    if (error) throw error;
    dispatch({ type: 'ADD_CONTEXT', payload: data });
    return data;
  };

  const updateContext = async (id, updates) => {
    const { error } = await supabase.from('contexts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    dispatch({ type: 'UPDATE_CONTEXT', payload: { id, ...updates } });
  };

  const deleteContext = async (id) => {
    const { error } = await supabase.from('contexts').delete().eq('id', id);
    if (error) throw error;
    dispatch({ type: 'DELETE_CONTEXT', payload: id });
  };

  const setActiveContext = (id) => dispatch({ type: 'SET_ACTIVE', payload: id });

  return (
    <ContextContext.Provider value={{ ...state, createContext: createContext_, updateContext, deleteContext, setActiveContext, fetchContexts }}>
      {children}
    </ContextContext.Provider>
  );
}

export const useContexts = () => useContext(ContextContext);
