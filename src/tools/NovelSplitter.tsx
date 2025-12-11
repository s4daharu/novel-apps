import React, { useState, useEffect, useRef, useMemo, useReducer, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload, getJSZip, escapeHTML } from '../utils/helpers';
import { generateEpubBlob } from '../utils/epubGenerator';
import { FileInput } from '../components/FileInput';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Label } from '../components/ui/Label';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import {
    ChevronLeft, ChevronRight, Menu, Settings, Save, Upload, FileText,
    Download, RefreshCw, Trash2, Plus, GripVertical, CheckSquare, Square,
    Search, FolderOpen, Book, Type, Image as ImageIcon, MoreVertical,
    ChevronUp, ChevronDown, FolderArchive
} from 'lucide-react';

// Types
type Chapter = { id: string; title: string; content: string; };
type Meta = { title: string; author: string; coverFile: File | null; coverURL: string | null; language: string; };
type CleanupRule = { id: number; find: string; replace: string; };
type Template = { id: number; name: string; splitRegex: string; cleanupRules: CleanupRule[] };
type GlobalMatch = {
    chapterId: string;
    chapterTitle: string;
    index: number;
    length: number;
    text: string;
};
type State = {
    step: 'upload' | 'config' | 'editor';
    rawText: string | null;
    fileName: string;
    encoding: string;
    splitRegex: string;
    matchedHeadings: string[];
    cleanupRules: CleanupRule[];
    chapters: Chapter[];
    selectedChapterId: string | null;
    meta: Meta;
    showFindReplace: boolean;
    findQuery: string;
    replaceQuery: string;
    isChapterNavOpen: boolean;
    reorderModeActive: boolean;
    selectedChapterIds: Set<string>;
    // New state for global find/replace
    showGlobalFindReplace: boolean;
    globalFindQuery: string;
    globalReplaceQuery: string;
    globalFindOptions: {
        useRegex: boolean;
        caseSensitive: boolean;
        wholeWord: boolean;
    };
    globalMatches: GlobalMatch[];
    currentGlobalMatchIndex: number;
};
type Action =
    | { type: 'SET_STATE'; payload: Partial<State> }
    | { type: 'SET_RAW_TEXT'; payload: { text: string | null; fileName: string; title: string } }
    | { type: 'UPDATE_RULE'; payload: { id: number; find?: string; replace?: string } }
    | { type: 'ADD_RULE' }
    | { type: 'DELETE_RULE'; payload: number }
    | { type: 'SET_CHAPTERS'; payload: Chapter[] }
    | { type: 'UPDATE_CHAPTER'; payload: { id: string; title?: string; content?: string } }
    | { type: 'UPDATE_CHAPTERS'; payload: Chapter[] }
    | { type: 'REORDER_CHAPTERS', payload: Chapter[] }
    | { type: 'SET_META'; payload: Partial<Meta> }
    | { type: 'MERGE_CHAPTER_WITH_NEXT' }
    | { type: 'SPLIT_CHAPTER'; payload: { cursorPosition: number } }
    | { type: 'TOGGLE_REORDER_MODE' }
    | { type: 'MULTI_SELECT_CHAPTER'; payload: { id: string; checked: boolean } }
    | { type: 'SET_SELECTION'; payload: Set<string> }
    | { type: 'ADD_NEW_CHAPTER' }
    | { type: 'MERGE_SELECTED_CHAPTERS' }
    | { type: 'BATCH_RENAME'; payload: { pattern: string; startNumber: number } };

const initialState: State = {
    step: 'upload',
    rawText: null,
    fileName: '',
    encoding: 'utf-8',
    splitRegex: '^\\s*第?\\s*[〇一二三四五六七八九十百千万零\\d]+\\s*[章章节回部卷].*',
    matchedHeadings: [],
    cleanupRules: [{ id: 1, find: '', replace: '' }],
    chapters: [],
    selectedChapterId: null,
    meta: { title: '', author: '', coverFile: null, coverURL: null, language: 'en' },
    showFindReplace: false,
    findQuery: '',
    replaceQuery: '',
    isChapterNavOpen: false,
    reorderModeActive: false,
    selectedChapterIds: new Set(),
    showGlobalFindReplace: false,
    globalFindQuery: '',
    globalReplaceQuery: '',
    globalFindOptions: { useRegex: false, caseSensitive: false, wholeWord: false },
    globalMatches: [],
    currentGlobalMatchIndex: -1,
};

const reducer = (state: State, action: Action): State => {
    switch (action.type) {
        case 'SET_STATE':
            return { ...state, ...action.payload };
        case 'SET_RAW_TEXT':
            return { ...state, rawText: action.payload.text, fileName: action.payload.fileName, step: 'config', meta: { ...state.meta, title: action.payload.title } };
        case 'UPDATE_RULE':
            return { ...state, cleanupRules: state.cleanupRules.map(r => r.id === action.payload.id ? { ...r, ...action.payload } : r) };
        case 'ADD_RULE':
            return { ...state, cleanupRules: [...state.cleanupRules, { id: Date.now(), find: '', replace: '' }] };
        case 'DELETE_RULE':
            return { ...state, cleanupRules: state.cleanupRules.filter(r => r.id !== action.payload) };
        case 'SET_CHAPTERS':
            return { ...state, chapters: action.payload, selectedChapterId: action.payload[0]?.id || null, step: 'editor' };
        case 'UPDATE_CHAPTER': {
            const { id, title, content } = action.payload;
            return { ...state, chapters: state.chapters.map(c => c.id === id ? { ...c, title: title ?? c.title, content: content ?? c.content } : c) };
        }
        case 'UPDATE_CHAPTERS':
            return { ...state, chapters: action.payload };
        case 'REORDER_CHAPTERS':
            return { ...state, chapters: action.payload };
        case 'SET_META':
            return { ...state, meta: { ...state.meta, ...action.payload } };
        case 'MERGE_CHAPTER_WITH_NEXT': {
            const currentIndex = state.chapters.findIndex(c => c.id === state.selectedChapterId);
            if (currentIndex === -1 || currentIndex >= state.chapters.length - 1) return state;

            const currentChapter = state.chapters[currentIndex];
            const nextChapter = state.chapters[currentIndex + 1];
            const mergedContent = `${currentChapter.content}\n\n${nextChapter.title}\n\n${nextChapter.content}`;

            const newChapters = [...state.chapters];
            newChapters[currentIndex] = { ...currentChapter, content: mergedContent };
            newChapters.splice(currentIndex + 1, 1);
            return { ...state, chapters: newChapters };
        }
        case 'SPLIT_CHAPTER': {
            const { cursorPosition } = action.payload;
            const currentIndex = state.chapters.findIndex(c => c.id === state.selectedChapterId);
            if (currentIndex === -1) return state;

            const currentChapter = state.chapters[currentIndex];
            const content1 = currentChapter.content.substring(0, cursorPosition).trim();
            const content2 = currentChapter.content.substring(cursorPosition).trim();

            if (!content1 || !content2) return state;

            const newChapter: Chapter = { id: `chap-${Date.now()}`, title: `${currentChapter.title} (Split)`, content: content2 };
            const newChapters = [...state.chapters];
            newChapters[currentIndex] = { ...currentChapter, content: content1 };
            newChapters.splice(currentIndex + 1, 0, newChapter);

            return { ...state, chapters: newChapters, selectedChapterId: newChapter.id };
        }
        case 'TOGGLE_REORDER_MODE':
            return { ...state, reorderModeActive: !state.reorderModeActive, selectedChapterIds: new Set() };
        case 'MULTI_SELECT_CHAPTER': {
            const newSelection = new Set(state.selectedChapterIds);
            action.payload.checked ? newSelection.add(action.payload.id) : newSelection.delete(action.payload.id);
            return { ...state, selectedChapterIds: newSelection };
        }
        case 'SET_SELECTION':
            return { ...state, selectedChapterIds: action.payload };
        case 'ADD_NEW_CHAPTER': {
            const newChapter: Chapter = { id: `chap-${Date.now()}`, title: "New Chapter", content: "" };
            const currentIndex = state.chapters.findIndex(c => c.id === state.selectedChapterId);
            const newChapters = [...state.chapters];
            newChapters.splice(currentIndex !== -1 ? currentIndex + 1 : state.chapters.length, 0, newChapter);
            return { ...state, chapters: newChapters, selectedChapterId: newChapter.id, isChapterNavOpen: true };
        }
        case 'MERGE_SELECTED_CHAPTERS': {
            if (state.selectedChapterIds.size < 2) return state;
            const orderedSelected = state.chapters.filter(c => state.selectedChapterIds.has(c.id));
            if (orderedSelected.length === 0) return state;

            const first = orderedSelected[0];
            const mergedContent = orderedSelected.map(c => `${c.title}\n\n${c.content}`).join('\n\n\n');
            const updatedFirst = { ...first, content: mergedContent };

            const newChapters = state.chapters
                .map(c => c.id === first.id ? updatedFirst : c)
                .filter(c => c.id === first.id || !state.selectedChapterIds.has(c.id));

            return { ...state, chapters: newChapters, selectedChapterIds: new Set(), selectedChapterId: first.id };
        }
        case 'BATCH_RENAME': {
            const { pattern, startNumber } = action.payload;
            let counter = startNumber;
            const orderedSelectedIds = state.chapters.filter(c => state.selectedChapterIds.has(c.id)).map(c => c.id);

            const newChapters = state.chapters.map(c => {
                if (orderedSelectedIds.includes(c.id)) {
                    return { ...c, title: pattern.replace('{n}', String(counter++)) };
                }
                return c;
            });
            return { ...state, chapters: newChapters, selectedChapterIds: new Set() };
        }
        default:
            return state;
    }
};

const TEMPLATES_KEY = 'novelSplitterTemplates';
const SESSION_KEY = 'novelSplitterSession';

const DEFAULT_TEMPLATES: Template[] = [
    {
        id: 1,
        name: 'Chinese Chapters (通用)',
        splitRegex: '^\\s*第?\\s*[〇一二三四五六七八九十百千万零\\d]+\\s*[章章节回部卷].*',
        cleanupRules: [{ id: 1, find: '', replace: '' }],
    },
    {
        id: 2,
        name: 'Chinese Chapters 2 (备用)',
        splitRegex: '^[\\u3000\\s]*第[〇零一二三四五六七八九十百千万\\d]+(?:章|节|回|部|卷)[\\u3000\\s]*.*',
        cleanupRules: [{ id: 1, find: '', replace: '' }],
    }
];

export const NovelSplitter: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [state, dispatch] = useReducer(reducer, initialState);
    const { step, rawText, fileName, encoding, splitRegex, matchedHeadings, cleanupRules, chapters, selectedChapterId, meta, showFindReplace, findQuery, replaceQuery, isChapterNavOpen, reorderModeActive, selectedChapterIds, showGlobalFindReplace, globalFindQuery, globalReplaceQuery, globalFindOptions, globalMatches, currentGlobalMatchIndex } = state;

    const [isCleanupOpen, setCleanupOpen] = useState(false);
    const [isSplitPreviewOpen, setSplitPreviewOpen] = useState(false);
    const [isBatchRenameModalOpen, setBatchRenameModalOpen] = useState(false);
    const [isReviewModalOpen, setReviewModalOpen] = useState(false);
    const [isBookDetailsModalOpen, setBookDetailsModalOpen] = useState(false);
    const [isExportModalOpen, setExportModalOpen] = useState(false);
    const [isChapterActionsOpen, setChapterActionsOpen] = useState(false);
    const [reviewSelection, setReviewSelection] = useState<Set<number>>(new Set());
    const [renamePattern, setRenamePattern] = useState('Chapter {n}');
    const [renameStartNum, setRenameStartNum] = useState(1);
    const [templates, setTemplates] = useState<Template[]>([]);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const draggedItem = useRef<Chapter | null>(null);
    const [dragIndicator, setDragIndicator] = useState<{ id: string, position: 'top' | 'bottom' } | null>(null);

    const sessionDataToSave = useMemo(() => {
        if (step !== 'editor') return null;
        const { coverFile, ...metaToSave } = meta;
        const sessionData = { ...state, meta: metaToSave, selectedChapterIds: [] }; // Don't save selection set
        if (sessionData.chapters.length > 0) sessionData.rawText = null;
        return JSON.stringify(sessionData);
    }, [state, step, meta]);

    useEffect(() => {
        const handler = setTimeout(() => { sessionDataToSave && localStorage.setItem(SESSION_KEY, sessionDataToSave); }, 1000);
        return () => clearTimeout(handler);
    }, [sessionDataToSave]);

    const restoreSession = useCallback(() => {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
            const sessionData = JSON.parse(savedSession);
            dispatch({ type: 'SET_STATE', payload: { ...sessionData, meta: { ...sessionData.meta, coverFile: null }, selectedChapterIds: new Set() } });
            showToast('Previous session restored.');
        } else {
            showToast('No session found to restore.', true);
        }
    }, [showToast]);

    useEffect(() => {
        const savedTemplates = localStorage.getItem(TEMPLATES_KEY);
        try {
            const parsed = JSON.parse(savedTemplates || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) {
                setTemplates(parsed);
            } else {
                setTemplates(DEFAULT_TEMPLATES);
            }
        } catch {
            setTemplates(DEFAULT_TEMPLATES);
        }
    }, []);

    const handleNovelFile = async (file: File) => {
        showSpinner();
        try {
            const buffer = await file.arrayBuffer();
            const text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
            dispatch({ type: 'SET_RAW_TEXT', payload: { text, fileName: file.name, title: file.name.replace(/\.[^/.]+$/, "") } });
            showToast(`Loaded ${file.name} successfully.`);
        } catch (error) {
            showToast(`Failed to decode file with ${encoding}. Try another encoding.`, true);
            dispatch({ type: 'SET_RAW_TEXT', payload: { text: null, fileName: '', title: '' } });
        } finally {
            hideSpinner();
        }
    };

    const previewSplit = () => {
        if (!rawText || !splitRegex) return;
        try {
            dispatch({ type: 'SET_STATE', payload: { matchedHeadings: rawText.match(new RegExp(splitRegex, 'gm')) || [] } });
        } catch (e) {
            dispatch({ type: 'SET_STATE', payload: { matchedHeadings: ['Invalid Regex'] } });
        }
    };

    const processNovel = () => {
        if (!rawText) return;
        showSpinner();
        try {
            let processedText = cleanupRules.reduce((text, rule) => {
                if (!rule.find) return text;
                try {
                    return text.replace(new RegExp(rule.find, 'g'), rule.replace);
                } catch (e) {
                    console.warn(`Skipping invalid cleanup rule regex: ${rule.find}`);
                    return text;
                }
            }, rawText);

            const titles = [...processedText.matchAll(new RegExp(splitRegex, 'gm'))];
            const newChapters: Chapter[] = [];

            // Handle case where no titles were found, treat the whole text as one chapter.
            if (titles.length === 0) {
                if (processedText.trim()) {
                    newChapters.push({ id: `chap-${Date.now()}-0`, title: "Chapter 1", content: processedText.trim() });
                }
                dispatch({ type: 'SET_CHAPTERS', payload: newChapters });
                hideSpinner(); // Make sure to hide spinner before returning
                return;
            }

            // Handle preface (content before the first chapter title)
            const firstMatchIndex = titles[0].index ?? 0;
            if (firstMatchIndex > 0) {
                const prefaceContent = processedText.substring(0, firstMatchIndex).trim();
                if (prefaceContent) {
                    newChapters.push({ id: `chap-${Date.now()}-preface`, title: 'Preface', content: prefaceContent });
                }
            }

            // Handle chapters
            titles.forEach((titleMatch, i) => {
                const title = titleMatch[0].trim();
                const startIndex = (titleMatch.index ?? 0) + titleMatch[0].length;
                const nextTitleMatch = titles[i + 1];
                const endIndex = nextTitleMatch ? (nextTitleMatch.index ?? processedText.length) : processedText.length;
                const content = processedText.substring(startIndex, endIndex).trim();

                newChapters.push({ id: `chap-${Date.now()}-${i}`, title: title, content: content });
            });

            dispatch({ type: 'SET_CHAPTERS', payload: newChapters });
        } catch (e: any) {
            showToast(`Error processing novel: ${e.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    const handleFindReplace = (isReplaceAll: boolean) => {
        const currentChapter = chapters.find(c => c.id === selectedChapterId);
        if (!currentChapter || !findQuery) return;
        try {
            const newContent = currentChapter.content.replace(new RegExp(findQuery, isReplaceAll ? 'g' : ''), replaceQuery);
            dispatch({ type: 'UPDATE_CHAPTER', payload: { id: currentChapter.id, content: newContent } });
        } catch (e) { showToast('Invalid find regex', true); }
    };

    const exportToZip = async () => {
        showSpinner();
        try {
            const zip = (await getJSZip())();
            chapters.forEach((c, i) => zip.file(`${String(i + 1).padStart(4, '0')}_${c.title.replace(/[^\p{L}\p{N}\s._-]/gu, '').slice(0, 50)}.txt`, c.content));
            triggerDownload(await zip.generateAsync({ type: 'blob' }), `${meta.title || 'novel'}.zip`);
        } catch (e: any) {
            showToast(`Failed to generate ZIP: ${e.message}`, true);
        } finally { hideSpinner(); }
    };

    const exportToEpub = async () => {
        showSpinner();
        try {
            const JSZip = await getJSZip();

            // Prepare cover image data if provided
            let coverImageData: ArrayBuffer | undefined;
            let coverImageExt: string | undefined;
            if (meta.coverFile) {
                coverImageData = await meta.coverFile.arrayBuffer();
                coverImageExt = meta.coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
            }

            // Use shared EPUB generator
            const epubBlob = await generateEpubBlob(
                JSZip,
                chapters.map(c => ({ title: c.title, content: c.content })),
                {
                    title: meta.title,
                    author: meta.author,
                    language: meta.language,
                    coverImageData,
                    coverImageExt
                }
            );

            triggerDownload(epubBlob, `${meta.title.replace(/[^a-z0-9]/gi, '_')}.epub`);
            showToast('EPUB created successfully!');
        } catch (e: any) {
            showToast(`Failed to generate EPUB: ${e.message}`, true);
        } finally { hideSpinner(); }
    };

    const handleDragSort = (draggedOverItem: Chapter) => {
        if (!draggedItem.current || !draggedOverItem || draggedItem.current.id === draggedOverItem.id) {
            setDragIndicator(null); return;
        }
        const items = [...chapters];
        const fromIndex = items.findIndex(c => c.id === draggedItem.current!.id);
        const toIndex = items.findIndex(c => c.id === draggedOverItem.id);
        items.splice(fromIndex, 1);
        const newIndex = dragIndicator?.position === 'bottom' ? toIndex : toIndex;
        items.splice(newIndex, 0, draggedItem.current);
        dispatch({ type: 'REORDER_CHAPTERS', payload: items });
        draggedItem.current = null; setDragIndicator(null);
    };

    const handleBatchRename = () => {
        dispatch({ type: 'BATCH_RENAME', payload: { pattern: renamePattern, startNumber: renameStartNum } });
        setBatchRenameModalOpen(false);
    };

    const saveTemplate = () => {
        const name = prompt("Enter a name for this template:");
        if (name) {
            const newTemplate: Template = { id: Date.now(), name, splitRegex, cleanupRules };
            const updatedTemplates = [...templates, newTemplate];
            setTemplates(updatedTemplates);
            localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updatedTemplates));
            showToast(`Template "${name}" saved.`);
        }
    };

    const loadTemplate = (id: number) => {
        const template = templates.find(t => t.id === id);
        if (template) {
            dispatch({ type: 'SET_STATE', payload: { splitRegex: template.splitRegex, cleanupRules: template.cleanupRules } });
            showToast(`Template "${template.name}" loaded.`);
        }
    };

    const performGlobalSearch = useCallback(() => {
        if (!globalFindQuery) {
            dispatch({ type: 'SET_STATE', payload: { globalMatches: [], currentGlobalMatchIndex: -1 } });
            return;
        }

        try {
            const flags = globalFindOptions.caseSensitive ? 'g' : 'gi';
            let finalPattern = globalFindOptions.useRegex ? globalFindQuery : globalFindQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            if (globalFindOptions.wholeWord) {
                finalPattern = `\\b(${finalPattern})\\b`;
            }
            const regex = new RegExp(finalPattern, flags);

            const allMatches: GlobalMatch[] = [];
            chapters.forEach(chapter => {
                let match;
                while ((match = regex.exec(chapter.content)) !== null) {
                    allMatches.push({
                        chapterId: chapter.id,
                        chapterTitle: chapter.title,
                        index: match.index,
                        length: match[0].length,
                        text: match[0]
                    });
                }
            });
            dispatch({ type: 'SET_STATE', payload: { globalMatches: allMatches, currentGlobalMatchIndex: allMatches.length > 0 ? 0 : -1 } });
        } catch (e) {
            showToast("Invalid Regular Expression", true);
            dispatch({ type: 'SET_STATE', payload: { globalMatches: [], currentGlobalMatchIndex: -1 } });
        }
    }, [globalFindQuery, globalFindOptions, chapters, showToast]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (showGlobalFindReplace) performGlobalSearch();
        }, 300);
        return () => clearTimeout(handler);
    }, [performGlobalSearch, showGlobalFindReplace]);

    useEffect(() => {
        if (!textareaRef.current || currentGlobalMatchIndex === -1 || globalMatches.length === 0) return;
        const match = globalMatches[currentGlobalMatchIndex];

        const highlightMatch = () => {
            const editor = textareaRef.current;
            if (!editor) return;
            editor.focus();
            editor.setSelectionRange(match.index, match.index + match.length);
            const text = editor.value;
            const lineHeight = parseInt(window.getComputedStyle(editor).lineHeight) || 20;
            const lines = text.substring(0, match.index).split('\n').length;
            editor.scrollTop = Math.max(0, (lines - 5) * lineHeight);
        };

        if (match.chapterId !== selectedChapterId) {
            dispatch({ type: 'SET_STATE', payload: { selectedChapterId: match.chapterId } });
        } else {
            highlightMatch();
        }
    }, [currentGlobalMatchIndex, globalMatches, selectedChapterId]);


    const handleGlobalReplace = () => {
        if (currentGlobalMatchIndex < 0) return;
        const match = globalMatches[currentGlobalMatchIndex];
        const chapter = chapters.find(c => c.id === match.chapterId);
        if (!chapter) return;

        const newContent = chapter.content.substring(0, match.index) + globalReplaceQuery + chapter.content.substring(match.index + match.length);
        const updatedChapter = { ...chapter, content: newContent };
        const newChapters = chapters.map(c => c.id === chapter.id ? updatedChapter : c);

        dispatch({ type: 'UPDATE_CHAPTERS', payload: newChapters });
    };

    const handleConfirmReplaceAll = () => {
        const matchesToReplace = globalMatches.filter((_, index) => reviewSelection.has(index));
        if (matchesToReplace.length === 0) {
            setReviewModalOpen(false);
            return;
        }

        const groupedByChapter = matchesToReplace.reduce((acc, match) => {
            if (!acc[match.chapterId]) acc[match.chapterId] = [];
            acc[match.chapterId].push(match);
            return acc;
        }, {} as Record<string, GlobalMatch[]>);

        const newChapters = chapters.map(c => {
            const matchesInChapter = groupedByChapter[c.id];
            if (!matchesInChapter) return c;

            matchesInChapter.sort((a, b) => b.index - a.index);
            let newContent = c.content;
            for (const match of matchesInChapter) {
                newContent = newContent.substring(0, match.index) + globalReplaceQuery + newContent.substring(match.index + match.length);
            }
            return { ...c, content: newContent };
        });

        dispatch({ type: 'UPDATE_CHAPTERS', payload: newChapters });
        showToast(`${matchesToReplace.length} replacements made.`);
        setReviewModalOpen(false);
        dispatch({ type: 'SET_STATE', payload: { showGlobalFindReplace: false } });
    };

    const currentChapter = useMemo(() => chapters.find(c => c.id === selectedChapterId), [chapters, selectedChapterId]);

    const renderUploadStep = () => (
        <Card className="max-w-xl mx-auto mt-12 animate-fade-in text-center">
            <CardHeader className="space-y-4">
                <CardTitle className="text-3xl">Novel Splitter</CardTitle>
                <CardDescription className="text-lg">
                    Upload your novel as a single .txt file, and this tool will help you split it into chapters, clean it up, and export it.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col gap-4">
                    <Label htmlFor="novel-file-upload" className="w-full h-32 flex flex-col items-center justify-center border-2 border-dashed border-input rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                        <span className="font-medium">Click to upload .txt Novel</span>
                    </Label>
                    <input type="file" id="novel-file-upload" className="hidden" accept=".txt" onChange={e => e.target.files && handleNovelFile(e.target.files[0])} />

                    {localStorage.getItem(SESSION_KEY) && (
                        <Button variant="outline" onClick={restoreSession} className="w-full">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Restore Last Session
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );

    const renderConfigStep = () => (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <PageHeader
                title="Configure Split"
                backUrl="#" // Manual back handling handled by cancel button mostly
            // But we can custom handle it or just leave it since PageHeader uses navigation.
            // Actually we want to just go back to step upload.
            />
            {/* Custom back button override if needed, but PageHeader navigates history. 
                Here we want to change state. So maybe we shouldn't use PageHeader for internal steps if it forces nav? 
                PageHeader takes a backUrl. If we want state change, we might need a custom header or just a button.
                Let's stick to the card layout.
            */}
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Configuration</h2>
                <Button variant="ghost" onClick={() => dispatch({ type: 'SET_STATE', payload: { step: 'upload' } })}>Cancel</Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>File Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                        <div className="flex items-center gap-2">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <span className="font-medium">{fileName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label htmlFor="encodingSelect">Encoding:</Label>
                            <Select id="encodingSelect" value={encoding} onChange={e => dispatch({ type: 'SET_STATE', payload: { encoding: e.target.value } })} className="w-auto">
                                <option value="utf-8">UTF-8</option><option value="gbk">GBK</option><option value="big5">Big5</option>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium">Cleanup Rules</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setCleanupOpen(!isCleanupOpen)}>
                        {isCleanupOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </CardHeader>
                {isCleanupOpen && (
                    <CardContent className="pt-4 space-y-4">
                        {cleanupRules.map((rule) => (
                            <div key={rule.id} className="flex gap-2 items-center">
                                <Input placeholder="Find pattern" value={rule.find} onChange={e => dispatch({ type: 'UPDATE_RULE', payload: { id: rule.id, find: e.target.value } })} />
                                <Input placeholder="Replace with" value={rule.replace} onChange={e => dispatch({ type: 'UPDATE_RULE', payload: { id: rule.id, replace: e.target.value } })} />
                                <Button variant="destructive" size="icon" onClick={() => dispatch({ type: 'DELETE_RULE', payload: rule.id })} disabled={cleanupRules.length === 1}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <Button variant="outline" onClick={() => dispatch({ type: 'ADD_RULE' })} className="w-full">
                            <Plus className="mr-2 h-4 w-4" /> Add Rule
                        </Button>
                    </CardContent>
                )}
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-lg font-medium">Split Rules (Regex)</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setSplitPreviewOpen(!isSplitPreviewOpen)}>
                        {isSplitPreviewOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </CardHeader>
                {isSplitPreviewOpen && (
                    <CardContent className="pt-4 space-y-4">
                        <div className="flex gap-2">
                            <Select onChange={(e) => { if (e.target.value) loadTemplate(Number(e.target.value)); }} value="" className="flex-1">
                                <option value="" disabled>Load a template...</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </Select>
                            <Button variant="secondary" onClick={saveTemplate}>Save Template</Button>
                        </div>
                        <Input value={splitRegex} onChange={e => dispatch({ type: 'SET_STATE', payload: { splitRegex: e.target.value } })} className="font-mono" />
                        <Button variant="outline" onClick={previewSplit} className="w-full">Preview Matches</Button>

                        {matchedHeadings.length > 0 && (
                            <div className="p-4 bg-muted rounded-md max-h-48 overflow-y-auto text-xs font-mono border">
                                {matchedHeadings.map((h, i) => <div key={i}>{h}</div>)}
                            </div>
                        )}
                    </CardContent>
                )}
            </Card>

            <div className="flex justify-center pt-8">
                <Button size="lg" onClick={processNovel} disabled={!rawText} className="w-full md:w-auto min-w-[200px]">
                    Process Novel
                </Button>
            </div>
        </div>
    );

    const renderEditorStep = () => (
        <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen bg-background animate-fade-in absolute inset-0 z-10 md:static">
            {/* Toolbar */}
            <div className="h-14 border-b flex items-center justify-between px-4 bg-background z-20">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: true } })} className="md:hidden">
                        <Menu className="h-5 w-5" />
                    </Button>
                    <Input
                        value={currentChapter?.title || ''}
                        onChange={e => currentChapter && dispatch({ type: 'UPDATE_CHAPTER', payload: { id: currentChapter.id, title: e.target.value } })}
                        className="font-semibold text-lg bg-transparent border-transparent hover:border-input focus:border-input w-48 md:w-96 text-center"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setBookDetailsModalOpen(true)} title="Book Details">
                        <Book className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => dispatch({ type: 'SET_STATE', payload: { showGlobalFindReplace: true } })} title="Find & Replace">
                        <Search className="h-5 w-5" />
                    </Button>
                    <div className="relative">
                        <Button variant="ghost" size="icon" onClick={() => setChapterActionsOpen(v => !v)}>
                            <MoreVertical className="h-5 w-5" />
                        </Button>
                        {isChapterActionsOpen && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-popover text-popover-foreground rounded-md shadow-md border z-50 py-1">
                                <button onClick={() => { dispatch({ type: 'MERGE_CHAPTER_WITH_NEXT' }); setChapterActionsOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground">Merge with Next</button>
                                <button onClick={() => { textareaRef.current && dispatch({ type: 'SPLIT_CHAPTER', payload: { cursorPosition: textareaRef.current.selectionStart } }); setChapterActionsOpen(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground">Split at Cursor</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden relative">
                {/* Chapter List (Desktop Sidebar / Mobile Drawer) */}
                <aside className={cn(
                    "fixed inset-y-0 left-0 z-30 w-72 bg-card border-r shadow-xl transform transition-transform duration-300 md:relative md:translate-x-0 md:shadow-none",
                    isChapterNavOpen ? "translate-x-0" : "-translate-x-full"
                )}>
                    <div className="h-full flex flex-col">
                        <div className="p-4 border-b flex justify-between items-center">
                            <span className="font-semibold">Chapters ({chapters.length})</span>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => dispatch({ type: 'ADD_NEW_CHAPTER' })}><Plus className="h-4 w-4" /></Button>
                                <Button variant={reorderModeActive ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => dispatch({ type: 'TOGGLE_REORDER_MODE' })}><GripVertical className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: false } })}><ChevronLeft className="h-4 w-4" /></Button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {chapters.map((chapter) => (
                                <div
                                    key={chapter.id}
                                    className={cn(
                                        "flex items-center p-2 rounded-md mb-1 cursor-pointer transition-colors text-sm",
                                        selectedChapterId === chapter.id ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground",
                                        dragIndicator?.id === chapter.id && (dragIndicator.position === 'top' ? 'border-t-2 border-primary' : 'border-b-2 border-primary')
                                    )}
                                    onClick={() => dispatch({ type: 'SET_STATE', payload: { selectedChapterId: chapter.id, isChapterNavOpen: false } })}
                                    onDragOver={e => {
                                        e.preventDefault();
                                        if (reorderModeActive) {
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            setDragIndicator({ id: chapter.id, position: e.clientY - rect.top > rect.height / 2 ? 'bottom' : 'top' });
                                        }
                                    }}
                                >
                                    {reorderModeActive ? (
                                        <div draggable onDragStart={() => (draggedItem.current = chapter)} onDragEnd={() => handleDragSort(chapter)} className="mr-2 cursor-grab active:cursor-grabbing">
                                            <GripVertical className="h-4 w-4 opacity-50" />
                                        </div>
                                    ) : (
                                        <div
                                            className="mr-2"
                                            onClick={e => { e.stopPropagation(); dispatch({ type: 'MULTI_SELECT_CHAPTER', payload: { id: chapter.id, checked: !selectedChapterIds.has(chapter.id) } }); }}
                                        >
                                            {selectedChapterIds.has(chapter.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 opacity-30" />}
                                        </div>
                                    )}
                                    <span className="truncate flex-1">{chapter.title}</span>
                                </div>
                            ))}
                        </div>
                        {selectedChapterIds.size > 0 && !reorderModeActive && (
                            <div className="p-3 border-t bg-muted/50">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-medium">{selectedChapterIds.size} selected</span>
                                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => dispatch({ type: 'SET_SELECTION', payload: new Set() })}>Clear</Button>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => { if (confirm('Merge selected chapters?')) dispatch({ type: 'MERGE_SELECTED_CHAPTERS' }) }}>Merge</Button>
                                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setBatchRenameModalOpen(true)}>Rename</Button>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Mobile Overlay */}
                {isChapterNavOpen && <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: false } })} />}

                {/* Editor Area */}
                <main className="flex-1 relative flex flex-col bg-background">
                    {showFindReplace && (
                        <div className="p-2 border-b bg-muted/30 flex gap-2 items-center flex-wrap">
                            <Input placeholder="Find" value={findQuery} onChange={e => dispatch({ type: 'SET_STATE', payload: { findQuery: e.target.value } })} className="w-32 md:w-48 h-8" />
                            <Input placeholder="Replace" value={replaceQuery} onChange={e => dispatch({ type: 'SET_STATE', payload: { replaceQuery: e.target.value } })} className="w-32 md:w-48 h-8" />
                            <Button size="sm" className="h-8" onClick={() => handleFindReplace(false)}>Replace</Button>
                            <Button size="sm" className="h-8" onClick={() => handleFindReplace(true)}>All</Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => dispatch({ type: 'SET_STATE', payload: { showFindReplace: false } })}><ChevronUp className="h-4 w-4" /></Button>
                        </div>
                    )}
                    <textarea
                        ref={textareaRef}
                        value={currentChapter?.content || ''}
                        onChange={e => currentChapter && dispatch({ type: 'UPDATE_CHAPTER', payload: { id: currentChapter.id, content: e.target.value } })}
                        className="flex-1 w-full resize-none p-4 md:p-8 outline-none font-mono text-base leading-relaxed bg-transparent"
                        placeholder={chapters.length === 0 ? "No chapters. Create one!" : "Select a chapter to edit..."}
                    />

                    {/* Footer Actions */}
                    <div className="border-t p-2 flex justify-between items-center bg-card">
                        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'SET_STATE', payload: { step: 'upload' } })}>
                            <ChevronLeft className="mr-2 h-4 w-4" /> Start Over
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setExportModalOpen(true)}>
                                <Download className="mr-2 h-4 w-4" /> Export
                            </Button>
                        </div>
                    </div>
                </main>
            </div>

            {/* Modals */}
            {isBookDetailsModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setBookDetailsModalOpen(false)}>
                    <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle>Book Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Title</Label>
                                <Input value={meta.title} onChange={e => dispatch({ type: 'SET_META', payload: { title: e.target.value } })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Author</Label>
                                <Input value={meta.author} onChange={e => dispatch({ type: 'SET_META', payload: { author: e.target.value } })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Language</Label>
                                <Input value={meta.language} onChange={e => dispatch({ type: 'SET_META', payload: { language: e.target.value } })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Cover Image</Label>
                                <FileInput inputId="coverUpload" label="Choose Cover" accept="image/*" onFileSelected={files => dispatch({ type: 'SET_META', payload: { coverFile: files[0] } })} />
                                {meta.coverFile && <p className="text-xs text-muted-foreground">{meta.coverFile.name}</p>}
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end">
                            <Button onClick={() => setBookDetailsModalOpen(false)}>Done</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {isExportModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setExportModalOpen(false)}>
                    <Card className="w-full max-w-xs" onClick={e => e.stopPropagation()}>
                        <CardHeader><CardTitle>Export Novel</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <Button className="w-full justify-start" onClick={exportToEpub}>
                                <Book className="mr-2 h-4 w-4" /> Export to EPUB
                            </Button>
                            <Button className="w-full justify-start" variant="outline" onClick={exportToZip}>
                                <FolderArchive className="mr-2 h-4 w-4" /> Export to TXT (Zip)
                            </Button>
                        </CardContent>
                        <CardFooter><Button variant="ghost" onClick={() => setExportModalOpen(false)} className="w-full">Cancel</Button></CardFooter>
                    </Card>
                </div>
            )}

            {isBatchRenameModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setBatchRenameModalOpen(false)}>
                    <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <CardHeader><CardTitle>Batch Rename</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Pattern (use {'{n}'} for number)</Label>
                                <Input value={renamePattern} onChange={e => setRenamePattern(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Start Number</Label>
                                <Input type="number" value={renameStartNum} onChange={e => setRenameStartNum(parseInt(e.target.value))} />
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-2">
                            <Button variant="ghost" onClick={() => setBatchRenameModalOpen(false)}>Cancel</Button>
                            <Button onClick={handleBatchRename}>Rename</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );

    return (
        <div id="novelSplitterApp" className="min-h-full">
            {step === 'upload' && renderUploadStep()}
            {step === 'config' && renderConfigStep()}
            {step === 'editor' && renderEditorStep()}
        </div>
    );
};
