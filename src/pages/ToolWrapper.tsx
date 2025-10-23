
import React, { useEffect, useMemo } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';

import { NovelSplitter } from '../tools/NovelSplitter';
import { EpubSplitter } from '../tools/EpubSplitter';
import { ZipEpub } from '../tools/ZipEpub';
import { CreateBackupFromZip } from '../tools/CreateBackupFromZip';
import { MergeBackup } from '../tools/MergeBackup';
import { AugmentBackupWithZip } from '../tools/AugmentBackupWithZip';
import { FindReplaceBackup } from '../tools/FindReplaceBackup';
import { BackupOrganizer } from '../tools/BackupOrganizer';

// Tool mapping for the router
export const toolSectionsMap: Record<string, { component: React.FC; title: string }> = {
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
            <div className="p-8 text-center">
                <h2 className="text-xl font-semibold mb-4">Tool not found</h2>
                <Link to="/" className="text-primary-600 hover:underline">Return to Dashboard</Link>
            </div>
        );
    }
    
    return <ToolComponent />;
};
