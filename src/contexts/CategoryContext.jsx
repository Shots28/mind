import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const CategoryContext = createContext({});

const STORAGE_KEY = 'zenith_categories';
const MIGRATED_KEY = 'zenith_categories_migrated';

const DEFAULT_CATEGORIES = [
  { id: 'must_do', name: 'Must Do', is_default: true },
  { id: 'up_next', name: 'Up Next', is_default: true },
];

const initialState = {
  categories: DEFAULT_CATEGORIES,
  loading: true,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CATEGORIES':
      return { ...state, categories: action.payload, loading: false };
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] };
    case 'UPDATE_CATEGORY':
      return { ...state, categories: state.categories.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };
    case 'DELETE_CATEGORY':
      return { ...state, categories: state.categories.filter(c => c.id !== action.payload) };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
}

export function CategoryProvider({ children }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchCategories = useCallback(async () => {
    if (!user) return;
    dispatch({ type: 'SET_LOADING', payload: true });
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('position', { ascending: true });

    if (error) {
      // Table might not exist yet — fall back to defaults
      dispatch({ type: 'SET_CATEGORIES', payload: DEFAULT_CATEGORIES });
      return;
    }

    if (data.length === 0) {
      // First time: check for localStorage migration or seed defaults
      const migrated = await migrateFromLocalStorage();
      if (!migrated) {
        await seedDefaults();
      }
      return;
    }

    dispatch({ type: 'SET_CATEGORIES', payload: data });
  }, [user]);

  const migrateFromLocalStorage = async () => {
    if (localStorage.getItem(MIGRATED_KEY)) return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length === 0) return false;

      const rows = parsed.map((cat, i) => ({
        id: cat.id,
        user_id: user.id,
        name: cat.name,
        is_default: cat.isDefault || cat.is_default || false,
        position: i,
      }));

      const { data, error } = await supabase
        .from('categories')
        .insert(rows)
        .select();

      if (!error && data) {
        dispatch({ type: 'SET_CATEGORIES', payload: data });
        localStorage.setItem(MIGRATED_KEY, 'true');
        return true;
      }
    } catch { /* ignore migration errors */ }
    return false;
  };

  const seedDefaults = async () => {
    const rows = DEFAULT_CATEGORIES.map((cat, i) => ({
      id: cat.id,
      user_id: user.id,
      name: cat.name,
      is_default: true,
      position: i,
    }));

    const { data, error } = await supabase
      .from('categories')
      .insert(rows)
      .select();

    if (!error && data) {
      dispatch({ type: 'SET_CATEGORIES', payload: data });
    } else {
      dispatch({ type: 'SET_CATEGORIES', payload: DEFAULT_CATEGORIES });
    }
  };

  useEffect(() => {
    if (user) fetchCategories();
    else dispatch({ type: 'SET_CATEGORIES', payload: DEFAULT_CATEGORIES });
  }, [user, fetchCategories]);

  const addCategory = useCallback(async (name) => {
    const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
    const position = state.categories.length;
    const newCat = { id, user_id: user.id, name, is_default: false, position };

    dispatch({ type: 'ADD_CATEGORY', payload: newCat });
    const { error } = await supabase.from('categories').insert(newCat);
    if (error) fetchCategories();
  }, [user, state.categories.length, fetchCategories]);

  const updateCategory = useCallback(async (id, name) => {
    dispatch({ type: 'UPDATE_CATEGORY', payload: { id, name } });
    const { error } = await supabase.from('categories').update({ name }).eq('id', id);
    if (error) fetchCategories();
  }, [fetchCategories]);

  const removeCategory = useCallback(async (id) => {
    const cat = state.categories.find(c => c.id === id);
    if (cat?.is_default) return;
    dispatch({ type: 'DELETE_CATEGORY', payload: id });
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) fetchCategories();
  }, [state.categories, fetchCategories]);

  const getCategoryName = useCallback((id) => {
    const cat = state.categories.find(c => c.id === id);
    return cat?.name || id;
  }, [state.categories]);

  return (
    <CategoryContext.Provider value={{ categories: state.categories, addCategory, updateCategory, removeCategory, getCategoryName }}>
      {children}
    </CategoryContext.Provider>
  );
}

export const useCategories = () => useContext(CategoryContext);
