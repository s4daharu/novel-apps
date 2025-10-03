import React, { useReducer, useRef } from 'react';
import JSZip from 'jszip';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';
import { parseTextToBlocks, calculateWordCount } from '../utils/backupHelpers';

// State and Reducer
interface State {
    baseFile: File | null;
    baseFileName: string;
    zipFile: File | null;
    zipFileName: string;
    prefix: string;
    startNumber: number;
    minStartNumber: number;
    preserveTitles: boolean;
    isLoading: boolean;
    status: { message: string; type: 'success' | 'error' | 'info' } | null;
}

type Action = 
    | { type: 'SET_FIELD'; field: keyof State; value: any }
    | { type: 'SET_BASE_FILE'; file: File | null; maxRank: number }
    | { type: 'SET_ZIP_FILE'; file: File | null }
    | { type: 'RESET' };

const initialState: State = {
    baseFile: null,
    baseFileName: '',
    zipFile: null,
    zipFileName: '',
    prefix: '',
    startNumber: 1,
    minStartNumber: 1,
    preserveTitles: false,
    isLoading: false,
    status: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'SET_BASE_FILE':
            const nextRank = action.maxRank + 1;
            return {
                ...state,
                baseFile: action.file,
                baseFileName: action.file ? action.file.name : '',
                startNumber: nextRank,
                minStartNumber: nextRank,
                status: null,
            };
        case 'SET_ZIP_FILE':
            return {
                ...state,
                zipFile: action.file,
                zipFileName: action.file ? action.file.name : '',
                status: null,
            };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

const AugmentBackupWithZip: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const baseFileInputRef = useRef<HTMLInputElement>(null);
    const zipFileInputRef = useRef<HTMLInputElement>(null);

    const handleBaseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (!file) {
            dispatch({ type: 'SET_BASE_FILE', file: null, maxRank: 0 });
            return;
        }

        try {
            const baseFileText = await file.text();
            const backupData = JSON.parse(baseFileText);
            const currentRevision = backupData?.revisions?.[0];
            if (!currentRevision?.scenes || !currentRevision?.sections) {
                throw new Error('Invalid backup file structure.');
            }
            let maxExistingRank = 0;
            currentRevision.scenes.forEach((s: any) => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            currentRevision.sections.forEach((s: any) => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            dispatch({ type: 'SET_BASE_FILE', file, maxRank: maxExistingRank });
        } catch (err: any) {
            showToast(`Error reading base backup: ${err.message}`, true);
            if (baseFileInputRef.current) baseFileInputRef.current.value = '';
            dispatch({ type: 'SET_BASE_FILE', file: null, maxRank: 0 });
        }
    };

    const handleZipFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        dispatch({ type: 'SET_ZIP_FILE', file });
    };

    const handleAugment = async () => {
        if (!state.baseFile || !state.zipFile) {
            showToast('Please select both a base backup and a ZIP file.', true);
            return;
        }

        dispatch({ type: 'SET_FIELD', field: 'isLoading', value: true });
        dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Augmenting backup...', type: 'info' } });

        try {
            const baseFileText = await state.baseFile.text();
            let backupData;
            try {
                backupData = JSON.parse(baseFileText);
            } catch {
                throw new Error('Base backup file is not valid JSON.');
            }

            const currentRevision = backupData?.revisions?.[0];
            if (!currentRevision?.scenes || !currentRevision?.sections) {
                throw new Error('Base backup file has an invalid or incomplete structure.');
            }

            const zip = await JSZip.loadAsync(state.zipFile);
            const chapterFilePromises: Promise<{ name: string; text: string }>[] = [];
            zip.forEach((_, zipEntry) => {
                if (!zipEntry.dir && zipEntry.name.toLowerCase().endsWith('.txt')) {
                    chapterFilePromises.push(zipEntry.async('string').then(text => ({ name: zipEntry.name, text })));
                }
            });
            let chapterFiles = await Promise.all(chapterFilePromises);
            chapterFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (chapterFiles.length === 0) {
                showToast('No .txt files found in the ZIP archive. No changes made.', false);
                dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Info: No .txt files found in ZIP. Backup not augmented.', type: 'info' }});
                return;
            }

            chapterFiles.forEach((chapterFile, index) => {
                const newRank = state.startNumber + index;
                const sceneCode = `scene${newRank}`;
                const sectionCode = `section${newRank}`;
                const txtFilename = chapterFile.name.replace(/\.txt$/i, '');
                
                let chapterTitle: string;
                if (state.preserveTitles) {
                    chapterTitle = (state.prefix && !txtFilename.toLowerCase().startsWith(state.prefix.toLowerCase()))
                        ? `${state.prefix}${txtFilename}`
                        : txtFilename;
                } else {
                    chapterTitle = state.prefix ? `${state.prefix}${newRank}` : `Chapter ${newRank}`;
                }
                
                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));
                currentRevision.scenes.push({ code: sceneCode, title: chapterTitle, text: sceneText, ranking: newRank, status: '1' });
                currentRevision.sections.push({ code: sectionCode, title: chapterTitle, synopsis: '', ranking: newRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
            });

            const now = Date.now();
            backupData.last_update_date = now;
            backupData.last_backup_date = now;
            currentRevision.date = now;
            
            const totalWordCount = calculateWordCount(currentRevision.scenes);
            currentRevision.book_progresses = currentRevision.book_progresses || [];
            const today = new Date();
            const lastProgress = currentRevision.book_progresses[currentRevision.book_progresses.length - 1];
            if (lastProgress && lastProgress.year === today.getFullYear() && lastProgress.month === today.getMonth() + 1 && lastProgress.day === today.getDate()) {
                lastProgress.word_count = totalWordCount;
            } else {
                currentRevision.book_progresses.push({ year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate(), word_count: totalWordCount });
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = (backupData.title || 'augmented_backup').replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase}.json`;

            triggerDownload(blob, filename, showToast);

            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: `Backup augmented with ${chapterFiles.length} chapter(s). Download started.`, type: 'success' } });
            showToast(`Backup augmented successfully with ${chapterFiles.length} chapters.`);

        } catch (err: any) {
            showToast(`Error: ${err.message}`, true);
            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: `Error: ${err.message}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'isLoading', value: false });
        }
    };
    
    return (
        <div className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in tool-section">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Augment Backup with ZIP</h1>

            <div className="mb-6 max-w-md mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="augmentBaseBackupFile" className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg w-full cursor-pointer">Base Backup File</label>
                        <input type="file" id="augmentBaseBackupFile" className="hidden" accept=".json,.txt,.nov" ref={baseFileInputRef} onChange={handleBaseFileChange} />
                        <div className="mt-2.5 flex items-center justify-center bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md min-h-[40px]">
                            <span className="text-slate-500 dark:text-slate-300 text-sm max-w-[calc(100%-30px)] overflow-hidden text-ellipsis whitespace-nowrap">
                                {state.baseFileName || 'No file selected.'}
                            </span>
                            {state.baseFile && <button onClick={() => { if(baseFileInputRef.current) baseFileInputRef.current.value=''; dispatch({type:'SET_BASE_FILE', file: null, maxRank: 0})}} className="bg-transparent border-none text-slate-500 text-2xl font-bold cursor-pointer ml-2 p-1 leading-none">&times;</button>}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="augmentZipFile" className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg w-full cursor-pointer">ZIP with Chapters</label>
                        <input type="file" id="augmentZipFile" className="hidden" accept=".zip" ref={zipFileInputRef} onChange={handleZipFileChange} />
                        <div className="mt-2.5 flex items-center justify-center bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md min-h-[40px]">
                            <span className="text-slate-500 dark:text-slate-300 text-sm max-w-[calc(100%-30px)] overflow-hidden text-ellipsis whitespace-nowrap">
                                {state.zipFileName || 'No file selected.'}
                            </span>
                            {state.zipFile && <button onClick={() => { if(zipFileInputRef.current) zipFileInputRef.current.value=''; dispatch({type:'SET_ZIP_FILE', file: null})}} className="bg-transparent border-none text-slate-500 text-2xl font-bold cursor-pointer ml-2 p-1 leading-none">&times;</button>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6 max-w-md mx-auto">
                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Chapter Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="augmentPrefix" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Prefix for New Chapters:</label>
                            <input type="text" id="augmentPrefix" placeholder="e.g., New Section - " value={state.prefix} onChange={e => dispatch({type: 'SET_FIELD', field: 'prefix', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white w-full" />
                        </div>
                        <div>
                            <label htmlFor="augmentStartNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Number:</label>
                            <input type="number" id="augmentStartNumber" min={state.minStartNumber} value={state.startNumber} onChange={e => dispatch({type: 'SET_FIELD', field: 'startNumber', value: parseInt(e.target.value, 10) || state.minStartNumber})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white w-full" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <label className="flex items-center gap-2 cursor-pointer text-slate-800 dark:text-slate-200 select-none">
                            <input type="checkbox" checked={state.preserveTitles} onChange={e => dispatch({type: 'SET_FIELD', field: 'preserveTitles', value: e.target.checked})} className="w-4 h-4 align-middle rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600" />
                            Use .txt filenames as titles
                        </label>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button onClick={handleAugment} disabled={!state.baseFile || !state.zipFile || state.isLoading} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg disabled:opacity-60 disabled:cursor-not-allowed">
                    Augment and Download
                </button>
            </div>
            
            {state.isLoading && <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 rounded-full border-t-primary-600 animate-spin my-4 mx-auto" role="status"></div>}
            {state.status && <div className={`rounded-xl p-4 mt-5 text-center text-sm ${state.status.type === 'error' ? 'bg-red-50 dark:bg-red-600/10 border border-red-200 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-600/10 border border-green-200 text-green-700 dark:text-green-400'}`}>{state.status.message}</div>}
        </div>
    );
};

export default AugmentBackupWithZip;
