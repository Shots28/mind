import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext({});

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const MAX_TOASTS = 5;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message, options = {}) => {
    const {
      type = 'success',
      action = null,
      duration = 4000,
    } = typeof options === 'object' && options !== null && !options.label ? options : { action: options };

    const id = Date.now() + Math.random();
    const toast = { id, message, type, action, duration };

    setToasts(prev => {
      const next = [...prev, toast];
      if (next.length > MAX_TOASTS) return next.slice(-MAX_TOASTS);
      return next;
    });

    if (duration > 0) {
      const timer = setTimeout(() => dismissToast(id), duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismissToast]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((toast) => {
            const Icon = ICONS[toast.type] || CheckCircle;
            return (
              <div key={toast.id} className={`toast glass-panel toast-${toast.type}`}>
                <Icon size={16} className="toast-icon" />
                <span className="toast-message">{toast.message}</span>
                {toast.action && (
                  <button className="toast-action" onClick={() => { toast.action.onClick(); dismissToast(toast.id); }}>
                    {toast.action.label}
                  </button>
                )}
                <button className="toast-close" onClick={() => dismissToast(toast.id)}>
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
