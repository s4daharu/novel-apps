import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';

// Types
interface Chapter { id: number; title: string; content: string; }
interface CoverFile { name: string; type: string; content: string; }
type View = 'setup' | 'editor';

interface State {
    view: View; fileContent: string; fileName: string; coverFile: CoverFile | null; chapters: Chapter[];
    selectedChapterId: number | null; isDirty: boolean; meta: { title: string; author: string; theme: string };
    cleanupRules: string[]; chapterPattern: string; customRegex: string; encoding: string;
    status: { msg: string; type: 'success' | 'error' | 'info' | '' };
    progress: { pct: number; msg: string; visible: boolean }; findValue: string; replaceValue: string; isLoading: boolean;
}

type Action =
    | { type: 'SET_VIEW'; payload: View } | { type: 'LOAD_STATE'; payload: Partial<State> }
    | { type: 'SET_FILE'; payload: { content: string; name: string } } | { type: 'SET_COVER'; payload: CoverFile | null }
    | { type: 'SET_CHAPTERS'; payload: Chapter[] } | { type: 'UPDATE_CHAPTER_CONTENT'; payload: { id: number; content: string } }
    | { type: 'UPDATE_CHAPTER_TITLE'; payload: { id: number; title: string } } | { type: 'SET_SELECTED_CHAPTER'; payload: number | null }
    | { type: 'SET_DIRTY'; payload: boolean } | { type: 'SET_META'; payload: Partial<State['meta']> }
    | { type: 'SET_FIELD'; payload: { field: keyof State; value: any } } | { type: 'ADD_CLEANUP_RULE' }
    | { type: 'UPDATE_CLEANUP_RULE'; payload: { index: number; value: string } } | { type: 'REMOVE_CLEANUP_RULE'; payload: number }
    | { type: 'SPLIT_CHAPTER'; payload: { index: number; part1: string; newChapter: Chapter } }
    | { type: 'DELETE_CHAPTER'; payload: number } | { type: 'MERGE_CHAPTER_UP'; payload: number }
    | { type: 'REORDER_CHAPTERS'; payload: Chapter[] } | { type: 'RESET_STATE' };

const SESSION_STORAGE_KEY = 'novelSplitterSession';

const getInitialState = (): State => ({
    view: 'setup', fileContent: '', fileName: '', coverFile: null, chapters: [], selectedChapterId: null,
    isDirty: false, meta: { title: '', author: '', theme: 'modern' }, cleanupRules: [''],
    chapterPattern: 'auto', customRegex: '', encoding: 'auto', status: { msg: 'Waiting for a .txt file…', type: 'info' },
    progress: { pct: 0, msg: '', visible: false }, findValue: '', replaceValue: '', isLoading: false,
});

const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case 'SET_VIEW': return { ...state, view: action.payload };
        case 'LOAD_STATE': return { ...getInitialState(), ...action.payload, view: (action.payload.chapters && action.payload.chapters.length > 0) ? 'editor' : 'setup' };
        case 'RESET_STATE': return getInitialState();
        case 'SET_FILE': return { ...state, fileContent: action.payload.content, fileName: action.payload.name, meta: { ...state.meta, title: action.payload.name.replace(/\.txt$/i, '') } };
        case 'SET_COVER': return { ...state, coverFile: action.payload };
        case 'SET_CHAPTERS':
            const chapters = action.payload;
            return { ...state, chapters, selectedChapterId: chapters.length > 0 ? chapters[0].id : null, isDirty: false, view: 'editor' };
        case 'UPDATE_CHAPTER_CONTENT': return { ...state, chapters: state.chapters.map(c => c.id === action.payload.id ? { ...c, content: action.payload.content } : c) };
        case 'UPDATE_CHAPTER_TITLE': return { ...state, chapters: state.chapters.map(c => c.id === action.payload.id ? { ...c, title: action.payload.title } : c) };
        case 'SET_SELECTED_CHAPTER': return { ...state, selectedChapterId: action.payload, isDirty: false };
        case 'SET_DIRTY': return { ...state, isDirty: action.payload };
        case 'SET_META': return { ...state, meta: { ...state.meta, ...action.payload } };
        case 'SET_FIELD': return { ...state, [action.payload.field]: action.payload.value };
        case 'ADD_CLEANUP_RULE': return { ...state, cleanupRules: [...state.cleanupRules, ''] };
        case 'UPDATE_CLEANUP_RULE': const newRules = [...state.cleanupRules]; newRules[action.payload.index] = action.payload.value; return { ...state, cleanupRules: newRules };
        case 'REMOVE_CLEANUP_RULE': return { ...state, cleanupRules: state.cleanupRules.filter((_, i) => i !== action.payload) };
        case 'SPLIT_CHAPTER':
            const chaptersWithSplit = [...state.chapters];
            chaptersWithSplit[action.payload.index] = { ...chaptersWithSplit[action.payload.index], content: action.payload.part1 };
            chaptersWithSplit.splice(action.payload.index + 1, 0, action.payload.newChapter);
            return { ...state, chapters: chaptersWithSplit, isDirty: false };
        case 'DELETE_CHAPTER': const remaining = state.chapters.filter((_, i) => i !== action.payload); return { ...state, chapters: remaining, selectedChapterId: state.selectedChapterId === state.chapters[action.payload]?.id ? null : state.selectedChapterId };
        case 'MERGE_CHAPTER_UP':
            if (action.payload > 0) {
                const merged = [...state.chapters];
                merged[action.payload - 1].content += '\n\n' + merged[action.payload].content;
                const isSelectedMerged = state.selectedChapterId === merged[action.payload].id;
                merged.splice(action.payload, 1);
                return { ...state, chapters: merged, selectedChapterId: isSelectedMerged ? merged[action.payload - 1].id : state.selectedChapterId };
            } return state;
        case 'REORDER_CHAPTERS': return { ...state, chapters: action.payload };
        default: return state;
    }
};

const CHAPTER_TEMPLATES: Record<string, RegExp> = {
    chinese: /^\s*第\s*([0-9]+)\s*章[\.。:\s]?.*$/im,
    chinese_numeral: /^\s*第\s*([一二三四五六七八九十百千零〇]+)\s*章.*$/im,
    chapter: /^\s*Chapter\s*([0-9]+)\b.*$/im,
    ch: /^\s*Ch(?:apter)?\.?\s*([0-9]+)\b.*$/im,
    titledot: /^\s*([^\r\n]{1,120})\.\s*\d+\s*$/uim,
    parenfullwidth: /^\s*（\s*\d+\s*\.?\s*）\s*$/uim
};
const safeFilename = (name: string) => String(name || '').replace(/[\u0000-\u001f]/g, '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 180) || 'untitled';
const escapeHtml = (s: string) => { const d = document.createElement('div'); d.innerText = s; return d.innerHTML; };

const NovelSplitter: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, getInitialState());
    const { showToast } = useAppContext();
    const [showRestoreBanner, setShowRestoreBanner] = useState(false);
    const chapterContentRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const draggedItemId = useRef<number | null>(null);
    const dropIndicator = useRef<'top' | 'bottom' | null>(null);

    // Session Management
    useEffect(() => {
        const savedStateJSON = localStorage.getItem(SESSION_STORAGE_KEY);
        if (savedStateJSON) {
            try {
                const savedState = JSON.parse(savedStateJSON);
                if (savedState.fileName || savedState.chapters?.length > 0) {
                    setShowRestoreBanner(true);
                }
            } catch {
                localStorage.removeItem(SESSION_STORAGE_KEY);
            }
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Failed to save session state:", e);
        }
    }, [state]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (state.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [state.isDirty]);

    const restoreSession = () => {
        const savedStateJSON = localStorage.getItem(SESSION_STORAGE_KEY);
        if (savedStateJSON) {
            try {
                const savedState = JSON.parse(savedStateJSON);
                dispatch({ type: 'LOAD_STATE', payload: savedState });
                showToast('Session restored.');
            } catch (e) {
                showToast('Could not restore session.', true);
                localStorage.removeItem(SESSION_STORAGE_KEY);
            }
        }
        setShowRestoreBanner(false);
    };

    const dismissSession = () => {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        dispatch({ type: 'RESET_STATE' });
        setShowRestoreBanner(false);
    };

    // File Handling
    const handleFileChange = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: true } });
        try {
            const buffer = await file.arrayBuffer();
            const decoder = new TextDecoder(state.encoding === 'auto' ? 'utf-8' : state.encoding, { fatal: state.encoding !== 'auto' });
            let content = '';
            try {
                 content = decoder.decode(buffer);
            } catch {
                // Fallback for auto-detection
                 const gbkDecoder = new TextDecoder('gbk');
                 content = gbkDecoder.decode(buffer);
                 showToast('Auto-detected GBK encoding.');
            }
            dispatch({ type: 'SET_FILE', payload: { content, name: file.name } });
        } catch (err) {
            showToast('Failed to read file.', true);
        } finally {
            dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: false } });
        }
    };

    const handleCoverChange = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file || !file.type.startsWith('image/')) {
            showToast('Please select an image file.', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            dispatch({ type: 'SET_COVER', payload: { name: file.name, type: file.type, content: base64 } });
        };
        reader.readAsDataURL(file);
    };

    // Chapter Processing
    const handleProcess = () => {
        if (!state.fileContent) {
            showToast('Please select a .txt file first.', true);
            return;
        }
        dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: true } });
        setTimeout(() => {
            const chapters = splitChapters(state.fileContent);
            if (chapters) {
                dispatch({ type: 'SET_CHAPTERS', payload: chapters });
            }
            dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: false } });
        }, 50);
    };

    const splitChapters = (text: string): Chapter[] | null => {
        // ... (implementation is complex, will be filled in)
        return [{ id: 0, title: 'Chapter 1', content: '...' }]; // Placeholder
    };
    
    // ... (rest of the component logic)

    return (
        <div id="novelSplitterApp" className="tool-section">
            {showRestoreBanner && (
                 <div className="bg-primary-600 text-white p-2 text-center">
                    <p>You have an unsaved session. 
                        <button onClick={restoreSession} className="bg-white/20 border border-white/50 text-white ml-3 px-2 py-1 rounded">Restore Session</button> or 
                        <button onClick={dismissSession} className="bg-white/20 border border-white/50 text-white ml-3 px-2 py-1 rounded">Dismiss</button>
                    </p>
                </div>
            )}
            {/* The rest of the component's JSX */}
        </div>
    );
};

export default NovelSplitter;
