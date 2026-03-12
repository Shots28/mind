import { useState } from 'react';
import { useTasks } from '../../contexts/TaskContext';
import { CheckSquare, Calendar, BookOpen, Repeat, FolderOpen, ArrowRight } from 'lucide-react';
import './OnboardingFlow.css';

const FEATURES = [
  { icon: CheckSquare, label: 'Tasks', desc: 'Plan and prioritize your day' },
  { icon: Repeat, label: 'Habits', desc: 'Build consistent routines' },
  { icon: Calendar, label: 'Calendar', desc: 'See everything in one place' },
  { icon: BookOpen, label: 'Journal', desc: 'Capture thoughts quickly' },
  { icon: FolderOpen, label: 'Projects', desc: 'Group related tasks' },
];

export default function OnboardingFlow({ onComplete }) {
  const { createTask } = useTasks();
  const [step, setStep] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createTask({
        title: taskTitle.trim(),
        category: 'must_do',
      });
      setStep(2);
    } catch {
      // Still advance — the task might fail but don't block onboarding
      setStep(2);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container glass-panel">
        {step === 0 && (
          <div className="onboarding-step">
            <div className="onboarding-logo">
              <div className="logo-mark">Z</div>
            </div>
            <h1 className="onboarding-title">Welcome to Zenith</h1>
            <p className="onboarding-subtitle">
              One place to plan your day, track your habits, and capture your thoughts.
            </p>
            <button className="btn-primary onboarding-cta" onClick={() => setStep(1)}>
              Let's go <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <h2 className="onboarding-step-title">What's the most important thing you need to do today?</h2>
            <form onSubmit={handleCreateTask} className="onboarding-task-form">
              <input
                type="text"
                className="input-field onboarding-input"
                placeholder="e.g., Finish the project proposal"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                className="btn-primary onboarding-cta"
                disabled={!taskTitle.trim() || submitting}
              >
                {submitting ? 'Adding...' : 'Add to Must Do'} <ArrowRight size={16} />
              </button>
            </form>
            <button className="onboarding-skip" onClick={() => setStep(2)}>
              Skip for now
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <h2 className="onboarding-step-title">You're all set</h2>
            <p className="onboarding-subtitle">
              Here's what you can do with Zenith:
            </p>
            <div className="onboarding-features">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="onboarding-feature">
                  <Icon size={20} className="onboarding-feature-icon" />
                  <div>
                    <span className="onboarding-feature-label">{label}</span>
                    <span className="onboarding-feature-desc">{desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-primary onboarding-cta" onClick={onComplete}>
              Go to Today <ArrowRight size={16} />
            </button>
          </div>
        )}

        <div className="onboarding-dots">
          {[0, 1, 2].map(i => (
            <div key={i} className={`onboarding-dot ${step === i ? 'active' : ''} ${step > i ? 'done' : ''}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
