import React, { useReducer, useRef } from 'react';
import JSZip from 'jszip';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';
import { parseTextToBlocks, calculateWordCount, createNewBackupStructure } from '../utils/backupHelpers';

// State and Reducer
interface State {
    zipFile: File | null;
    fileName: string;
    title: string;
    description: string;
    uniqueCode: string;
    chapterPattern: string;
    startNumber: number;
    extraChapters: number;
    isLoading: boolean;
    status: { message: string; type: 'success' | 'error' | 'info' } | null;
}

type Action = 
    | { type: 'SET_FIELD'; field: keyof State; value: any }
    | { type: 'SET_FILE'; file: File | null }
    | { type: 'RESET' };

const initialState: State = {
    zipFile: null,
    fileName: '',
    title: '',
    description: '',
    uniqueCode: '',
    chapterPattern: 'Chapter ',
    startNumber: 1,
    extraChapters: 0,
    isLoading: false,
    status: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'SET_FILE':
            return { 
                ...state, 
                zipFile: action.file, 
                fileName: action.file ? action.file.name : '',
                status: null 
            };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

const CreateBackupFromZip: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        dispatch({ type: 'SET_FILE', file });
    };

    const handleClearFile = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        dispatch({ type: 'SET_FILE', file: null });
    };
    
    const handleGenerate = async () => {
        if (!state.zipFile) {
            showToast('Please upload a ZIP file.', true);
            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Error: Please upload a ZIP file.', type: 'error' } });
            return;
        }
        if (!state.title.trim()) {
            showToast('Project Title is required.', true);
            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Error: Project Title is required.', type: 'error' } });
            return;
        }

        dispatch({ type: 'SET_FIELD', field: 'isLoading', value: true });
        dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Processing ZIP file...', type: 'info' } });
        
        try {
            const zip = await JSZip.loadAsync(state.zipFile);
            const chapterFilePromises: Promise<{ name: string; text: string }>[] = [];
            zip.forEach((_, zipEntry) => {
                if (!zipEntry.dir && zipEntry.name.toLowerCase().endsWith('.txt')) {
                    chapterFilePromises.push(
                        zipEntry.async('string').then(text => ({ name: zipEntry.name, text }))
                    );
                }
            });
            let chapterFiles = await Promise.all(chapterFilePromises);
            chapterFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            const scenes: any[] = [];
            const sections: any[] = [];
            let currentProcessingIndex = 0;

            for (const chapterFile of chapterFiles) {
                const currentRank = state.startNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const chapterTitle = state.chapterPattern
                    ? `${state.chapterPattern}${currentRank}`
                    : chapterFile.name.replace(/\.txt$/i, '');
                
                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));
                scenes.push({ code: sceneCode, title: chapterTitle, text: sceneText, ranking: currentRank, status: '1' });
                sections.push({ code: sectionCode, title: chapterTitle, synopsis: '', ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
                currentProcessingIndex++;
            }
            
            for (let i = 0; i < state.extraChapters; i++) {
                const currentRank = state.startNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const chapterTitle = state.chapterPattern ? `${state.chapterPattern}${currentRank}` : `Chapter ${currentRank}`;
                const emptySceneContent = JSON.stringify({ blocks: [{ type: 'text', align: 'left', text: '' }] });
                scenes.push({ code: sceneCode, title: chapterTitle, text: emptySceneContent, ranking: currentRank, status: '1' });
                sections.push({ code: sectionCode, title: chapterTitle, synopsis: '', ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
                currentProcessingIndex++;
            }

            if (scenes.length === 0) {
                throw new Error('No .txt files found in ZIP and no extra chapters requested. Backup not created.');
            }

            const backupData = createNewBackupStructure(state.title, state.description, state.uniqueCode);
            backupData.revisions[0].scenes = scenes;
            backupData.revisions[0].sections = sections;
            backupData.revisions[0].book_progresses[0].word_count = calculateWordCount(scenes);

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = state.title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'backup_from_zip'}.json`;

            triggerDownload(blob, filename, showToast);

            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: `Backup file created with ${scenes.length} chapter(s). Download started.`, type: 'success' } });
            showToast(`Backup file created with ${scenes.length} chapter(s).`);

        } catch (err: any) {
            showToast(`Error: ${err.message}`, true);
            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: `Error: ${err.message}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'isLoading', value: false });
        }
    };

    return (
        <div className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in tool-section">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Create Backup from ZIP</h1>

            <div className="max-w-md mx-auto mb-6">
                <label htmlFor="zipBackupFile" className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 w-full cursor-pointer">
                    Upload ZIP File
                </label>
                <input type="file" id="zipBackupFile" className="hidden" accept=".zip" ref={fileInputRef} onChange={handleFileChange} />
                <div className="mt-2.5 flex items-center justify-center bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md min-h-[40px]">
                    <span className="text-slate-500 dark:text-slate-300 max-w-[calc(100%-30px)] overflow-hidden text-ellipsis whitespace-nowrap inline-block">
                        {state.fileName || 'No file selected.'}
                    </span>
                    {state.zipFile && (
                        <button type="button" onClick={handleClearFile} className="bg-transparent border-none text-slate-500 text-2xl font-bold cursor-pointer ml-2 p-1 leading-none transition-colors hover:text-slate-800 dark:hover:text-white" aria-label="Clear ZIP file">&times;</button>
                    )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload a ZIP file containing .txt chapter files</p>
            </div>

            <div className="space-y-6 max-w-md mx-auto">
                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Project Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="zipProjectTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Project Title:</label>
                            <input type="text" id="zipProjectTitle" placeholder="Enter project title" value={state.title} onChange={e => dispatch({type: 'SET_FIELD', field: 'title', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                        <div>
                            <label htmlFor="zipUniqueCode" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Unique Code (Optional):</label>
                            <input type="text" id="zipUniqueCode" placeholder="Auto-generated if blank" value={state.uniqueCode} onChange={e => dispatch({type: 'SET_FIELD', field: 'uniqueCode', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <label htmlFor="zipDescription" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description:</label>
                        <textarea id="zipDescription" placeholder="Enter project description" rows={3} value={state.description} onChange={e => dispatch({type: 'SET_FIELD', field: 'description', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full min-h-[80px]"></textarea>
                    </div>
                </div>

                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Chapter Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="zipChapterPattern" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chapter Pattern:</label>
                            <input type="text" id="zipChapterPattern" placeholder="e.g., Chapter " value={state.chapterPattern} onChange={e => dispatch({type: 'SET_FIELD', field: 'chapterPattern', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                        <div>
                            <label htmlFor="zipStartNumber" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Number:</label>
                            <input type="number" id="zipStartNumber" min="1" value={state.startNumber} onChange={e => dispatch({type: 'SET_FIELD', field: 'startNumber', value: parseInt(e.target.value,10) || 1})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <label htmlFor="zipExtraChapters" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Extra Empty Chapters:</label>
                        <input type="number" id="zipExtraChapters" min="0" value={state.extraChapters} onChange={e => dispatch({type: 'SET_FIELD', field: 'extraChapters', value: parseInt(e.target.value,10) || 0})} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-center">
                <button onClick={handleGenerate} disabled={!state.zipFile || state.isLoading} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 disabled:opacity-60 disabled:cursor-not-allowed">
                    Generate Backup and Download
                </button>
            </div>

            {state.isLoading && (
                <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 rounded-full border-t-primary-600 animate-spin my-4 mx-auto" role="status" aria-live="polite" aria-label="Loading"></div>
            )}
            {state.status && (
                <div className={`rounded-xl p-4 mt-5 text-center text-sm
                    ${state.status.type === 'success' ? 'bg-green-50 dark:bg-green-600/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400' : ''}
                    ${state.status.type === 'error' ? 'bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400' : ''}
                    ${state.status.type === 'info' ? 'bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300' : ''}
                `} aria-live="polite">
                    {state.status.message}
                </div>
            )}
        </div>
    );
};

export default CreateBackupFromZip;
