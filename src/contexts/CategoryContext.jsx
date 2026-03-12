import React, { createContext, useContext, useState, useCallback } from 'react';

const CategoryContext = createContext({});

const STORAGE_KEY = 'mind_categories';

const DEFAULT_CATEGORIES = [
  { id: 'must_do', name: 'Must Do', isDefault: true },
  { id: 'up_next', name: 'Up Next', isDefault: true },
];

function loadCategories() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}

function saveCategories(categories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
}

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState(loadCategories);

  const addCategory = useCallback((name) => {
    setCategories(prev => {
      const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
      const next = [...prev, { id, name, isDefault: false }];
      saveCategories(next);
      return next;
    });
  }, []);

  const updateCategory = useCallback((id, name) => {
    setCategories(prev => {
      const next = prev.map(c => c.id === id ? { ...c, name } : c);
      saveCategories(next);
      return next;
    });
  }, []);

  const removeCategory = useCallback((id) => {
    setCategories(prev => {
      const cat = prev.find(c => c.id === id);
      if (cat?.isDefault) return prev;
      const next = prev.filter(c => c.id !== id);
      saveCategories(next);
      return next;
    });
  }, []);

  const getCategoryName = useCallback((id) => {
    const cat = categories.find(c => c.id === id);
    return cat?.name || id;
  }, [categories]);

  return (
    <CategoryContext.Provider value={{ categories, addCategory, updateCategory, removeCategory, getCategoryName }}>
      {children}
    </CategoryContext.Provider>
  );
}

export const useCategories = () => useContext(CategoryContext);
