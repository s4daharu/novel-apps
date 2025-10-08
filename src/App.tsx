import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ToolWrapper } from './pages/ToolWrapper';

export const App: React.FC = () => {

    useEffect(() => {
        // Initialize theme from localStorage
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    return (
        <AppProvider>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="tool/:toolId" element={<ToolWrapper />} />
                    <Route path="*" element={<Dashboard />} />
                </Route>
            </Routes>
        </AppProvider>
    );
};
