import React, { useState, useMemo, lazy, Suspense } from 'react';
import { AppContextProvider } from './contexts/AppContext';
import { useHashRouter } from './hooks/useHashRouter';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import type { Tool } from './types';

const toolSectionsMap: Record<string, Tool> = {
    'novelSplitter': { id: 'novelSplitter', title: 'Novel Splitter', description: 'Advanced tool to split, edit, and package .txt novels into chapters, with export to ZIP or themed EPUB.', component: lazy(() => import('./tools/NovelSplitter')) },
    'splitter': { id: 'splitter', title: 'EPUB Chapter Splitter', description: 'Divide EPUB files into individual or grouped chapter text files with precision control.', component: lazy(() => import('./tools/EpubSplitter')) },
    'zipEpub': { id: 'zipEpub', title: 'ZIP ↔ EPUB', description: 'Convert between ZIP files and EPUB format with bidirectional support and customization.', component: lazy(() => import('./tools/ZipEpub')) },
    'createBackupFromZip': { id: 'createBackupFromZip', title: 'Create Backup from ZIP', description: 'Generate structured novel backup files directly from ZIP archives containing text chapters.', component: lazy(() => import('./tools/CreateBackupFromZip')) },
    'mergeBackup': { id: 'mergeBackup', title: 'Merge Backup Files', description: 'Combine multiple novel backup files into a single, organized backup with smart conflict resolution.', component: lazy(() => import('./tools/MergeBackup')) },
    'augmentBackupWithZip': { id: 'augmentBackupWithZip', title: 'Augment Backup with ZIP', description: 'Expand existing novel backups by adding new chapters from ZIP files seamlessly.', component: lazy(() => import('./tools/AugmentBackupWithZip')) },
    'findReplaceBackup': { id: 'findReplaceBackup', title: 'Find & Replace in Backup', description: 'Perform powerful find and replace operations within novel backup files with regex support and preview.', component: lazy(() => import('./tools/FindReplaceBackup')) },
};

const Spinner = () => (
    <div className="flex justify-center items-center h-64">
        <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 rounded-full border-t-primary-600 animate-spin" role="status">
            <span className="sr-only">Loading...</span>
        </div>
    </div>
);

export const App: React.FC = () => {
    const { route } = useHashRouter();

    const activeToolId = useMemo(() => {
        if (route.startsWith('tool-')) {
            return route.substring('tool-'.length);
        }
        return null;
    }, [route]);

    const ActiveTool = activeToolId ? toolSectionsMap[activeToolId]?.component : null;
    const activeToolTitle = activeToolId ? toolSectionsMap[activeToolId]?.title : 'Novel-Apps';
    
    return (
        <AppContextProvider>
            <Layout title={activeToolTitle} tools={toolSectionsMap}>
                <main id="main-content" className="flex-1 pb-20 md:pb-0 md:mr-64">
                    {activeToolId && ActiveTool ? (
                        <Suspense fallback={<Spinner />}>
                            <ActiveTool />
                        </Suspense>
                    ) : (
                        <Dashboard tools={toolSectionsMap} />
                    )}
                </main>
            </Layout>
        </AppContextProvider>
    );
};