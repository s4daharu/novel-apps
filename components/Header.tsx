import React from 'react';
import { useAppContext } from '../contexts/AppContext';

interface HeaderProps {
    title: string;
    onToggleMenu: () => void;
}

const ThemeToggleButton: React.FC<{className?: string}> = ({ className }) => {
    const { theme } = useAppContext();
    return (
        <>
            <svg className={`sun-icon h-6 w-6 ${theme === 'light' ? 'hidden' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m8.66-15.66l-.7.7m-12.28 12.28l-.7.7M21 12h-1M4 12H3m15.66 8.66l-.7-.7m-12.28-12.28l-.7-.7 M12 18a6 6 0 100-12 6 6 0 000 12z"></path></svg>
            <svg className={`moon-icon h-6 w-6 ${theme === 'dark' ? 'hidden' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
        </>
    );
};

const ThemeToggle: React.FC<{className?: string}> = ({ className }) => {
    const { toggleTheme } = useAppContext();
    return (
        <button onClick={toggleTheme} className={`text-2xl text-slate-500 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 ${className}`} aria-label="Toggle theme">
            <ThemeToggleButton />
        </button>
    );
};

export const Header: React.FC<HeaderProps> = ({ title, onToggleMenu }) => {
    return (
        <>
            {/* Mobile-first header */}
            <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700 md:hidden sticky top-0 z-50" style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white" id="appTitle">{title}</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <button onClick={onToggleMenu} className="text-2xl text-slate-500 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
                        ☰
                    </button>
                </div>
            </header>

            {/* Desktop header */}
            <header className="hidden md:flex items-center justify-between p-6 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700 sticky top-0 z-50" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white" id="appTitle">{title}</h1>
                <div className="absolute top-1/2 right-72 transform -translate-y-1/2">
                    <ThemeToggle />
                </div>
            </header>
        </>
    );
};
