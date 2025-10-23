


import React, { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { ThemeToggleButton } from './ThemeToggleButton';
import { toolSectionsMap } from '../pages/ToolWrapper';

export const Layout: React.FC = () => {
    const [isMenuOpen, setMenuOpen] = useState(false);
    const location = useLocation();
    
    useEffect(() => {
        setMenuOpen(false); // Close menu on route change
    }, [location]);

    const getPageTitle = () => {
        const toolId = location.pathname.split('/')[2];
        if (toolId) {
            return toolSectionsMap[toolId]?.title || 'Novel-Apps';
        }
        return 'Novel-Apps';
    };
    
    // Explicitly define order to match the dashboard
    const toolOrder = ['splitter', 'augmentBackupWithZip', 'zipEpub', 'createBackupFromZip', 'mergeBackup', 'findReplaceBackup', 'backupOrganizer', 'novelSplitter'];

    return (
        <>
            {/* Mobile-first header */}
            <header className="flex items-center justify-between p-4 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700 md:hidden sticky top-0 z-30" style={{paddingTop: 'calc(1rem + env(safe-area-inset-top))'}}>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{getPageTitle()}</h1>
                <div className="flex items-center gap-2">
                    <ThemeToggleButton />
                    <button onClick={() => setMenuOpen(!isMenuOpen)} className="text-2xl text-slate-500 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">☰</button>
                </div>
            </header>
            
            {/* Desktop header */}
            <header className="hidden md:flex items-center justify-between p-6 bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700 sticky top-0 z-30" style={{paddingTop: 'calc(1.5rem + env(safe-area-inset-top))'}}>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{getPageTitle()}</h1>
                <div className="absolute top-1/2 right-72 transform -translate-y-1/2">
                    <ThemeToggleButton />
                </div>
            </header>

            {/* Sidebar */}
            <div className={`fixed top-0 right-0 w-64 h-full bg-slate-100 dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 transform transition-transform duration-300 ease-in-out md:translate-x-0 z-20 ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`} id="sidebar">
                <div className="p-6 pt-20">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Tools</h2>
                    <nav className="space-y-2">
                        <Link to="/" className="w-full text-left px-4 py-3 rounded-lg text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 block">Home Dashboard</Link>
                        {toolOrder.map(id => (
                             <Link key={id} to={`/tool/${id}`} className="w-full text-left px-4 py-3 rounded-lg text-slate-600 dark:text-slate-300 hover:text-primary-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-all duration-200 block">{toolSectionsMap[id]?.title}</Link>
                        ))}
                    </nav>
                </div>
            </div>

            {/* Main Content Container */}
            <main id="main-content" className="flex-1 pb-20 md:pb-0 md:mr-64 relative">
                <Outlet />
            </main>
        </>
    );
};