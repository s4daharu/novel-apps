
import React, { useState, useEffect } from 'react';

export const ThemeToggleButton: React.FC = () => {
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);
    
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

    return (
        <button className="theme-toggle-btn text-2xl text-slate-500 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="Toggle theme" onClick={toggleTheme}>
            <svg className={`sun-icon h-6 w-6 ${theme === 'light' ? 'hidden' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m8.66-15.66l-.7.7m-12.28 12.28l-.7.7M21 12h-1M4 12H3m15.66 8.66l-.7-.7m-12.28-12.28l-.7-.7 M12 18a6 6 0 100-12 6 6 0 000 12z"></path></svg>
            <svg className={`moon-icon h-6 w-6 ${theme === 'dark' ? 'hidden' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
        </button>
    );
};
