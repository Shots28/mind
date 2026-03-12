# Mind

A personal productivity app for managing tasks, habits, journal entries, events, and projects — with optional Google Calendar sync.

## Tech Stack

- **Frontend**: React 19, React Router, Vite
- **Backend**: Supabase (Auth, Postgres, Realtime, Edge Functions)
- **Deployment**: Vercel
- **UI**: Custom CSS with glass-panel design system, Lucide icons
- **Drag & Drop**: @dnd-kit/core

## Architecture

```
src/
├── components/         # Reusable UI components
│   ├── Auth/           # Login/signup forms
│   ├── Calendar/       # Calendar widget
│   ├── Common/         # Modal, Toast, DatePicker, ErrorBoundary, etc.
│   ├── Events/         # Event forms and widgets
│   ├── Habits/         # Habit list, form, stats
│   ├── Journal/        # Journal widget and entry cards
│   ├── Layout/         # MainLayout, Sidebar, TopBar, MobileNav
│   ├── Notifications/  # Notification panel
│   ├── Settings/       # Settings panel, Google Calendar settings
│   └── Tasks/          # Task list, form, inline date picker
├── contexts/           # React Context providers (state management)
│   ├── AuthContext      # User auth state
│   ├── TaskContext       # Tasks with optimistic updates
│   ├── EventContext      # Events with Realtime subscription
│   ├── HabitContext      # Habits and completion logs
│   ├── JournalContext    # Journal entries
│   ├── ProjectContext    # Projects
│   ├── ContextContext    # User-defined contexts (Work, Personal, etc.)
│   ├── CategoryContext   # Task categories (localStorage)
│   └── GoogleSyncContext # Google Calendar integration
├── hooks/              # Custom hooks (useCalendar)
├── lib/                # Utilities (supabase client, dates, recurrence, googleSync)
├── views/              # Page-level components
│   ├── TodayView        # Dashboard with tasks, habits, events, journal
│   ├── CalendarView     # Month/week/day calendar views
│   ├── TasksView        # Task management with filters and grouping
│   ├── JournalView      # Journal entries by date
│   ├── HabitsView       # Habit tracking and stats
│   └── ProjectsView     # Project cards with task progress
└── App.jsx             # Router and protected routes

supabase/
├── functions/          # Edge Functions for Google Calendar sync
│   ├── _shared/        # Shared utilities (auth, CORS, admin client)
│   ├── google-oauth-*  # OAuth flow (start, callback)
│   ├── google-sync-*   # Sync operations (pull, push)
│   ├── google-webhook   # Push notification receiver
│   └── google-renew-watches  # Cron job for watch maintenance
└── migrations/         # Database schema migrations
```

## Getting Started

1. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Key Features

- **Tasks**: Categories (Must Do, Up Next, custom), priorities, due dates, drag-and-drop reordering
- **Habits**: Daily/weekday/weekend frequency, streak tracking, 7-day completion chart
- **Journal**: Quick thought capture with Cmd+Enter, entries grouped by date
- **Events**: All-day and timed events, recurring event support
- **Projects**: Group tasks by project, track completion progress
- **Contexts**: Filter all data by context (Work, Personal, etc.)
- **Google Calendar Sync**: Bidirectional sync with conflict detection via etags
- **Notifications**: Overdue and due-today task alerts
- **Responsive**: Desktop sidebar + mobile bottom nav

## Google Calendar Integration

The Google Calendar sync uses Supabase Edge Functions to:
1. OAuth2 flow with CSRF-protected nonce
2. Push notifications via Google Calendar webhooks
3. Incremental sync with sync tokens
4. Optimistic concurrency with etag-based conflict detection
5. Soft-delete pattern for synced event deletion
6. Automatic watch renewal via cron job
