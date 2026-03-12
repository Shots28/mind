import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { expandRecurringEvent } from '../lib/recurrence';

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
      // Dedup: check if event already exists
      if (state.events.some(e => e.id === action.payload.id)) {
        return { ...state, events: state.events.map(e => e.id === action.payload.id ? { ...e, ...action.payload } : e) };
      }
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

// Track recently dispatched event IDs to deduplicate Realtime echoes
function useRecentIds() {
  const recentIds = useRef(new Map());

  const add = useCallback((id) => {
    recentIds.current.set(id, Date.now());
    // Clean up old entries
    for (const [key, time] of recentIds.current) {
      if (Date.now() - time > 5000) recentIds.current.delete(key);
    }
  }, []);

  const has = useCallback((id) => {
    return recentIds.current.has(id) && (Date.now() - recentIds.current.get(id)) < 5000;
  }, []);

  return { add, has };
}

export function EventProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const recentIds = useRecentIds();
  // Store a sync push callback that GoogleSyncContext can set
  const syncPushRef = useRef(null);

  const registerSyncPush = useCallback((fn) => {
    syncPushRef.current = fn;
  }, []);

  const fetchEvents = useCallback(async (startDate, endDate) => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    let query = supabase
      .from('events')
      .select('*, contexts(name, color)')
      .is('deleted_at', null)
      .order('start_date', { ascending: true });
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

  // Supabase Realtime subscription for inbound sync
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        // Skip if we recently dispatched this event (our own write echoing back)
        const id = payload.new?.id || payload.old?.id;
        if (recentIds.has(id)) return;

        if (payload.eventType === 'INSERT') {
          // Don't show soft-deleted events
          if (payload.new.deleted_at) return;
          dispatch({ type: 'ADD_EVENT', payload: payload.new });
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new.deleted_at) {
            dispatch({ type: 'DELETE_EVENT', payload: payload.new.id });
          } else {
            dispatch({ type: 'UPDATE_EVENT', payload: payload.new });
          }
        } else if (payload.eventType === 'DELETE') {
          dispatch({ type: 'DELETE_EVENT', payload: payload.old.id });
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, recentIds]);

  const createEvent = async (eventData) => {
    const { data, error } = await supabase
      .from('events')
      .insert({ ...eventData, user_id: user.id })
      .select('*, contexts(name, color)')
      .single();
    if (error) throw error;
    recentIds.add(data.id);
    dispatch({ type: 'ADD_EVENT', payload: data });
    // Trigger sync push (non-blocking)
    if (syncPushRef.current) {
      syncPushRef.current(data.id, 'create');
    }
    return data;
  };

  const updateEvent = async (id, updates) => {
    recentIds.add(id);
    dispatch({ type: 'UPDATE_EVENT', payload: { id, ...updates } });
    const { error } = await supabase.from('events').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      fetchEvents();
      throw error;
    }
    // Refresh joined relations when relational fields change
    if (updates.context_id !== undefined) {
      const { data } = await supabase
        .from('events')
        .select('*, contexts(name, color)')
        .eq('id', id)
        .single();
      if (data) dispatch({ type: 'UPDATE_EVENT', payload: data });
    }
    // Trigger sync push (non-blocking)
    if (syncPushRef.current) {
      syncPushRef.current(id, 'update');
    }
  };

  const deleteEvent = async (id) => {
    recentIds.add(id);
    // Check if event has a google_event_id (needs sync)
    const event = state.events.find(e => e.id === id);
    if (event?.google_event_id) {
      // Soft delete: hide from UI, push delete to Google
      dispatch({ type: 'DELETE_EVENT', payload: id });
      await supabase.from('events').update({
        deleted_at: new Date().toISOString(),
        sync_status: 'pending_push',
      }).eq('id', id);
      // Trigger sync push for delete
      if (syncPushRef.current) {
        syncPushRef.current(id, 'delete');
      }
    } else {
      // Local-only event: hard delete
      dispatch({ type: 'DELETE_EVENT', payload: id });
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) {
        fetchEvents();
        throw error;
      }
    }
  };

  // Expand recurring events within a date range
  const getExpandedEvents = useCallback((rangeStart, rangeEnd) => {
    const expanded = [];
    for (const event of state.events) {
      if (event.recurrence_rule && event.source !== 'google') {
        expanded.push(...expandRecurringEvent(event, rangeStart, rangeEnd));
      } else {
        expanded.push(event);
      }
    }
    return expanded;
  }, [state.events]);

  return (
    <EventContext.Provider value={{ ...state, createEvent, updateEvent, deleteEvent, fetchEvents, registerSyncPush, getExpandedEvents }}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvents = () => useContext(EventContext);
