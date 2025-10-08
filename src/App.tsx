
import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ToolWrapper } from './pages/ToolWrapper';

export const App: React.FC = () => {

    useEffect(() => {
        // PWA Service Worker Registration
        if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
            const swUrl = new URL('service-worker.js', window.location.href).href;
            navigator.serviceWorker.register(swUrl)
                .then(registration => console.log('Service Worker registered with scope:', registration.scope))
                .catch(error => console.error('Service Worker registration failed:', error));
        }

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
