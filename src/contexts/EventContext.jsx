import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const EventContext = createContext({});

const initialState = {
  events: [],
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_EVENTS':
      return { ...state, events: action.payload, loading: false };
    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.payload] };
    case 'UPDATE_EVENT':
      return { ...state, events: state.events.map(e => e.id === action.payload.id ? { ...e, ...action.payload } : e) };
    case 'DELETE_EVENT':
      return { ...state, events: state.events.filter(e => e.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function EventProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchEvents = useCallback(async (startDate, endDate) => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    let query = supabase.from('events').select('*, contexts(name, color)').order('start_date', { ascending: true });
    if (startDate) query = query.gte('start_date', startDate);
    if (endDate) query = query.lte('start_date', endDate);
    const { data, error } = await query;
    if (!error) dispatch({ type: 'SET_EVENTS', payload: data });
    else dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  useEffect(() => {
    if (user) fetchEvents();
    else dispatch({ type: 'SET_EVENTS', payload: [] });
  }, [user, fetchEvents]);

  const createEvent = async (eventData) => {
    const { data, error } = await supabase
      .from('events')
      .insert({ ...eventData, user_id: user.id })
      .select('*, contexts(name, color)')
      .single();
    if (error) throw error;
    dispatch({ type: 'ADD_EVENT', payload: data });
    return data;
  };

  const updateEvent = async (id, updates) => {
    dispatch({ type: 'UPDATE_EVENT', payload: { id, ...updates } });
    const { error } = await supabase.from('events').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      fetchEvents();
      throw error;
    }
  };

  const deleteEvent = async (id) => {
    dispatch({ type: 'DELETE_EVENT', payload: id });
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) {
      fetchEvents();
      throw error;
    }
  };

  return (
    <EventContext.Provider value={{ ...state, createEvent, updateEvent, deleteEvent, fetchEvents }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvents = () => useContext(EventContext);
