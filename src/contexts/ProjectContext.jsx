import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const ProjectContext = createContext({});

const initialState = {
  projects: [],
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_PROJECTS':
      return { ...state, projects: action.payload, loading: false };
    case 'ADD_PROJECT':
      return { ...state, projects: [action.payload, ...state.projects] };
    case 'UPDATE_PROJECT':
      return { ...state, projects: state.projects.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p) };
    case 'DELETE_PROJECT':
      return { ...state, projects: state.projects.filter(p => p.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    const { data, error } = await supabase
      .from('projects')
      .select('*, contexts(name, color)')
      .order('created_at', { ascending: false });
    if (!error) dispatch({ type: 'SET_PROJECTS', payload: data });
    else dispatch({ type: 'SET_LOADING', payload: false });
  }, [user]);

  useEffect(() => {
    if (user) fetchProjects();
    else dispatch({ type: 'SET_PROJECTS', payload: [] });
  }, [user, fetchProjects]);

  const createProject = async (projectData) => {
    const { data, error } = await supabase
      .from('projects')
      .insert({ ...projectData, user_id: user.id })
      .select('*, contexts(name, color)')
      .single();
    if (error) throw error;
    dispatch({ type: 'ADD_PROJECT', payload: data });
    return data;
  };

  const updateProject = async (id, updates) => {
    dispatch({ type: 'UPDATE_PROJECT', payload: { id, ...updates } });
    const { error } = await supabase.from('projects').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      fetchProjects();
      throw error;
    }
  };

  const deleteProject = async (id) => {
    dispatch({ type: 'DELETE_PROJECT', payload: id });
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) {
      fetchProjects();
      throw error;
    }
  };

  return (
    <ProjectContext.Provider value={{ ...state, createProject, updateProject, deleteProject, fetchProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export const useProjects = () => useContext(ProjectContext);
