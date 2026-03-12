import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useEvents } from './EventContext';
import { useToast } from '../components/Common/Toast';

const GoogleSyncContext = createContext({});

const initialState = {
  connections: [],
  syncedCalendars: [],
  contextMappings: [],
  loading: true,
  syncingCalendars: {}, // { [calendarId]: true }
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTIONS':
      return { ...state, connections: action.payload };
    case 'ADD_CONNECTION':
      return { ...state, connections: [...state.connections, action.payload] };
    case 'REMOVE_CONNECTION':
      return { ...state, connections: state.connections.filter(c => c.id !== action.payload) };
    case 'SET_SYNCED_CALENDARS':
      return { ...state, syncedCalendars: action.payload };
    case 'ADD_SYNCED_CALENDAR':
      return { ...state, syncedCalendars: [...state.syncedCalendars, action.payload] };
    case 'UPDATE_SYNCED_CALENDAR':
      return { ...state, syncedCalendars: state.syncedCalendars.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };
    case 'REMOVE_SYNCED_CALENDAR':
      return { ...state, syncedCalendars: state.syncedCalendars.filter(c => c.id !== action.payload) };
    case 'SET_CONTEXT_MAPPINGS':
      return { ...state, contextMappings: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_SYNCING':
      return { ...state, syncingCalendars: { ...state.syncingCalendars, [action.payload.id]: action.payload.syncing } };
    default:
      return state;
  }
}

export function GoogleSyncProvider({ children }) {
  const { user } = useAuth();
  const { registerSyncPush } = useEvents();
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(reducer, initialState);

  // Fetch all Google sync data
  const fetchSyncData = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });

    const [connRes, calRes, mapRes] = await Promise.all([
      supabase.from('google_connections_safe').select('*').order('created_at'),
      supabase.from('synced_calendars').select('*').order('calendar_name'),
      supabase.from('context_calendar_mappings').select('*'),
    ]);

    if (!connRes.error) dispatch({ type: 'SET_CONNECTIONS', payload: connRes.data });
    if (!calRes.error) dispatch({ type: 'SET_SYNCED_CALENDARS', payload: calRes.data });
    if (!mapRes.error) dispatch({ type: 'SET_CONTEXT_MAPPINGS', payload: mapRes.data });
    dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  useEffect(() => {
    if (user) fetchSyncData();
    else {
      dispatch({ type: 'SET_CONNECTIONS', payload: [] });
      dispatch({ type: 'SET_SYNCED_CALENDARS', payload: [] });
      dispatch({ type: 'SET_CONTEXT_MAPPINGS', payload: [] });
    }
  }, [user, fetchSyncData]);

  // Start Google OAuth flow
  const connectGoogle = useCallback(async () => {
    localStorage.setItem('google_oauth_pending', 'true');
    const { data, error } = await supabase.functions.invoke('google-oauth-start');
    if (error) throw error;
    window.location.href = data.url;
  }, []);

  // Disconnect a Google account
  const disconnectGoogle = useCallback(async (connectionId, keepEvents = true) => {
    const { error } = await supabase.functions.invoke('google-disconnect', {
      body: { connectionId, keepEvents },
    });
    if (error) throw error;
    dispatch({ type: 'REMOVE_CONNECTION', payload: connectionId });
    // Remove associated synced calendars and mappings
    const calIds = state.syncedCalendars.filter(c => c.google_connection_id === connectionId).map(c => c.id);
    calIds.forEach(id => dispatch({ type: 'REMOVE_SYNCED_CALENDAR', payload: id }));
    await fetchSyncData();
  }, [state.syncedCalendars, fetchSyncData]);

  // List Google calendars for a connection
  const fetchGoogleCalendars = useCallback(async (connectionId) => {
    const { data, error } = await supabase.functions.invoke('google-list-calendars', {
      body: { connectionId },
    });
    if (error) throw error;
    return data.calendars;
  }, []);

  // Enable sync for a calendar
  const enableCalendar = useCallback(async (connectionId, googleCalendarId, calendarName, color, accessRole) => {
    const { data, error } = await supabase.from('synced_calendars').insert({
      user_id: user.id,
      google_connection_id: connectionId,
      google_calendar_id: googleCalendarId,
      calendar_name: calendarName,
      calendar_color: color,
      access_role: accessRole || 'owner',
      is_enabled: true,
    }).select().single();
    if (error) throw error;
    dispatch({ type: 'ADD_SYNCED_CALENDAR', payload: data });

    // Set up watch and trigger initial sync
    try {
      await supabase.functions.invoke('google-setup-watch', { body: { syncedCalendarId: data.id } });
      await triggerSync(data.id);
    } catch (err) {
      console.error('Watch/sync setup failed:', err);
    }

    return data;
  }, [user]);

  // Disable sync for a calendar
  const disableCalendar = useCallback(async (syncedCalendarId) => {
    await supabase.from('synced_calendars').update({ is_enabled: false, updated_at: new Date().toISOString() }).eq('id', syncedCalendarId);
    dispatch({ type: 'UPDATE_SYNCED_CALENDAR', payload: { id: syncedCalendarId, is_enabled: false } });
  }, []);

  // Set default calendar
  const setDefaultCalendar = useCallback(async (syncedCalendarId) => {
    // Unset all defaults first
    await supabase.from('synced_calendars').update({ is_default: false }).eq('user_id', user.id);
    // Set the new default
    await supabase.from('synced_calendars').update({ is_default: true }).eq('id', syncedCalendarId);
    const updated = state.syncedCalendars.map(c => ({ ...c, is_default: c.id === syncedCalendarId }));
    dispatch({ type: 'SET_SYNCED_CALENDARS', payload: updated });
  }, [user, state.syncedCalendars]);

  // Map a context to a calendar
  const mapContextToCalendar = useCallback(async (contextId, syncedCalendarId) => {
    if (!syncedCalendarId) {
      // Remove mapping
      await supabase.from('context_calendar_mappings').delete().eq('user_id', user.id).eq('context_id', contextId);
      dispatch({ type: 'SET_CONTEXT_MAPPINGS', payload: state.contextMappings.filter(m => m.context_id !== contextId) });
      return;
    }
    const { data, error } = await supabase.from('context_calendar_mappings').upsert({
      user_id: user.id,
      context_id: contextId,
      synced_calendar_id: syncedCalendarId,
    }, { onConflict: 'user_id,context_id' }).select().single();
    if (error) throw error;
    dispatch({ type: 'SET_CONTEXT_MAPPINGS', payload: [...state.contextMappings.filter(m => m.context_id !== contextId), data] });
  }, [user, state.contextMappings]);

  // Trigger sync pull for a calendar
  const triggerSync = useCallback(async (syncedCalendarId, fullSync = false) => {
    if (state.syncingCalendars[syncedCalendarId]) return;
    dispatch({ type: 'SET_SYNCING', payload: { id: syncedCalendarId, syncing: true } });
    try {
      const { data, error } = await supabase.functions.invoke('google-sync-pull', {
        body: { syncedCalendarId, fullSync },
      });
      if (error) throw error;
      return data;
    } finally {
      dispatch({ type: 'SET_SYNCING', payload: { id: syncedCalendarId, syncing: false } });
    }
  }, [state.syncingCalendars]);

  // Trigger push for an event
  const triggerPush = useCallback(async (eventId, action) => {
    // Only push if user has any synced calendars
    if (state.syncedCalendars.filter(c => c.is_enabled).length === 0) return;
    try {
      await supabase.functions.invoke('google-sync-push', { body: { eventId, action } });
    } catch (err) {
      console.error('Sync push failed:', err);
    }
  }, [state.syncedCalendars]);

  // Register sync push callback with EventContext
  useEffect(() => {
    if (registerSyncPush) {
      registerSyncPush((eventId, action) => {
        if (state.syncedCalendars.filter(c => c.is_enabled).length === 0) return;
        supabase.functions.invoke('google-sync-push', { body: { eventId, action } })
          .then(({ data, error }) => {
            if (error) {
              showToast('Failed to sync event to Google Calendar', { type: 'error' });
            } else if (data?.conflict) {
              showToast('Event was updated from Google Calendar', { type: 'warning' });
            }
          })
          .catch(() => {
            showToast('Sync error — will retry automatically', { type: 'error' });
          });
      });
    }
  }, [registerSyncPush, state.syncedCalendars, showToast]);

  // Sync all enabled calendars
  const syncAll = useCallback(async () => {
    const enabled = state.syncedCalendars.filter(c => c.is_enabled);
    await Promise.allSettled(enabled.map(c => triggerSync(c.id)));
  }, [state.syncedCalendars, triggerSync]);

  // Check if sync is available
  const hasSyncEnabled = state.syncedCalendars.some(c => c.is_enabled);
  const defaultCalendar = state.syncedCalendars.find(c => c.is_default && c.is_enabled);
  const isSyncing = Object.values(state.syncingCalendars).some(Boolean);

  // Get mapping for a context
  const getCalendarForContext = useCallback((contextId) => {
    const mapping = state.contextMappings.find(m => m.context_id === contextId);
    if (mapping) return state.syncedCalendars.find(c => c.id === mapping.synced_calendar_id);
    return defaultCalendar;
  }, [state.contextMappings, state.syncedCalendars, defaultCalendar]);

  return (
    <GoogleSyncContext.Provider value={{
      ...state,
      hasSyncEnabled,
      defaultCalendar,
      isSyncing,
      connectGoogle,
      disconnectGoogle,
      fetchGoogleCalendars,
      enableCalendar,
      disableCalendar,
      setDefaultCalendar,
      mapContextToCalendar,
      triggerSync,
      triggerPush,
      syncAll,
      getCalendarForContext,
      fetchSyncData,
    }}>
      {children}
    </GoogleSyncContext.Provider>
  );
}

export const useGoogleSync = () => useContext(GoogleSyncContext);
