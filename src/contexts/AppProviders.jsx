import { AuthProvider } from './AuthContext';
import { ContextProvider } from './ContextContext';
import { TaskProvider } from './TaskContext';
import { JournalProvider } from './JournalContext';
import { ProjectProvider } from './ProjectContext';
import { EventProvider } from './EventContext';
import { HabitProvider } from './HabitContext';
import { ToastProvider } from '../components/Common/Toast';

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ContextProvider>
        <TaskProvider>
          <ProjectProvider>
            <JournalProvider>
              <EventProvider>
                <HabitProvider>
                  <ToastProvider>
                    {children}
                  </ToastProvider>
                </HabitProvider>
              </EventProvider>
            </JournalProvider>
          </ProjectProvider>
        </TaskProvider>
      </ContextProvider>
    </AuthProvider>
  );
}
