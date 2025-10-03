import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import type { Theme, ToastMessage } from '../types';

interface AppContextType {
  theme: Theme;
  toggleTheme: () => void;
  showToast: (message: string, isError?: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const Toast: React.FC<ToastMessage & { onDismiss: (id: number) => void }> = ({ id, message, isError, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(id);
        }, 3000);
        return () => clearTimeout(timer);
    }, [id, onDismiss]);

    return (
        <div 
          className={`px-4 py-2 rounded-lg text-white font-medium shadow-lg transition-all duration-300 animate-fade-in ${isError ? 'bg-red-600' : 'bg-green-600'}`}
          role="alert"
          aria-live="assertive"
        >
            {message}
        </div>
    );
};

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('light');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  const showToast = useCallback((message: string, isError = false) => {
    setToasts(currentToasts => [...currentToasts, { id: Date.now(), message, isError }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }, []);

  const value = { theme, toggleTheme, showToast };

  return (
    <AppContext.Provider value={value}>
      {children}
      <div id="toast-container" className="fixed top-20 md:bottom-8 md:top-auto left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        {toasts.map(toast => (
          <Toast key={toast.id} {...toast} onDismiss={dismissToast} />
        ))}
      </div>
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider');
  }
  return context;
};
