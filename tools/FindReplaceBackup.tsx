import React, { useReducer, useRef, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';

// Types
interface Match {
    sceneCode: string;
    sceneTitle: string;
    index: number;
    length: number;
    text: string;
}

interface State {
    fileData: any | null;
    fileName: string;
    matches: Match[];
    currentIndex: number;
    findPattern: string;
    replaceWith: string;
    options: { isRegex: boolean; isCaseSensitive: boolean; isWholeWord: boolean; };
    isReviewing: boolean;
    reviewSelections: boolean[];
    isLoading: boolean;
    modificationsMade: boolean;
}

type Action =
    | { type: 'SET_FILE'; payload: { data: any; name: string } }
    | { type: 'SET_SEARCH_RESULTS'; payload: { matches: Match[], currentIndex: number } }
    | { type: 'SET_FIELD'; payload: Partial<State> }
    | { type: 'NAVIGATE'; payload: number }
    | { type: 'START_REVIEW' }
    | { type: 'END_REVIEW' }
    | { type: 'TOGGLE_REVIEW_ITEM'; payload: number }
    | { type: 'TOGGLE_ALL_REVIEW_ITEMS'; payload: boolean }
    | { type: 'APPLY_REPLACEMENTS'; payload: { newData: any; } }
    | { type: 'RESET' };

const initialState: State = {
    fileData: null, fileName: '', matches: [], currentIndex: -1, findPattern: '', replaceWith: '',
    options: { isRegex: false, isCaseSensitive: false, isWholeWord: false },
    isReviewing: false, reviewSelections: [], isLoading: false, modificationsMade: false,
};

// Reducer
function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_FILE':
            return { ...initialState, fileData: action.payload.data, fileName: action.payload.name };
        case 'SET_SEARCH_RESULTS':
            return { ...state, matches: action.payload.matches, currentIndex: action.payload.currentIndex };
        case 'SET_FIELD':
            return { ...state, ...action.payload };
        case 'NAVIGATE':
            const newIndex = state.currentIndex + action.payload;
            return (newIndex >= 0 && newIndex < state.matches.length) ? { ...state, currentIndex: newIndex } : state;
        case 'START_REVIEW':
            return { ...state, isReviewing: true, reviewSelections: Array(state.matches.length).fill(true) };
        case 'END_REVIEW':
            return { ...state, isReviewing: false };
        case 'TOGGLE_REVIEW_ITEM':
            const newSelections = [...state.reviewSelections];
            newSelections[action.payload] = !newSelections[action.payload];
            return { ...state, reviewSelections: newSelections };
        case 'TOGGLE_ALL_REVIEW_ITEMS':
            return { ...state, reviewSelections: Array(state.matches.length).fill(action.payload) };
        case 'APPLY_REPLACEMENTS':
            return { ...state, fileData: action.payload.newData, isReviewing: false, modificationsMade: true };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

// Helpers
const getScenePlainText = (scene: any): string => {
    try {
        const content = JSON.parse(scene.text);
        return content.blocks.map((b: any) => b.text || '').join('\n');
    } catch { return ''; }
};
const escapeHtml = (unsafe: string) => unsafe.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[match]);

const FindReplaceBackup: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const performSearch = () => {
        if (!state.findPattern || !state.fileData) {
            dispatch({ type: 'SET_SEARCH_RESULTS', payload: { matches: [], currentIndex: -1 } });
            return;
        }
        let regex;
        try {
            const { isRegex, isCaseSensitive, isWholeWord } = state.options;
            const flags = isCaseSensitive ? 'g' : 'gi';
            let finalPattern = isRegex ? state.findPattern : state.findPattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            if (isWholeWord) finalPattern = `\\b${finalPattern}\\b`;
            regex = new RegExp(finalPattern, flags);
        } catch (e) { showToast('Invalid Regular Expression.', true); return; }

        const allMatches: Match[] = [];
        state.fileData.revisions[0].scenes.forEach((scene: any) => {
            const plainText = getScenePlainText(scene); let match;
            while ((match = regex.exec(plainText)) !== null) {
                allMatches.push({ sceneCode: scene.code, sceneTitle: scene.title, index: match.index, length: match[0].length, text: match[0] });
            }
        });
        dispatch({ type: 'SET_SEARCH_RESULTS', payload: { matches: allMatches, currentIndex: allMatches.length > 0 ? 0 : -1 } });
    };

    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            performSearch();
        }, 300);
        return () => clearTimeout(debounceTimer);
    }, [state.findPattern, state.options, state.fileData]);

    const handleFileLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        dispatch({ type: 'SET_FIELD', payload: { isLoading: true } });
        try {
            const fileText = await file.text(); const data = JSON.parse(fileText);
            if (!data.revisions?.[0]?.scenes) throw new Error('Invalid backup file structure.');
            dispatch({ type: 'SET_FILE', payload: { data, name: file.name } });
        } catch (err: any) { showToast(`Error: ${err.message}`, true); }
        finally { dispatch({ type: 'SET_FIELD', payload: { isLoading: false } }); }
    };
    
    const handleConfirmReplaceAll = () => {
        const newFileData = JSON.parse(JSON.stringify(state.fileData));
        const matchesByScene: Record<string, Match[]> = {};
        const selectedCount = state.reviewSelections.filter(Boolean).length;

        state.matches.forEach((match, index) => {
            if (state.reviewSelections[index]) {
                if (!matchesByScene[match.sceneCode]) matchesByScene[match.sceneCode] = [];
                matchesByScene[match.sceneCode].push(match);
            }
        });

        Object.keys(matchesByScene).forEach(sceneCode => {
            const scene = newFileData.revisions[0].scenes.find((s: any) => s.code === sceneCode); if (!scene) return;
            let plainText = getScenePlainText(scene);
            matchesByScene[sceneCode].sort((a, b) => b.index - a.index).forEach(match => {
                plainText = plainText.substring(0, match.index) + state.replaceWith + plainText.substring(match.index + match.length);
            });
            scene.text = JSON.stringify({ blocks: plainText.split('\n').map(line => ({ type: 'text', align: 'left', text: line })) });
        });
        
        dispatch({ type: 'APPLY_REPLACEMENTS', payload: { newData: newFileData } });
        showToast(`${selectedCount} replacements made.`);
        performSearch(); // Re-run search
    };


    const handleDownload = () => {
        if (!state.fileData) return;
        const blob = new Blob([JSON.stringify(state.fileData, null, 2)], { type: 'application/json' });
        triggerDownload(blob, state.fileName, showToast);
    };
    
    // ... Render logic
    if (!state.fileData) {
         return (
            <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/50 z-20 flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl md:text-3xl font-bold mb-5 text-center">Find & Replace in Backup</h1>
                <div className="max-w-md mx-auto">
                    <label htmlFor="frBackupFile" className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg cursor-pointer">Upload Backup File</label>
                    <input type="file" id="frBackupFile" ref={fileInputRef} onChange={handleFileLoad} accept=".json,.txt,.nov" className="hidden" />
                </div>
            </div>
        );
    }
    
    const currentMatch = state.matches[state.currentIndex];

    return (
        <div className="flex flex-col h-[calc(100vh-56px-env(safe-area-inset-top))] md:h-[calc(100vh-72px-env(safe-area-inset-top))] bg-slate-200 dark:bg-slate-900/80">
             <header className="flex-shrink-0 flex items-center justify-between p-2 bg-white dark:bg-slate-800 border-b dark:border-slate-700">
                <h2 className="text-sm font-medium truncate px-2">{state.fileName}</h2>
                <button onClick={() => { if(fileInputRef.current) fileInputRef.current.value = ""; dispatch({type:'RESET'})}} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Close</button>
            </header>
            {/* ... other JSX ... */}
        </div>
    );
};

export default FindReplaceBackup;
