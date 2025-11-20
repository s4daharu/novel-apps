
import React, { useEffect, useMemo, Suspense } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';

// Lazy load tools to improve initial bundle size and performance
const NovelSplitter = React.lazy(() => import('../tools/NovelSplitter').then(m => ({ default: m.NovelSplitter })));
const EpubSplitter = React.lazy(() => import('../tools/EpubSplitter').then(m => ({ default: m.EpubSplitter })));
const ZipEpub = React.lazy(() => import('../tools/ZipEpub').then(m => ({ default: m.ZipEpub })));
const CreateBackupFromZip = React.lazy(() => import('../tools/CreateBackupFromZip').then(m => ({ default: m.CreateBackupFromZip })));
const MergeBackup = React.lazy(() => import('../tools/MergeBackup').then(m => ({ default: m.MergeBackup })));
const AugmentBackupWithZip = React.lazy(() => import('../tools/AugmentBackupWithZip').then(m => ({ default: m.AugmentBackupWithZip })));
const FindReplaceBackup = React.lazy(() => import('../tools/FindReplaceBackup').then(m => ({ default: m.FindReplaceBackup })));
const BackupOrganizer = React.lazy(() => import('../tools/BackupOrganizer').then(m => ({ default: m.BackupOrganizer })));

// Tool mapping for the router
export const toolSectionsMap: Record<string, { component: React.LazyExoticComponent<React.FC> | React.FC; title: string }> = {
    'splitter': { component: EpubSplitter, title: 'EPUB Chapter Splitter' },
    'augmentBackupWithZip': { component: AugmentBackupWithZip, title: 'Augment Backup with ZIP' },
    'zipEpub': { component: ZipEpub, title: 'ZIP ↔ EPUB' },
    'createBackupFromZip': { component: CreateBackupFromZip, title: 'Create Backup from ZIP' },
    'mergeBackup': { component: MergeBackup, title: 'Merge Backup Files' },
    'findReplaceBackup': { component: FindReplaceBackup, title: 'Find & Replace in Backup' },
    'backupOrganizer': { component: BackupOrganizer, title: 'Backup Organizer' },
    'novelSplitter': { component: NovelSplitter, title: 'Novel Splitter' }
};

export const ToolWrapper = () => {
    const navigate = useNavigate();
    const { toolId } = useParams<{ toolId: string }>();

    // This effect handles backward compatibility for old hash-based URLs (e.g., #tool-splitter)
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#tool-')) {
            const id = hash.substring(6);
            if (toolSectionsMap[id]) {
                navigate(`/tool/${id}`, { replace: true });
            } else {
                navigate('/', { replace: true });
            }
        }
    }, [navigate]);

    const ToolComponent = useMemo(() => {
        if (!toolId || !toolSectionsMap[toolId]) {
            return null;
        }
        return toolSectionsMap[toolId].component;
    }, [toolId]);

    if (!ToolComponent) {
        return (
            <div className="p-8 text-center animate-fade-in">
                <h2 className="text-xl font-semibold mb-4">Tool not found</h2>
                <Link to="/" className="text-primary-600 hover:underline">Return to Dashboard</Link>
            </div>
        );
    }
    
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                <div className="w-12 h-12 border-4 border-slate-200 border-t-primary-600 rounded-full animate-spin"></div>
                <p className="text-slate-500 dark:text-slate-400 animate-pulse">Loading Tool...</p>
            </div>
        }>
            <ToolComponent />
        </Suspense>
    );
};
