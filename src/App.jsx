import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import MainLayout from './components/Layout/MainLayout';
import AuthPage from './components/Auth/AuthPage';
import LandingPage from './components/Auth/LandingPage';
import OnboardingFlow from './components/Onboarding/OnboardingFlow';
import TodayView from './views/TodayView';
import TasksView from './views/TasksView';
import JournalView from './views/JournalView';
import ProjectsView from './views/ProjectsView';
import HabitsView from './views/HabitsView';
import CalendarView from './views/CalendarView';
import ResetPasswordForm from './components/Auth/ResetPasswordForm';
import LoadingSpinner from './components/Common/LoadingSpinner';
import ErrorBoundary from './components/Common/ErrorBoundary';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const [onboardingDone, setOnboardingDone] = useState(
    () => localStorage.getItem('zenith_onboarding_complete') === 'true'
  );

  if (loading) return <LoadingSpinner fullPage />;
  if (!user) return <Navigate to="/login" replace />;

  if (!onboardingDone) {
    return (
      <OnboardingFlow onComplete={() => {
        localStorage.setItem('zenith_onboarding_complete', 'true');
        setOnboardingDone(true);
      }} />
    );
  }

  return <MainLayout>{children}</MainLayout>;
}

function App() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner fullPage />;

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/today" replace /> : <LandingPage />} />
        <Route path="/reset-password" element={<ResetPasswordForm />} />
        <Route path="/today" element={<ProtectedRoute><TodayView /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute><CalendarView /></ProtectedRoute>} />
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
