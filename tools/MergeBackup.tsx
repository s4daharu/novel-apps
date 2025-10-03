import React, { useReducer, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';
import { calculateWordCount } from '../utils/backupHelpers';

// Types
interface BackupFileItem {
    id: string;
    file: File;
    title: string;
    cover: string | null;
    data: any;
}

interface State {
    files: BackupFileItem[];
    selectedCoverData: string | null;
    mergedTitle: string;
    mergedDesc: string;
    chapterPrefix: string;
    preserveTitles: boolean;
    isLoading: boolean;
    status: { message: string; type: 'success' | 'error' | 'info' } | null;
}

type Action =
    | { type: 'SET_FILES'; payload: BackupFileItem[] }
    | { type: 'REORDER_FILES'; payload: BackupFileItem[] }
    | { type: 'SET_FIELD'; field: keyof State; value: any }
    | { type: 'RESET' };

// Initial State & Reducer
const initialState: State = {
    files: [],
    selectedCoverData: null,
    mergedTitle: '',
    mergedDesc: '',
    chapterPrefix: '',
    preserveTitles: false,
    isLoading: false,
    status: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_FILES':
            const firstCover = action.payload.find(f => f.cover)?.cover || null;
            return { ...initialState, files: action.payload, selectedCoverData: firstCover };
        case 'REORDER_FILES':
            return { ...state, files: action.payload };
        case 'SET_FIELD':
            return { ...state, [action.field]: action.value };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

const MergeBackup: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const draggedItemId = useRef<string | null>(null);

    const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        dispatch({ type: 'SET_FIELD', field: 'isLoading', value: true });
        dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Reading files...', type: 'info' } });

        // FIX: Explicitly type the 'file' parameter to resolve TypeScript inference errors.
        const filePromises = Array.from(files).map(async (file: File, index) => {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                return {
                    id: `backup-${Date.now()}-${index}`,
                    file: file,
                    title: data.title || file.name,
                    cover: data.cover || null,
                    data: data
                };
            } catch (err) {
                showToast(`Could not parse ${file.name}. It may not be a valid backup file.`, true);
                return null;
            }
        });

        const selectedFiles = (await Promise.all(filePromises)).filter(Boolean) as BackupFileItem[];
        dispatch({ type: 'SET_FILES', payload: selectedFiles });
        dispatch({ type: 'SET_FIELD', field: 'isLoading', value: false });
        dispatch({ type: 'SET_FIELD', field: 'status', value: null });
    };

    const handleMerge = async () => {
        if (state.files.length === 0) {
            showToast('Select at least one backup file.', true);
            return;
        }
        if (!state.mergedTitle) {
            showToast('Merged Project Title is required.', true);
            return;
        }

        dispatch({ type: 'SET_FIELD', field: 'isLoading', value: true });

        try {
            let combinedScenes: any[] = [];
            let combinedSections: any[] = [];
            const allStatuses = new Map();

            state.files.forEach(item => {
                const rev = item.data.revisions?.[0];
                if (rev) {
                    if (rev.scenes) {
                        rev.scenes.forEach((s: any) => s.originalTitle = s.title);
                        combinedScenes.push(...rev.scenes);
                    }
                    if (rev.sections) {
                        rev.sections.forEach((s: any) => s.originalTitle = s.title);
                        combinedSections.push(...rev.sections);
                    }
                    rev.statuses?.forEach((status: any) => {
                        if (!allStatuses.has(status.code)) allStatuses.set(status.code, status);
                    });
                }
            });

            const finalStatuses = Array.from(allStatuses.values()).sort((a,b) => (a.ranking || Infinity) - (b.ranking || Infinity)).map((s,i) => ({...s, ranking: i+1}));
            if (finalStatuses.length === 0) finalStatuses.push({ code: '1', title: 'Todo', color: -2697255, ranking: 1 });

            combinedScenes.forEach((s, i) => {
                const n = i + 1;
                s.code = `scene${n}`;
                s.title = (state.preserveTitles && s.originalTitle) ? (state.chapterPrefix ? `${state.chapterPrefix}${s.originalTitle}`: s.originalTitle) : (state.chapterPrefix ? `${state.chapterPrefix}${n}` : `Chapter ${n}`);
                s.ranking = n;
                delete s.originalTitle;
            });
            combinedSections.forEach((s, i) => {
                const n = i + 1;
                s.code = `section${n}`;
                s.title = (state.preserveTitles && s.originalTitle) ? (state.chapterPrefix ? `${state.chapterPrefix}${s.originalTitle}`: s.originalTitle) : (state.chapterPrefix ? `${state.chapterPrefix}${n}` : `Chapter ${n}`);
                s.ranking = n;
                s.section_scenes = [{ code: `scene${n}`, ranking: 1 }];
                delete s.originalTitle;
            });

            const now = Date.now();
            const mergedData = {
                version: 4,
                code: Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'),
                title: state.mergedTitle,
                description: state.mergedDesc,
                cover: state.selectedCoverData,
                last_update_date: now,
                last_backup_date: now,
                revisions: [{
                    number: 1,
                    date: now,
                    book_progresses: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate(), word_count: calculateWordCount(combinedScenes) }],
                    statuses: finalStatuses,
                    scenes: combinedScenes,
                    sections: combinedSections,
                }]
            };

            const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
            const filenameBase = state.mergedTitle.replace(/[^a-z0-9_\\-\\s]/gi, '_').replace(/\\s+/g, '_') || 'merged_backup';
            triggerDownload(blob, `${filenameBase}.json`, showToast);
            dispatch({ type: 'SET_FIELD', field: 'status', value: { message: 'Backup files merged successfully.', type: 'success' } });

        } catch (err: any) {
            showToast(err.message || 'Error merging backup files.', true);
        } finally {
            dispatch({ type: 'SET_FIELD', field: 'isLoading', value: false });
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent<HTMLLIElement>) => {
        draggedItemId.current = e.currentTarget.dataset.id || null;
        e.currentTarget.classList.add('opacity-50');
    };
    const handleDragEnd = (e: React.DragEvent<HTMLLIElement>) => {
        e.currentTarget.classList.remove('opacity-50');
        draggedItemId.current = null;
    };
    const handleDrop = (e: React.DragEvent<HTMLLIElement>) => {
        e.preventDefault();
        const targetLi = e.currentTarget;
        if (!draggedItemId.current || targetLi.dataset.id === draggedItemId.current) return;
        
        const fromIndex = state.files.findIndex(item => item.id === draggedItemId.current);
        const toIndex = state.files.findIndex(item => item.id === targetLi.dataset.id);

        const newFiles = [...state.files];
        const [movedItem] = newFiles.splice(fromIndex, 1);
        newFiles.splice(toIndex, 0, movedItem);
        
        dispatch({ type: 'REORDER_FILES', payload: newFiles });
    };
    
    const covers = state.files.filter(item => item.cover);

    return (
        <div className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in tool-section">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Merge Backup Files</h1>
            <div className="max-w-md mx-auto mb-6">
                <label htmlFor="merge-files-input" className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg w-full cursor-pointer">Upload Backup Files</label>
                <input type="file" id="merge-files-input" ref={fileInputRef} onChange={handleFileSelection} multiple accept=".json,.nov" className="hidden"/>
                <div className="mt-2.5 flex items-center justify-between">
                    <p className="text-sm">Files to merge (drag to reorder):</p>
                    {state.files.length > 0 && <button onClick={() => {if (fileInputRef.current) fileInputRef.current.value = ""; dispatch({type: 'RESET'})}} className="text-sm text-red-500">Clear All</button>}
                </div>
                <ul className="list-none p-0 my-2 border rounded-lg bg-slate-100 dark:bg-slate-800 max-h-48 overflow-y-auto">
                    {state.files.length === 0 ? <li className="p-3 text-center text-sm text-slate-500">No files selected.</li> :
                     state.files.map(item => (
                        <li key={item.id} data-id={item.id} draggable
                            onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={e => e.preventDefault()} onDrop={handleDrop}
                            className="flex items-center p-2.5 border-b dark:border-slate-700 cursor-grab">
                            <span className="text-sm">{item.title}</span>
                        </li>
                     ))
                    }
                </ul>
            </div>
            {covers.length > 0 && (
                <div className="max-w-2xl mx-auto mb-6">
                    <h3 className="text-lg font-semibold mb-3 text-center">Select a Cover</h3>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 p-3 bg-slate-100 dark:bg-slate-700/30 rounded-lg">
                        <div onClick={() => dispatch({type: 'SET_FIELD', field: 'selectedCoverData', value: null})} className={`w-full aspect-[2/3] bg-slate-200 dark:bg-slate-800 rounded-md flex items-center justify-center text-xs cursor-pointer ${!state.selectedCoverData ? 'ring-4 ring-primary-500' : ''}`}>No Cover</div>
                        {covers.map(item => (
                            <div key={item.id} onClick={() => dispatch({type: 'SET_FIELD', field: 'selectedCoverData', value: item.cover})}
                                 style={{backgroundImage: `url(data:image/jpeg;base64,${item.cover})`}}
                                 className={`w-full aspect-[2/3] bg-cover bg-center rounded-md cursor-pointer ${state.selectedCoverData === item.cover ? 'ring-4 ring-primary-500' : ''}`}
                            ></div>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-6 max-w-md mx-auto">
                <input type="text" placeholder="Merged Project Title" value={state.mergedTitle} onChange={e => dispatch({type: 'SET_FIELD', field: 'mergedTitle', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 rounded-lg px-3 py-2 w-full" />
                <textarea placeholder="Merged Description" value={state.mergedDesc} onChange={e => dispatch({type: 'SET_FIELD', field: 'mergedDesc', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 rounded-lg px-3 py-2 w-full min-h-[80px]"></textarea>
                <input type="text" placeholder="Prefix for Chapters (Optional)" value={state.chapterPrefix} onChange={e => dispatch({type: 'SET_FIELD', field: 'chapterPrefix', value: e.target.value})} className="bg-slate-100 dark:bg-slate-700 border-2 rounded-lg px-3 py-2 w-full" />
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.preserveTitles} onChange={e => dispatch({type: 'SET_FIELD', field: 'preserveTitles', value: e.target.checked})} />
                    Preserve Original Chapter Titles
                </label>
            </div>
            <div className="mt-8 flex justify-center">
                <button onClick={handleMerge} disabled={state.files.length === 0 || state.isLoading} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg disabled:opacity-60">
                    Merge and Download
                </button>
            </div>
            {state.isLoading && <div className="w-10 h-10 border-4 rounded-full border-t-primary-600 animate-spin my-4 mx-auto"></div>}
            {state.status && <div className={`rounded-xl p-4 mt-5 text-center text-sm ${state.status.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{state.status.message}</div>}
        </div>
    );
};

export default MergeBackup;
