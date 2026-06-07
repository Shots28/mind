import { AuthProvider } from './AuthContext';
import { ContextProvider } from './ContextContext';
import { CategoryProvider } from './CategoryContext';
import { TaskProvider } from './TaskContext';
import { JournalProvider } from './JournalContext';
import { ProjectProvider } from './ProjectContext';
import { EventProvider } from './EventContext';
import { HabitProvider } from './HabitContext';
import { GoogleSyncProvider } from './GoogleSyncContext';
import { VoiceAgentProvider } from './VoiceAgentContext';
import { ToastProvider } from '../components/Common/Toast';

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ContextProvider>
          <CategoryProvider>
            <TaskProvider>
              <ProjectProvider>
                <JournalProvider>
                  <EventProvider>
                    <GoogleSyncProvider>
                      <HabitProvider>
                        <VoiceAgentProvider>
                          {children}
                        </VoiceAgentProvider>
                      </HabitProvider>
                    </GoogleSyncProvider>
                  </EventProvider>
                </JournalProvider>
              </ProjectProvider>
            </TaskProvider>
          </CategoryProvider>
        </ContextProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
