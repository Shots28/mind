import { useState } from 'react';
import { CheckSquare, Calendar, BookOpen, Repeat, FolderOpen, ArrowRight } from 'lucide-react';
import AuthPage from './AuthPage';
import './LandingPage.css';

const FEATURES = [
  { icon: CheckSquare, title: 'Tasks', desc: 'Prioritize with Must Do and Up Next categories' },
  { icon: Repeat, title: 'Habits', desc: 'Build streaks and track daily routines' },
  { icon: Calendar, title: 'Calendar', desc: 'Events, tasks, and Google Calendar in one view' },
  { icon: BookOpen, title: 'Journal', desc: 'Capture quick thoughts throughout the day' },
  { icon: FolderOpen, title: 'Projects', desc: 'Group tasks and track progress' },
];

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false);

  if (showAuth) {
    return <AuthPage />;
  }

  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-hero">
          <div className="landing-logo">
            <div className="logo-mark">Z</div>
            <span className="logo-text">Zenith</span>
          </div>
          <h1 className="landing-headline">
            Your day, in one place.
          </h1>
          <p className="landing-subtitle">
            Tasks, habits, calendar, journal, and projects — unified in a single dashboard. No clutter, no switching between apps.
          </p>
          <button className="btn-primary landing-cta" onClick={() => setShowAuth(true)}>
            Get Started <ArrowRight size={16} />
          </button>
          <button className="landing-signin" onClick={() => setShowAuth(true)}>
            Already have an account? Sign in
          </button>
        </div>

        <div className="landing-features">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="landing-feature glass-panel">
              <Icon size={24} className="landing-feature-icon" />
              <div>
                <h3 className="landing-feature-title">{title}</h3>
                <p className="landing-feature-desc">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
