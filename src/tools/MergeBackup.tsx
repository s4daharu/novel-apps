import React, { useState, useRef, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload } from '../utils/helpers';
import { calculateWordCount } from '../utils/backupHelpers';
import { Status, BackupData, BackupScene, BackupSection } from '../utils/types';

export const MergeBackup: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    type BackupFileItem = { id: string; file: File; title: string; cover: string | null; data: BackupData; };
    const [files, setFiles] = useState<BackupFileItem[]>([]);
    const [mergedTitle, setMergedTitle] = useState('');
    const [mergedDesc, setMergedDesc] = useState('');
    const [chapterPrefix, setChapterPrefix] = useState('');
    const [preserveTitles, setPreserveTitles] = useState(false);
    const [selectedCover, setSelectedCover] = useState<string | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const draggedItemIndex = useRef<number | null>(null);
    const draggedOverItemIndex = useRef<number | null>(null);

    const handleFileSelected = async (fileList: FileList) => {
        showSpinner();
        setStatus(null);
        const filePromises = Array.from(fileList).map(async (file, index) => {
            try {
                const text = await file.text();
                const data = JSON.parse(text) as BackupData;
                if (!data.revisions || !data.title) throw new Error('Invalid backup file format.');
                return {
                    id: `backup-${Date.now()}-${index}`,
                    file: file,
                    title: data.title || file.name,
                    cover: data.cover || null,
                    data: data
                };
            } catch (e: any) {
                showToast(`Could not parse ${file.name}: ${e.message}`, true);
                return null;
            }
        });
        const loadedFiles = (await Promise.all(filePromises)).filter((f): f is BackupFileItem => f !== null);
        setFiles(loadedFiles);
        if (loadedFiles.length > 0) {
            const firstCover = loadedFiles.find(f => f.cover)?.cover || null;
            setSelectedCover(firstCover);
        }
        hideSpinner();
    };

    const handleMerge = async () => {
        setStatus(null);
        if (files.length === 0) return showToast('Select at least one backup file to merge.', true);
        if (!mergedTitle) return showToast('Merged Project Title is required.', true);
        
        showSpinner();
        try {
            let combinedScenes: BackupScene[] = [];
            let combinedSections: BackupSection[] = [];
            const allStatuses = new Map<string, any>();

            files.forEach(fileItem => {
                const rev = fileItem.data.revisions?.[0];
                if (rev) {
                    if (rev.scenes) {
                        if (preserveTitles) rev.scenes.forEach(s => s.originalTitle = s.title);
                        combinedScenes.push(...rev.scenes);
                    }
                    if (rev.sections) {
                        if (preserveTitles) rev.sections.forEach(s => s.originalTitle = s.title);
                        combinedSections.push(...rev.sections);
                    }
                    if (rev.statuses) rev.statuses.forEach(status => !allStatuses.has(status.code) && allStatuses.set(status.code, status));
                }
            });

            const finalStatuses = Array.from(allStatuses.values()).sort((a, b) => (a.ranking || Infinity) - (b.ranking || Infinity)).map((s, i) => ({ ...s, ranking: i + 1 }));
            if (finalStatuses.length === 0) finalStatuses.push({ code: '1', title: 'Todo', color: -2697255, ranking: 1 });

            combinedScenes.forEach((s, i) => {
                const n = i + 1;
                s.code = `scene${n}`;
                s.title = (preserveTitles && s.originalTitle) ? (chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle) : (chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`);
                s.ranking = n;
                delete s.originalTitle;
            });
            combinedSections.forEach((s, i) => {
                const n = i + 1;
                s.code = `section${n}`;
                s.title = (preserveTitles && s.originalTitle) ? (chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle) : (chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`);
                s.ranking = n;
                delete s.originalTitle;
                s.section_scenes = [{ code: `scene${n}`, ranking: 1 }];
            });

            const now = Date.now();
            const mergedData: BackupData = {
                version: 4,
                code: Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'),
                title: mergedTitle,
                description: mergedDesc,
                cover: selectedCover,
                show_table_of_contents: true,
                apply_automatic_indentation: false,
                last_update_date: now,
                last_backup_date: now,
                revisions: [{
                    number: 1, date: now,
                    book_progresses: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate(), word_count: calculateWordCount(combinedScenes) }],
                    statuses: finalStatuses,
                    scenes: combinedScenes,
                    sections: combinedSections
                }]
            };

            const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
            const filenameBase = mergedTitle.replace(/[^a-z0-9_\\-\\s]/gi, '_').replace(/\\s+/g, '_') || 'merged_backup';
            triggerDownload(blob, `${filenameBase}.json`);
            setStatus({ message: `Backup files merged into "${mergedTitle}". Download started.`, type: 'success' });
        } catch(e: any) {
            setStatus({ message: `Error: ${e.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };
    
    const handleDragSort = () => {
        if (draggedItemIndex.current === null || draggedOverItemIndex.current === null) return;
        const items = [...files];
        const draggedItemContent = items.splice(draggedItemIndex.current, 1)[0];
        items.splice(draggedOverItemIndex.current, 0, draggedItemContent);
        draggedItemIndex.current = null;
        draggedOverItemIndex.current = null;
        setFiles(items);
    };
    
    const covers = useMemo(() => files.map(f => f.cover).filter((c): c is string => c !== null), [files]);

    return (
        <div id="mergeBackupApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in will-change-[transform,opacity]">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Merge Backup Files</h1>
            <div className="max-w-md mx-auto mb-6">
                <FileInput inputId="mergeBackupFiles" label="Upload Backup Files" accept=".json,.txt,.nov" multiple onFileSelected={handleFileSelected} onFileCleared={() => setFiles([])} />
            </div>
            {files.length > 0 && (
                <>
                <div className="max-w-md mx-auto">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Files to merge (drag to reorder):</label>
                    <ul className="list-none p-2 my-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-100 dark:bg-slate-800 max-h-48 overflow-y-auto">
                        {files.map((file, index) => (
                            <li key={file.id} draggable onDragStart={() => (draggedItemIndex.current = index)} onDragEnter={() => (draggedOverItemIndex.current = index)} onDragEnd={handleDragSort} onDragOver={e => e.preventDefault()}
                                className="flex items-center p-2.5 border-b border-slate-200 dark:border-slate-700 last:border-b-0 cursor-grab user-select-none transition-all duration-200 rounded-md mb-0.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50">
                                <span className="text-slate-800 dark:text-slate-200 p-1.5 text-sm">{file.title}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                 {covers.length > 0 && (
                    <div className="max-w-2xl mx-auto mb-6">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3 text-center">Select a Cover</h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 p-3 bg-slate-100 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600/50">
                             <div onClick={() => setSelectedCover(null)} className={`w-full aspect-[2/3] bg-slate-200 dark:bg-slate-800 rounded-md flex items-center justify-center text-center text-xs p-2 text-slate-600 dark:text-slate-300 cursor-pointer transition-all duration-200 ${!selectedCover ? 'ring-4 ring-primary-500' : ''}`}>
                                No Cover
                            </div>
                            {covers.map((cover, i) => (
                                <div key={i} onClick={() => setSelectedCover(cover)} style={{ backgroundImage: `url(data:image/jpeg;base64,${cover})` }}
                                className={`w-full aspect-[2/3] bg-cover bg-center rounded-md cursor-pointer transition-all duration-200 ${selectedCover === cover ? 'ring-4 ring-primary-500' : ''}`}>
                                </div>
                            ))}
                        </div>
                    </div>
                 )}
                </>
            )}

            <div className="space-y-6 max-w-md mx-auto">
                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Merged Project Info</h3>
                    <div>
                        <label htmlFor="mergeProjectTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Merged Project Title:</label>
                        <input type="text" id="mergeProjectTitle" value={mergedTitle} onChange={e => setMergedTitle(e.target.value)} placeholder="Enter title for merged backup" className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 w-full" />
                    </div>
                    <div className="mt-4">
                        <label htmlFor="mergeDescription" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Merged Description:</label>
                        <textarea id="mergeDescription" value={mergedDesc} onChange={e => setMergedDesc(e.target.value)} placeholder="Enter description" rows={3} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 w-full"></textarea>
                    </div>
                </div>

                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Chapter Configuration</h3>
                     <div>
                        <label htmlFor="mergePrefix" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Prefix for Chapters (Optional):</label>
                        <input type="text" id="mergePrefix" value={chapterPrefix} onChange={e => setChapterPrefix(e.target.value)} placeholder="e.g., Part I - " className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 w-full" />
                    </div>
                    <div className="mt-4">
                        <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 select-none cursor-pointer">
                            <input type="checkbox" checked={preserveTitles} onChange={e => setPreserveTitles(e.target.checked)} className="w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600"/> Preserve Original Chapter Titles
                        </label>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button onClick={handleMerge} disabled={files.length === 0} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg disabled:opacity-50">Merge and Download</button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};