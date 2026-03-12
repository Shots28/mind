import { useState, useEffect } from 'react';
import { useGoogleSync } from '../../contexts/GoogleSyncContext';
import { useContexts } from '../../contexts/ContextContext';
import { useToast } from '../Common/Toast';
import {
  Calendar, Plus, Trash2, RefreshCw, Star, ChevronDown, ChevronRight,
  Link2, Unlink, AlertCircle, Check, Loader2, Lock
} from 'lucide-react';
import './GoogleCalendarSettings.css';

function ConnectionItem({ connection, onDisconnect }) {
  const { fetchGoogleCalendars, enableCalendar, disableCalendar, syncedCalendars,
    setDefaultCalendar } = useGoogleSync();
  const [expanded, setExpanded] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState(null);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const { showToast } = useToast();

  const connCalendars = syncedCalendars.filter(c => c.google_connection_id === connection.id);

  const loadCalendars = async () => {
    if (googleCalendars) {
      setExpanded(!expanded);
      return;
    }
    setLoadingCalendars(true);
    setExpanded(true);
    try {
      const calendars = await fetchGoogleCalendars(connection.id);
      setGoogleCalendars(calendars);
    } catch (err) {
      showToast('Failed to load calendars', { type: 'error' });
      console.error(err);
    } finally {
      setLoadingCalendars(false);
    }
  };

  const handleToggleCalendar = async (cal) => {
    const existing = connCalendars.find(c => c.google_calendar_id === cal.id);
    if (existing) {
      await disableCalendar(existing.id);
      showToast(`Stopped syncing ${cal.name}`);
    } else {
      await enableCalendar(connection.id, cal.id, cal.name, cal.color, cal.accessRole);
      showToast(`Started syncing ${cal.name}`);
    }
  };

  const handleSetDefault = async (syncedCalId) => {
    await setDefaultCalendar(syncedCalId);
    showToast('Default calendar updated');
  };

  return (
    <div className="gcal-connection">
      <div className="gcal-connection-header" onClick={loadCalendars}>
        <div className="gcal-connection-info">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="gcal-email">{connection.google_email}</span>
          <span className={`gcal-status-badge ${connection.is_active ? 'active' : 'inactive'}`}>
            {connection.is_active ? 'Active' : 'Reconnect'}
          </span>
        </div>
        <button
          className="btn-icon gcal-disconnect-btn"
          onClick={(e) => { e.stopPropagation(); onDisconnect(connection.id); }}
          title="Disconnect"
        >
          <Unlink size={14} />
        </button>
      </div>

      {expanded && (
        <div className="gcal-calendars-list">
          {loadingCalendars ? (
            <div className="gcal-loading"><Loader2 size={16} className="spin" /> Loading calendars...</div>
          ) : googleCalendars ? (
            googleCalendars.map(cal => {
              const synced = connCalendars.find(c => c.google_calendar_id === cal.id);
              const isEnabled = !!synced?.is_enabled;
              const isDefault = synced?.is_default;
              const isReadOnly = cal.accessRole === 'reader' || cal.accessRole === 'freeBusyReader';

              return (
                <div key={cal.id} className="gcal-calendar-item">
                  <div className="gcal-calendar-color" style={{ background: cal.color }} />
                  <span className="gcal-calendar-name">{cal.name}</span>
                  {isReadOnly && <Lock size={12} className="gcal-readonly-icon" title="Read-only" />}
                  {cal.primary && <span className="gcal-primary-badge">Primary</span>}
                  {isEnabled && synced && (
                    <button
                      className={`gcal-default-btn ${isDefault ? 'is-default' : ''}`}
                      onClick={() => handleSetDefault(synced.id)}
                      title={isDefault ? 'Default calendar' : 'Set as default'}
                    >
                      <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  <label className="gcal-toggle">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggleCalendar(cal)}
                    />
                    <span className="gcal-toggle-slider" />
                  </label>
                </div>
              );
            })
          ) : null}
        </div>
      )}
    </div>
  );
}

function ContextMappingSection() {
  const { contexts } = useContexts();
  const { syncedCalendars, contextMappings, mapContextToCalendar } = useGoogleSync();
  const { showToast } = useToast();

  const writableCalendars = syncedCalendars.filter(c =>
    c.is_enabled && c.access_role !== 'reader' && c.access_role !== 'freeBusyReader'
  );

  if (writableCalendars.length === 0 || contexts.length === 0) return null;

  const handleMapping = async (contextId, calendarId) => {
    try {
      await mapContextToCalendar(contextId, calendarId || null);
      showToast('Mapping updated');
    } catch {
      showToast('Failed to update mapping', { type: 'error' });
    }
  };

  return (
    <div className="gcal-mappings">
      <h4 className="gcal-sub-title">
        <Link2 size={14} /> Context to Calendar Mapping
      </h4>
      <p className="settings-hint">
        Events with a context will automatically sync to the mapped calendar.
      </p>
      <div className="gcal-mapping-list">
        {contexts.map(ctx => {
          const mapping = contextMappings.find(m => m.context_id === ctx.id);
          const selectedCalId = mapping?.synced_calendar_id || '';

          return (
            <div key={ctx.id} className="gcal-mapping-item">
              <div className="gcal-mapping-context">
                <div className="context-color-dot" style={{ background: ctx.color }} />
                <span>{ctx.name}</span>
              </div>
              <select
                className="gcal-mapping-select"
                value={selectedCalId}
                onChange={(e) => handleMapping(ctx.id, e.target.value)}
              >
                <option value="">None (use default)</option>
                {writableCalendars.map(cal => (
                  <option key={cal.id} value={cal.id}>
                    {cal.calendar_name}{cal.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GoogleCalendarSettings() {
  const {
    connections, syncedCalendars, isSyncing,
    connectGoogle, disconnectGoogle, syncAll
  } = useGoogleSync();
  const { showToast } = useToast();
  const [disconnecting, setDisconnecting] = useState(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(null);

  // Handle OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      showToast('Google Calendar connected!');
      localStorage.removeItem('google_oauth_pending');
      window.history.replaceState({}, '', window.location.pathname);
    }
    const error = params.get('google_error');
    if (error) {
      const messages = {
        consent_denied: 'Google Calendar access was denied',
        exchange_failed: 'Failed to connect. Please try again.',
        invalid_state: 'Connection expired. Please try again.',
        state_expired: 'Connection timed out. Please try again.',
        no_email: 'Could not retrieve Google email',
        db_error: 'Failed to save connection',
      };
      showToast(messages[error] || `Connection error: ${error}`, { type: 'error' });
      localStorage.removeItem('google_oauth_pending');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [showToast]);

  const handleConnect = async () => {
    try {
      await connectGoogle();
    } catch (err) {
      showToast('Failed to start connection', { type: 'error' });
      console.error(err);
    }
  };

  const handleDisconnect = async (connectionId, keepEvents) => {
    setDisconnecting(connectionId);
    try {
      await disconnectGoogle(connectionId, keepEvents);
      showToast('Google Calendar disconnected');
    } catch {
      showToast('Failed to disconnect', { type: 'error' });
    } finally {
      setDisconnecting(null);
      setShowDisconnectConfirm(null);
    }
  };

  const handleSync = async () => {
    try {
      await syncAll();
      showToast('Calendars synced');
    } catch {
      showToast('Sync failed', { type: 'error' });
    }
  };

  const enabledCount = syncedCalendars.filter(c => c.is_enabled).length;
  const lastSynced = syncedCalendars
    .filter(c => c.last_synced_at)
    .sort((a, b) => new Date(b.last_synced_at) - new Date(a.last_synced_at))[0]?.last_synced_at;

  const isPending = localStorage.getItem('google_oauth_pending') === 'true';

  return (
    <div className="gcal-settings">
      <h3 className="settings-section-title">
        <Calendar size={16} /> Google Calendar
      </h3>

      <p className="settings-hint">
        Events sync in both directions. Changes you make here appear in Google Calendar, and vice versa.
      </p>

      {isPending && !connections.length && (
        <div className="gcal-pending">
          <Loader2 size={14} className="spin" />
          <span>Connecting to Google...</span>
        </div>
      )}

      {/* Connected accounts */}
      {connections.map(conn => (
        <ConnectionItem
          key={conn.id}
          connection={conn}
          onDisconnect={(id) => setShowDisconnectConfirm(id)}
        />
      ))}

      {/* Disconnect confirmation */}
      {showDisconnectConfirm && (
        <div className="gcal-confirm-overlay">
          <div className="gcal-confirm-dialog glass-panel">
            <p className="gcal-confirm-title">Disconnect Google Calendar?</p>
            <p className="gcal-confirm-text">
              What should happen to imported events?
            </p>
            <div className="gcal-confirm-actions">
              <button
                className="btn-secondary"
                onClick={() => handleDisconnect(showDisconnectConfirm, true)}
                disabled={disconnecting}
              >
                Keep events locally
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDisconnect(showDisconnectConfirm, false)}
                disabled={disconnecting}
              >
                Remove Google events
              </button>
              <button
                className="btn-ghost"
                onClick={() => setShowDisconnectConfirm(null)}
                disabled={disconnecting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect button */}
      <button className="gcal-connect-btn" onClick={handleConnect}>
        <Plus size={16} />
        <span>{connections.length > 0 ? 'Connect Another Account' : 'Connect Google Account'}</span>
      </button>

      {/* Sync controls */}
      {enabledCount > 0 && (
        <div className="gcal-sync-controls">
          <button
            className="gcal-sync-btn"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw size={14} className={isSyncing ? 'spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
          {lastSynced && (
            <span className="gcal-last-synced">
              Last synced: {new Date(lastSynced).toLocaleString(undefined, {
                hour: 'numeric', minute: '2-digit', hour12: true
              })}
            </span>
          )}
        </div>
      )}

      {/* Context mapping */}
      <ContextMappingSection />
    </div>
  );
}
