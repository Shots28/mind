import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const VoiceAgentContext = createContext({});

const initialState = {
  preferences: null,
  calls: [],
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PREFERENCES':
      return { ...state, preferences: action.payload, loading: false };
    case 'SET_CALLS':
      return { ...state, calls: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function VoiceAgentProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchPreferences = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('call_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    dispatch({ type: 'SET_PREFERENCES', payload: data });
  }, [user]);

  const fetchCalls = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('calls')
      .select('*')
      .order('scheduled_at', { ascending: false })
      .limit(50);
    if (data) dispatch({ type: 'SET_CALLS', payload: data });
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchPreferences();
      fetchCalls();
    } else {
      dispatch({ type: 'SET_PREFERENCES', payload: null });
      dispatch({ type: 'SET_CALLS', payload: [] });
    }
  }, [user, fetchPreferences, fetchCalls]);

  const updatePreferences = async (updates) => {
    if (!user) return;

    if (state.preferences) {
      const { data, error } = await supabase
        .from('call_preferences')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      dispatch({ type: 'SET_PREFERENCES', payload: data });
      return data;
    } else {
      const { data, error } = await supabase
        .from('call_preferences')
        .insert({ user_id: user.id, ...updates })
        .select()
        .single();
      if (error) throw error;
      dispatch({ type: 'SET_PREFERENCES', payload: data });
      return data;
    }
  };

  const sendVerificationCode = async (phoneNumber) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-verify-phone`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'send', phone_number: phoneNumber }),
      }
    );
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error);
    await fetchPreferences();
    return result;
  };

  const verifyPhone = async (phoneNumber, code) => {
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-verify-phone`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'verify', phone_number: phoneNumber, code }),
      }
    );
    const result = await resp.json();
    if (!resp.ok) throw new Error(result.error);
    await fetchPreferences();
    return result;
  };

  const triggerTestCall = async () => {
    // For testing: create a call record and trigger via the scheduler
    // In production, this would directly call VAPI
    const { data: { session } } = await supabase.auth.getSession();
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-schedule-calls`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test_user_id: user.id }),
      }
    );
    if (!resp.ok) throw new Error('Failed to trigger test call');
    await fetchCalls();
  };

  return (
    <VoiceAgentContext.Provider
      value={{
        ...state,
        updatePreferences,
        sendVerificationCode,
        verifyPhone,
        triggerTestCall,
        fetchCalls,
        fetchPreferences,
      }}
    >
      {children}
    </VoiceAgentContext.Provider>
  );
}

export const useVoiceAgent = () => useContext(VoiceAgentContext);
