import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip } from '../utils/helpers';
import { calculateWordCount, createNewBackupStructure, parseTextToBlocks } from '../utils/backupHelpers';
import { Status, BackupScene, BackupSection } from '../utils/types';

export const CreateBackupFromZip: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [projectTitle, setProjectTitle] = useState('');
    const [description, setDescription] = useState('');
    const [uniqueCode, setUniqueCode] = useState('');
    const [chapterPattern, setChapterPattern] = useState('Chapter ');
    const [startNumber, setStartNumber] = useState(1);
    const [extraChapters, setExtraChapters] = useState(0);
    const [status, setStatus] = useState<Status | null>(null);

    const handleCreateBackup = async () => {
        if (!zipFile) {
            showToast('Please upload a ZIP file.', true);
            setStatus({ message: 'Error: Please upload a ZIP file.', type: 'error' });
            return;
        }
        if (!projectTitle) {
            showToast('Project Title is required.', true);
            setStatus({ message: 'Error: Project Title is required.', type: 'error' });
            return;
        }

        showSpinner();
        setStatus(null);
        
        try {
            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(zipFile);
            const scenes: BackupScene[] = [];
            const sections: BackupSection[] = [];
            let currentProcessingIndex = 0;

            const chapterFilePromises = zip.file(/.txt$/i).map((file: any) => 
                file.async('string').then((text: string) => ({ name: file.name, text }))
            );

            const chapterFiles = (await Promise.all(chapterFilePromises))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            for (const chapterFile of chapterFiles) {
                const currentRank = startNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const title = chapterPattern ? `${chapterPattern}${currentRank}` : chapterFile.name.replace(/\.txt$/i, '');
                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));
                scenes.push({ code: sceneCode, title, text: sceneText, ranking: currentRank, status: '1' });
                sections.push({ code: sectionCode, title, synopsis: '', ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
                currentProcessingIndex++;
            }
            
            for (let i = 0; i < extraChapters; i++) {
                const currentRank = startNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const title = chapterPattern ? `${chapterPattern}${currentRank}` : `Chapter ${currentRank}`;
                const emptySceneContent = { blocks: [{ type: 'text', align: 'left', text: '' }] };
                scenes.push({ code: sceneCode, title, text: JSON.stringify(emptySceneContent), ranking: currentRank, status: '1' });
                sections.push({ code: sectionCode, title, synopsis: '', ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
                currentProcessingIndex++;
            }

            if (scenes.length === 0) {
                 throw new Error('No .txt files found in ZIP and no extra chapters requested.');
            }

            const backupData = createNewBackupStructure(projectTitle, description, uniqueCode);
            backupData.revisions[0].scenes = scenes;
            backupData.revisions[0].sections = sections;
            backupData.revisions[0].book_progresses[0].word_count = calculateWordCount(scenes);

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = projectTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'backup_from_zip'}.json`;

            if(triggerDownload(blob, filename)) {
                setStatus({ message: `Backup file created with ${scenes.length} chapter(s). Download started.`, type: 'success' });
                showToast(`Backup file created with ${scenes.length} chapter(s).`);
            } else {
                throw new Error("Failed to trigger download.");
            }

        } catch (err: any) {
            console.error("Create Backup from ZIP Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };
    
    return (
        <div id="createBackupFromZipApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in will-change-[transform,opacity]">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Create Backup from ZIP</h1>
            <div className="max-w-md mx-auto mb-6">
                <FileInput 
                    inputId="zipBackupFile" 
                    label="Upload ZIP File" 
                    accept=".zip"
                    onFileSelected={(files) => setZipFile(files[0])}
                    onFileCleared={() => setZipFile(null)}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload a ZIP file containing .txt chapter files</p>
            </div>
            
            <div className="space-y-6 max-w-md mx-auto">
                 <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">Project Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="zipProjectTitle" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Title:</label>
                            <input type="text" id="zipProjectTitle" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="Enter project title" className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                        <div>
                             <label htmlFor="zipUniqueCode" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Unique Code (Optional):</label>
                            <input type="text" id="zipUniqueCode" value={uniqueCode} onChange={e => setUniqueCode(e.target.value)} placeholder="Auto-generated if blank" className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                    </div>
                     <div className="mt-4">
                        <label htmlFor="zipDescription" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description:</label>
                        <textarea id="zipDescription" value={description} onChange={e => setDescription(e.target.value)} placeholder="Enter project description" rows={3} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full min-h-[80px]"></textarea>
                    </div>
                 </div>
                 <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">Chapter Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="zipChapterPattern" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chapter Pattern:</label>
                            <input type="text" id="zipChapterPattern" value={chapterPattern} onChange={e => setChapterPattern(e.target.value)} placeholder="e.g., Chapter " className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                        <div>
                            <label htmlFor="zipStartNumber" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Number:</label>
                            <input type="number" id="zipStartNumber" value={startNumber} onChange={e => setStartNumber(parseInt(e.target.value, 10))} min="1" className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <label htmlFor="zipExtraChapters" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Extra Empty Chapters:</label>
                        <input type="number" id="zipExtraChapters" value={extraChapters} onChange={e => setExtraChapters(parseInt(e.target.value, 10))} min="0" className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Add this many empty chapters to the end of your backup</p>
                    </div>
                 </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button onClick={handleCreateBackup} disabled={!zipFile} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 disabled:opacity-60 disabled:cursor-not-allowed">
                    Generate Backup and Download
                </button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};