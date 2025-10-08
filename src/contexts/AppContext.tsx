
import React, { useState, createContext, useContext, PropsWithChildren } from 'react';
import { AppContextType, ToastMessage } from '../utils/types';

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<PropsWithChildren<{}>> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [spinnerCount, setSpinnerCount] = useState(0);
  let toastIdCounter = 0;

  const showToast = (message: string, isError = false) => {
    const id = toastIdCounter++;
    setToasts((prev) => [...prev, { id, message, isError }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const showSpinner = () => setSpinnerCount((c) => c + 1);
  const hideSpinner = () => setSpinnerCount((c) => Math.max(0, c - 1));

  const contextValue = { showToast, showSpinner, hideSpinner };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
      <div className="fixed top-20 md:bottom-8 md:top-auto left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-4 py-2 rounded-lg text-white font-medium transition-opacity duration-300 opacity-100 ${
              toast.isError ? 'bg-red-600' : 'bg-green-600'
            }`}
            role="alert"
            aria-live="assertive"
          >
            {toast.message}
          </div>
        ))}
      </div>
       {spinnerCount > 0 && (
         <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-slate-200 dark:border-slate-700 rounded-full border-t-primary-600 animate-spin" role="status" aria-live="polite" aria-label="Loading"></div>
         </div>
       )}
    </AppContext.Provider>
  );
};
