
import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip } from '../utils/helpers';
import { calculateWordCount, parseTextToBlocks } from '../utils/backupHelpers';
import { Status, BackupData } from '../utils/types';

export const AugmentBackupWithZip: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [baseFile, setBaseFile] = useState<File | null>(null);
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [prefix, setPrefix] = useState('');
    const [startNumber, setStartNumber] = useState(1);
    const [minStartNumber, setMinStartNumber] = useState(1);
    const [preserveTitles, setPreserveTitles] = useState(false);
    const [shiftExisting, setShiftExisting] = useState(false);
    const [status, setStatus] = useState<Status | null>(null);

    const handleBaseFileSelected = async (files: FileList) => {
        const file = files[0];
        setBaseFile(file);
        setStatus(null);
        if (!file) {
            setStartNumber(1);
            setMinStartNumber(1);
            return;
        }

        showSpinner();
        try {
            const baseFileText = await file.text();
            const backupData: BackupData = JSON.parse(baseFileText);
            if (!backupData.revisions?.[0]?.scenes) {
                throw new Error('Invalid backup file structure.');
            }
            const currentRevision = backupData.revisions[0];
            let maxExistingRank = 0;
            currentRevision.scenes.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            currentRevision.sections.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            
            const nextAvailableRank = maxExistingRank + 1;
            setStartNumber(nextAvailableRank);
            setMinStartNumber(1); // Allow insertion at any point, technically
        } catch (err: any) {
            showToast(`Error reading base backup: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    const handleAugmentBackup = async () => {
        setStatus(null);
        if (!baseFile) {
            showToast('Please select a base backup file.', true);
            setStatus({ message: 'Error: Base backup file is required.', type: 'error' });
            return;
        }
        if (!zipFile) {
            showToast('Please select a ZIP file.', true);
            setStatus({ message: 'Error: ZIP file is required.', type: 'error' });
            return;
        }

        showSpinner();

        try {
            const baseFileText = await baseFile.text();
            let backupData: BackupData;
            try {
                backupData = JSON.parse(baseFileText);
            } catch (jsonErr) {
                throw new Error('Base backup file is not valid JSON.');
            }

            if (!backupData.revisions?.[0]?.scenes || !backupData.revisions?.[0]?.sections) {
                throw new Error('Base backup file has an invalid or incomplete structure.');
            }
            const currentRevision = backupData.revisions[0];
            
            // Check for collision if not shifting
            if (!shiftExisting) {
                const isRankOccupied = currentRevision.scenes.some(s => s.ranking >= startNumber);
                if (isRankOccupied) {
                   // Calculate max again just to be safe
                   let maxRank = 0;
                   currentRevision.scenes.forEach(s => { if (s.ranking > maxRank) maxRank = s.ranking; });
                   if (startNumber <= maxRank) {
                       throw new Error(`Start Number ${startNumber} collides with existing chapters (Max: ${maxRank}). Enable "Shift existing chapters" to insert, or increase Start Number.`);
                   }
                }
            }

            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(zipFile);
            const chapterFilePromises = zip.file(/.txt$/i).map((file: any) =>
                file.async('string').then((text: string) => ({ name: file.name, text }))
            );

            const chapterFiles = (await Promise.all(chapterFilePromises))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (chapterFiles.length === 0) {
                showToast('No .txt files found in the ZIP archive. No changes made.', false);
                setStatus({ message: 'Info: No .txt files found in ZIP. Backup not augmented.', type: 'info' });
                hideSpinner();
                return;
            }

            // Shift existing chapters if enabled
            if (shiftExisting) {
                const shiftAmount = chapterFiles.length;
                currentRevision.scenes.forEach(s => {
                    if (s.ranking >= startNumber) s.ranking += shiftAmount;
                });
                currentRevision.sections.forEach(s => {
                    if (s.ranking >= startNumber) s.ranking += shiftAmount;
                });
            }

            const timestamp = Date.now();

            chapterFiles.forEach((chapterFile, index) => {
                const newRank = startNumber + index;
                // Use robust ID generation to prevent code collisions with shifted chapters
                const uniqueId = `${timestamp}_${index}`;
                const sceneCode = `scene_${uniqueId}`;
                const sectionCode = `section_${uniqueId}`;
                
                const txtFilename = chapterFile.name.replace(/\.txt$/i, '');
                let chapterTitle;

                if (preserveTitles) {
                    chapterTitle = (prefix && !txtFilename.toLowerCase().startsWith(prefix.toLowerCase()))
                        ? `${prefix}${txtFilename}`
                        : txtFilename;
                } else {
                    chapterTitle = prefix ? `${prefix}${newRank}` : `Chapter ${newRank}`;
                }

                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));

                currentRevision.scenes.push({
                    code: sceneCode, title: chapterTitle, text: sceneText,
                    ranking: newRank, status: '1'
                });
                currentRevision.sections.push({
                    code: sectionCode, title: chapterTitle, synopsis: '',
                    ranking: newRank, section_scenes: [{ code: sceneCode, ranking: 1 }]
                });
            });

            // Update stats
            const now = Date.now();
            backupData.last_update_date = now;
            backupData.last_backup_date = now;
            currentRevision.date = now;

            const totalWordCount = calculateWordCount(currentRevision.scenes);
            if (!currentRevision.book_progresses) currentRevision.book_progresses = [];
            const today = new Date();
            const lastProgress = currentRevision.book_progresses[currentRevision.book_progresses.length - 1];

            if (lastProgress && lastProgress.year === today.getFullYear() && lastProgress.month === today.getMonth() + 1 && lastProgress.day === today.getDate()) {
                lastProgress.word_count = totalWordCount;
            } else {
                currentRevision.book_progresses.push({
                    year: today.getFullYear(),
                    month: today.getMonth() + 1,
                    day: today.getDate(),
                    word_count: totalWordCount
                });
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = backupData.title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'augmented_backup'}.json`;

            if (triggerDownload(blob, filename)) {
                setStatus({ message: `Backup augmented with ${chapterFiles.length} chapter(s). Download started.`, type: 'success' });
                showToast(`Backup augmented successfully with ${chapterFiles.length} chapters.`);
            } else {
                throw new Error("Failed to trigger download.");
            }

        } catch (err: any) {
            console.error("Augment Backup with ZIP Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    return (
        <div id="augmentBackupWithZipApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in will-change-[transform,opacity]">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Augment Backup with ZIP</h1>

            <div className="mb-6 max-w-md mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <FileInput
                            inputId="augmentBaseBackupFile"
                            label="Base Backup File"
                            accept=".json,.txt,.nov"
                            onFileSelected={handleBaseFileSelected}
                            onFileCleared={() => {
                                setBaseFile(null);
                                setStartNumber(1);
                                setMinStartNumber(1);
                            }}
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload your existing backup file</p>
                    </div>
                    <div>
                        <FileInput
                            inputId="augmentZipFile"
                            label="ZIP with Chapters"
                            accept=".zip"
                            onFileSelected={(files) => setZipFile(files[0])}
                            onFileCleared={() => setZipFile(null)}
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload ZIP containing new chapter files</p>
                    </div>
                </div>
            </div>

            <div className="space-y-6 max-w-md mx-auto">
                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">Chapter Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="augmentPrefix" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Prefix for New Chapters:</label>
                            <input type="text" id="augmentPrefix" value={prefix} onChange={e => setPrefix(e.target.value)} placeholder="e.g., New Section - " className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                        <div>
                            <label htmlFor="augmentStartNumber" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Number:</label>
                            <input type="number" id="augmentStartNumber" value={startNumber} onChange={e => setStartNumber(parseInt(e.target.value, 10))} min="1" className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                    </div>
                    <div className="mt-4 space-y-2">
                         <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 select-none cursor-pointer">
                            <input type="checkbox" checked={shiftExisting} onChange={e => setShiftExisting(e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500" />
                            <span>Shift existing chapters to make room (Insert mode)</span>
                        </label>
                        <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 select-none cursor-pointer">
                            <input type="checkbox" checked={preserveTitles} onChange={e => setPreserveTitles(e.target.checked)} className="rounded text-primary-600 focus:ring-primary-500" />
                            <span>Use .txt filenames as titles</span>
                        </label>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button onClick={handleAugmentBackup} disabled={!baseFile || !zipFile} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed">
                    Augment and Download
                </button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};
