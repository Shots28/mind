import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle, X } from 'lucide-react';
import './Toast.css';

const ToastContext = createContext({});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, action = null) => {
    setToast({ message, action, id: Date.now() });
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div className="toast-container" key={toast.id}>
          <div className="toast glass-panel">
            <CheckCircle size={16} className="toast-icon" />
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button className="toast-action" onClick={() => { toast.action.onClick(); dismissToast(); }}>
                {toast.action.label}
              </button>
            )}
            <button className="toast-close" onClick={dismissToast}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
