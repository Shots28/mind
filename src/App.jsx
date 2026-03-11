import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import AuthPage from './components/Auth/AuthPage';
import TodayView from './views/TodayView';
import TasksView from './views/TasksView';
import JournalView from './views/JournalView';
import ProjectsView from './views/ProjectsView';
import HabitsView from './views/HabitsView';
import LoadingSpinner from './components/Common/LoadingSpinner';
import ErrorBoundary from './components/Common/ErrorBoundary';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <MainLayout>{children}</MainLayout>;
}

function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/today" replace /> : <AuthPage />} />
        <Route path="/today" element={<ProtectedRoute><TodayView /></ProtectedRoute>} />
        <Route path="/calendar" element={<Navigate to="/today" replace />} />
        <Route path="/tasks" element={<ProtectedRoute><TasksView /></ProtectedRoute>} />
        <Route path="/journal" element={<ProtectedRoute><JournalView /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><ProjectsView /></ProtectedRoute>} />
        <Route path="/habits" element={<ProtectedRoute><HabitsView /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={user ? "/today" : "/login"} replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
