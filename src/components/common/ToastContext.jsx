import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { X, Bell, Zap, CheckCircle2, AlertCircle } from 'lucide-react';

const ToastContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ title, description, type = 'info', icon, duration = 5000, actionUrl }) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, title, description, type, icon, duration, actionUrl }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastItem = ({ toast, onRemove }) => {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onRemove();
    }, 300); // Wait for transition out
  }, [onRemove]);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      handleClose();
    }, toast.duration);
    
    return () => clearTimeout(timerRef.current);
  }, [toast.duration, handleClose]);

  const getTheme = () => {
    switch(toast.type) {
      case 'success': return { bg: 'bg-[#1a9a5c]/10 border-[#1a9a5c]/30 text-[#1a9a5c]', icon: <CheckCircle2 size={18} /> };
      case 'error': return { bg: 'bg-red-500/10 border-red-500/30 text-red-500', icon: <AlertCircle size={18} /> };
      case 'edge': return { bg: 'bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]', icon: <Zap size={18} fill="currentColor" className="animate-pulse" /> };
      default: return { bg: 'bg-sports-secondary/50 border-sports-secondary text-sports-text', icon: <Bell size={18} /> };
    }
  };

  const theme = getTheme();

  return (
    <div 
      className={`relative rounded-xl border p-4 shadow-xl backdrop-blur-sm pointer-events-auto transition-all duration-300 ${theme.bg} ${isClosing ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100 animate-slide-up'}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{toast.icon || theme.icon}</div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white pr-4">{toast.title}</h4>
          {toast.description && (
            <p className="text-xs text-gray-400 mt-1 font-medium">{toast.description}</p>
          )}
        </div>
        <button 
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
      {toast.actionUrl && (
        <a 
          href={toast.actionUrl}
          className="block mt-3 w-full py-1.5 text-center bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold uppercase tracking-widest rounded transition-colors"
        >
          View Edge
        </a>
      )}
    </div>
  );
};
