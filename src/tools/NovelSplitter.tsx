import React, { useState, useEffect, useRef, useMemo, useReducer, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload, getJSZip, escapeHTML } from '../utils/helpers';

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
    step: 'upload' | 'editor';
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
    splitRegex: '^\\s*(第?\\s*[〇一二三四五六七八九十百千万零\\d]+\\s*[章章节回部卷])',
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
            return { ...state, rawText: action.payload.text, fileName: action.payload.fileName, meta: { ...state.meta, title: action.payload.title } };
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

export const NovelSplitter: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [state, dispatch] = useReducer(reducer, initialState);
    const { step, rawText, fileName, encoding, splitRegex, matchedHeadings, cleanupRules, chapters, selectedChapterId, meta, showFindReplace, findQuery, replaceQuery, isChapterNavOpen, reorderModeActive, selectedChapterIds, showGlobalFindReplace, globalFindQuery, globalReplaceQuery, globalFindOptions, globalMatches, currentGlobalMatchIndex } = state;
    
    const [isCleanupOpen, setCleanupOpen] = useState(false);
    const [isSplitPreviewOpen, setSplitPreviewOpen] = useState(false);
    const [isFabOpen, setFabOpen] = useState(false);
    const [isBatchRenameModalOpen, setBatchRenameModalOpen] = useState(false);
    const [isReviewModalOpen, setReviewModalOpen] = useState(false);
    const [reviewSelection, setReviewSelection] = useState<Set<number>>(new Set());
    const [renamePattern, setRenamePattern] = useState('Chapter {n}');
    const [renameStartNum, setRenameStartNum] = useState(1);
    const [templates, setTemplates] = useState<Template[]>([]);

    const contentEditableRef = useRef<HTMLTextAreaElement>(null);
    const draggedItem = useRef<Chapter | null>(null);
    const [dragIndicator, setDragIndicator] = useState<{ id: string, position: 'top' | 'bottom' } | null>(null);
    const touchStartX = useRef(0);

    const SESSION_KEY = 'novelSplitterSession';

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
    
    useEffect(() => {
        const savedSession = localStorage.getItem(SESSION_KEY);
        if (savedSession) {
            if (confirm('An unfinished session was found. Do you want to restore it?')) {
                const sessionData = JSON.parse(savedSession);
                dispatch({ type: 'SET_STATE', payload: { ...sessionData, meta: { ...sessionData.meta, coverFile: null }, selectedChapterIds: new Set() } });
            } else {
                localStorage.removeItem(SESSION_KEY);
            }
        }
        const savedTemplates = localStorage.getItem(TEMPLATES_KEY);
        if (savedTemplates) setTemplates(JSON.parse(savedTemplates));
    }, []);

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-primary-500');
        e.dataTransfer.files?.[0] && handleNovelFile(e.dataTransfer.files[0]);
    };
    
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
            let processedText = cleanupRules.reduce((text, rule) => rule.find ? text.replace(new RegExp(rule.find, 'g'), rule.replace) : text, rawText);
            const titles = [...processedText.matchAll(new RegExp(splitRegex, 'gm'))];
            const contents = processedText.split(new RegExp(splitRegex, 'gm'));
            const newChapters: Chapter[] = [];
            if (contents[0]?.trim()) newChapters.push({ id: `chap-${Date.now()}-preface`, title: 'Preface', content: contents[0].trim() });
            titles.forEach((title, i) => newChapters.push({ id: `chap-${Date.now()}-${i}`, title: title[0].trim(), content: (contents[i + 1] || '').trim() }));
            if (newChapters.length === 0 && processedText) newChapters.push({ id: `chap-${Date.now()}-0`, title: "Chapter 1", content: processedText });
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
            chapters.forEach((c, i) => zip.file(`${String(i + 1).padStart(3, '0')}-${c.title.replace(/[^\w\s.-]/g, '').slice(0, 50)}.txt`, c.content));
            triggerDownload(await zip.generateAsync({ type: 'blob' }), `${meta.title || 'novel'}.zip`);
        } catch (e: any) { showToast(`Failed to generate ZIP: ${e.message}`, true);
        } finally { hideSpinner(); }
    };

    const exportToEpub = async () => {
        showSpinner();
        try {
            const zip = (await getJSZip())();
            zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
            zip.folder("META-INF")!.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
            const oebps = zip.folder("OEBPS")!;
            oebps.folder("css")!.file("style.css", "body{font-family:sans-serif;line-height:1.6;} h2{text-align:center;font-weight:bold;} p{text-indent:1.5em; margin-top:0; margin-bottom:0; text-align:justify;} p+p{margin-top: 1em;}");
            
            const manifestItems: any[] = [{ id: "css", href: "css/style.css", "media-type": "text/css" }, { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }];
            const spineItems: any[] = [];
            
            if (meta.coverFile) {
                const ext = meta.coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                oebps.folder("images")!.file(`cover.${ext}`, await meta.coverFile.arrayBuffer());
                manifestItems.push({ id: "cover-image", href: `images/cover.${ext}`, "media-type": `image/${ext === 'jpg' ? 'jpeg' : ext}`, properties: "cover-image" });
                oebps.folder("text")!.file("cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="text-align:center;margin:0;padding:0;"><img src="../images/cover.${ext}" alt="Cover" style="max-width:100%;max-height:100vh;object-fit:contain;"/></body></html>`);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }
            
            chapters.forEach((c, i) => {
                const filename = `chapter_${i + 1}.xhtml`;
                const bodyContent = c.content.split('\n').filter(l => l.trim()).map(l => `<p>${escapeHTML(l)}</p>`).join('\n');
                oebps.folder("text")!.file(filename, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${meta.language}"><head><title>${escapeHTML(c.title)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><h2>${escapeHTML(c.title)}</h2>${bodyContent}</body></html>`);
                manifestItems.push({ id: `chapter-${i + 1}`, href: `text/${filename}`, "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: `chapter-${i + 1}` });
            });
            
            const navLiItems = chapters.map((c, i) => `<li><a href="text/chapter_${i+1}.xhtml">${escapeHTML(c.title)}</a></li>`).join("\n");
            oebps.file("nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navLiItems}</ol></nav></body></html>`);
            oebps.file("content.opf", `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${escapeHTML(meta.title)}</dc:title><dc:language>${escapeHTML(meta.language)}</dc:language><dc:creator>${escapeHTML(meta.author)}</dc:creator><meta property="dcterms:modified">${new Date().toISOString()}</meta>${meta.coverFile ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifestItems.map(item => `<item id="${item.id}" href="${item.href}" media-type="${item["media-type"]}" ${item.properties ? `properties="${item.properties}"` : ''}/>`).join("")}</manifest><spine>${spineItems.map(item => `<itemref idref="${item.idref}" ${item.linear ? `linear="${item.linear}"` : ''}/>`).join("")}</spine></package>`);
            
            triggerDownload(await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" }), `${meta.title.replace(/[^a-z0-9]/gi, '_')}.epub`);
            showToast('EPUB created successfully!');
        } catch (e: any) { showToast(`Failed to generate EPUB: ${e.message}`, true);
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
    
    const deleteTemplate = (id: number) => {
        if (confirm("Are you sure you want to delete this template?")) {
            const updatedTemplates = templates.filter(t => t.id !== id);
            setTemplates(updatedTemplates);
            localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updatedTemplates));
            showToast(`Template deleted.`);
        }
    };
    
    const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const handleTouchMove = (e: React.TouchEvent) => {
        if (touchStartX.current < 20 && e.touches[0].clientX > 50) {
            dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: true } });
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
        if (!contentEditableRef.current || currentGlobalMatchIndex === -1 || globalMatches.length === 0) return;
        const match = globalMatches[currentGlobalMatchIndex];

        const highlightMatch = () => {
            const editor = contentEditableRef.current;
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
            // The highlight will be handled by the next render cycle after the chapter is set
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
        // After replacement, re-run the search to get fresh matches and indices
        // A full re-search is safer than trying to manually update indices
    };

    const handleConfirmReplaceAll = () => {
        const matchesToReplace = globalMatches.filter((_, index) => reviewSelection.has(index));
        if (matchesToReplace.length === 0) {
            setReviewModalOpen(false);
            return;
        }

        const chaptersToUpdate = new Map<string, string>();
        
        const groupedByChapter = matchesToReplace.reduce((acc, match) => {
            if (!acc[match.chapterId]) acc[match.chapterId] = [];
            acc[match.chapterId].push(match);
            return acc;
        }, {} as Record<string, GlobalMatch[]>);

        const newChapters = chapters.map(c => {
            const matchesInChapter = groupedByChapter[c.id];
            if (!matchesInChapter) return c;

            // Sort matches in descending order of index to replace from the end
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

    if (step === 'upload') return (
        <div className="max-w-4xl mx-auto p-4 md:p-6">
             <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Novel Splitter</h1>
             <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 mb-4">
                 <label className="block mb-1.5 font-semibold text-slate-800 dark:text-slate-200">1. Upload Novel File (.txt)</label>
                 <div onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-primary-500'); }} onDragLeave={e => e.currentTarget.classList.remove('ring-2', 'ring-primary-500')} onDrop={handleFileDrop}
                     className="text-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg transition-all">
                     <input type="file" accept=".txt" onChange={e => e.target.files && handleNovelFile(e.target.files[0])} id="novelFile" className="hidden" />
                     <label htmlFor="novelFile" className="cursor-pointer text-slate-600 dark:text-slate-300">{fileName || "Drag & drop .txt file here, or click to select"}</label>
                 </div>
                 <div className="flex items-center gap-2 mt-2">
                     <label className="text-sm text-slate-700 dark:text-slate-300" htmlFor="encodingSelect">Encoding:</label>
                     <select id="encodingSelect" value={encoding} onChange={e => dispatch({ type: 'SET_STATE', payload: { encoding: e.target.value }})} className="text-sm bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 focus:border-primary-500 focus:ring-1 focus:ring-primary-500">
                         <option value="utf-8">UTF-8</option><option value="gbk">GBK</option><option value="big5">Big5</option>
                     </select>
                 </div>
             </div>
              <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 mb-4">
                 <div className="flex justify-between items-center font-semibold text-slate-800 dark:text-slate-200">
                    <button type="button" onClick={() => setCleanupOpen(!isCleanupOpen)} className="flex-grow text-left">2. Cleanup Rules (Regex)</button>
                    <div className="relative group">
                         <select onChange={(e) => loadTemplate(Number(e.target.value))} className="text-sm bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 mr-2"><option>Load Template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                         <button onClick={saveTemplate} className="px-2 py-1 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 mr-2">Save</button>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isCleanupOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                 </div>
                 {isCleanupOpen && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        {cleanupRules.map((rule) => (
                            <div key={rule.id} className="flex gap-2 items-center mb-1.5">
                                <input type="text" placeholder="Find pattern" value={rule.find} onChange={e => dispatch({ type: 'UPDATE_RULE', payload: { id: rule.id, find: e.target.value } })} className="flex-grow bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm" />
                                <input type="text" placeholder="Replace with" value={rule.replace} onChange={e => dispatch({ type: 'UPDATE_RULE', payload: { id: rule.id, replace: e.target.value } })} className="flex-grow bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 text-sm" />
                                <button onClick={() => dispatch({ type: 'DELETE_RULE', payload: rule.id })} disabled={cleanupRules.length === 1} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">-</button>
                            </div>
                        ))}
                        <button onClick={() => dispatch({ type: 'ADD_RULE' })} className="px-3 py-1 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800">+</button>
                    </div>
                 )}
             </div>
             <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-4 mb-4">
                <button type="button" onClick={() => setSplitPreviewOpen(!isSplitPreviewOpen)} className="w-full flex justify-between items-center font-semibold text-slate-800 dark:text-slate-200">
                    3. Chapter Splitting (Regex)
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isSplitPreviewOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {isSplitPreviewOpen && (
                    <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <input type="text" value={splitRegex} onChange={e => dispatch({ type: 'SET_STATE', payload: { splitRegex: e.target.value } })} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5 mb-2" />
                        <button onClick={previewSplit} className="px-4 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800">Preview Matches</button>
                        {matchedHeadings.length > 0 && <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg max-h-32 overflow-y-auto text-xs font-mono">{matchedHeadings.map((h, i) => <div key={i}>{h}</div>)}</div>}
                    </div>
                )}
             </div>
             <div className="mt-6 flex justify-center">
                 <button onClick={processNovel} disabled={!rawText} className="px-6 py-3 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg disabled:opacity-50">Process Novel</button>
             </div>
        </div>
    );

    return (
        <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} className="max-w-7xl mx-auto p-2 md:p-4">
            <div className="flex flex-col min-h-[75vh]">
                <header className="flex-shrink-0 flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-y-2 gap-x-4 p-2 mb-2">
                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                        <input type="text" placeholder="Book Title" value={meta.title} onChange={e => dispatch({ type: 'SET_META', payload: { title: e.target.value } })} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-1.5 text-lg font-semibold w-full sm:w-48"/>
                        <input type="text" placeholder="Author" value={meta.author} onChange={e => dispatch({ type: 'SET_META', payload: { author: e.target.value } })} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-1.5 w-full sm:w-48"/>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                         <button onClick={() => dispatch({ type: 'SET_STATE', payload: { showGlobalFindReplace: true }})} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Find in Project</button>
                         <button onClick={exportToZip} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Export ZIP</button>
                         <button onClick={exportToEpub} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Export EPUB</button>
                         <button onClick={() => dispatch({ type: 'SET_STATE', payload: { step: 'upload' } })} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Back</button>
                    </div>
                </header>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
                    {/* Chapter List */}
                    <div className={`fixed inset-0 z-40 md:static md:block bg-black/30 md:bg-transparent transition-opacity duration-300 ${isChapterNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto'}`} onClick={() => dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: false }})}>
                        <div className={`absolute top-0 left-0 h-full w-64 md:w-full bg-slate-100 dark:bg-slate-800 md:bg-white/70 md:dark:bg-slate-800/50 backdrop-blur-sm border-r md:border border-slate-200 dark:border-slate-700 rounded-r-lg md:rounded-xl shadow-lg flex flex-col transform transition-transform duration-300 ${isChapterNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                <span className="font-semibold">Chapters ({chapters.length})</span>
                                <div className="flex gap-2">
                                    <button onClick={() => dispatch({ type: 'ADD_NEW_CHAPTER' })} title="Add New Chapter" className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg></button>
                                    <button onClick={() => dispatch({ type: 'TOGGLE_REORDER_MODE' })} title="Toggle Reorder Mode" className={`p-2 rounded-md ${reorderModeActive ? 'bg-primary-500 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-600'}`}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg></button>
                                </div>
                            </div>
                            <ul className="flex-1 overflow-y-auto p-2 list-none">
                                {chapters.map((chapter) => (
                                    <li key={chapter.id} className={`flex items-center p-1 rounded-md ${selectedChapterId === chapter.id ? 'bg-primary-500 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'} ${dragIndicator?.id === chapter.id ? (dragIndicator.position === 'top' ? 'border-t-2 border-primary-500' : 'border-b-2 border-primary-500') : ''}`}
                                        onDragOver={e => { e.preventDefault(); if (reorderModeActive) { const rect = e.currentTarget.getBoundingClientRect(); setDragIndicator({ id: chapter.id, position: e.clientY - rect.top > rect.height / 2 ? 'bottom' : 'top' }); }}}>
                                        {!reorderModeActive ? (
                                            <input type="checkbox" checked={selectedChapterIds.has(chapter.id)} onChange={e => dispatch({type: 'MULTI_SELECT_CHAPTER', payload: { id: chapter.id, checked: e.target.checked }})} className="w-4 h-4 mr-2 flex-shrink-0" onClick={e => e.stopPropagation()} />
                                        ) : (
                                            <div draggable onDragStart={() => (draggedItem.current = chapter)} onDragEnd={() => handleDragSort(chapter)} className="cursor-grab p-2 touch-none flex-shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
                                            </div>
                                        )}
                                        <div onClick={() => dispatch({ type: 'SET_STATE', payload: { selectedChapterId: chapter.id, isChapterNavOpen: false } })} className="flex-grow min-w-0 cursor-pointer">
                                            <input type="text" value={chapter.title} onChange={e => dispatch({ type: 'UPDATE_CHAPTER', payload: { id: chapter.id, title: e.target.value } })} onClick={e => e.stopPropagation()} className="w-full bg-transparent outline-none border-none p-1 rounded focus:bg-white/20" />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                             {selectedChapterIds.size > 0 && !reorderModeActive && (
                                <div className="p-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                                    <p className="text-sm font-semibold">{selectedChapterIds.size} chapter(s) selected</p>
                                    <div className="flex gap-2 flex-wrap">
                                        <button onClick={() => { if(confirm('Merge selected chapters?')) dispatch({ type: 'MERGE_SELECTED_CHAPTERS' }) }} className="px-2 py-1 text-xs rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Merge</button>
                                        <button onClick={() => setBatchRenameModalOpen(true)} className="px-2 py-1 text-xs rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Rename</button>
                                        <button onClick={() => dispatch({ type: 'SET_SELECTION', payload: new Set() })} className="px-2 py-1 text-xs rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Clear</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Editor Panel */}
                    <div className="flex flex-col gap-2">
                        <div className="flex-shrink-0 flex items-center gap-2">
                            <div className="hidden md:flex flex-wrap items-center gap-2">
                                <button onClick={() => dispatch({ type: 'MERGE_CHAPTER_WITH_NEXT' })} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Merge with Next</button>
                                <button onClick={() => contentEditableRef.current && dispatch({ type: 'SPLIT_CHAPTER', payload: { cursorPosition: contentEditableRef.current.selectionStart } })} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Split at Cursor</button>
                            </div>
                            <div className="flex-grow"></div>
                            <button onClick={() => dispatch({ type: 'SET_STATE', payload: { showFindReplace: !showFindReplace }})} className="p-2 rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500" title="Find/Replace">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </button>
                        </div>
                        {showFindReplace && (
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 p-2 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                                <input type="text" placeholder="Find" value={findQuery} onChange={e => dispatch({ type: 'SET_STATE', payload: { findQuery: e.target.value }})} className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm" />
                                <input type="text" placeholder="Replace" value={replaceQuery} onChange={e => dispatch({ type: 'SET_STATE', payload: { replaceQuery: e.target.value }})} className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm" />
                                <div className="flex gap-2">
                                    <button onClick={() => handleFindReplace(false)} className="px-3 py-1 text-sm rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Replace</button>
                                    <button onClick={() => handleFindReplace(true)} className="px-3 py-1 text-sm rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">All</button>
                                </div>
                            </div>
                        )}
                        <textarea ref={contentEditableRef} value={currentChapter?.content || ''} onChange={e => currentChapter && dispatch({ type: 'UPDATE_CHAPTER', payload: { id: currentChapter.id, content: e.target.value } })} placeholder="Chapter content..." className="flex-1 w-full resize-none p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono text-base leading-relaxed" />
                    </div>
                </div>
            </div>

            {/* Global Find/Replace Modal */}
            {showGlobalFindReplace && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => dispatch({ type: 'SET_STATE', payload: { showGlobalFindReplace: false }})}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <header className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h2 className="text-xl font-semibold">Find and Replace in Project</h2>
                            <button onClick={() => dispatch({ type: 'SET_STATE', payload: { showGlobalFindReplace: false } })} className="text-2xl">&times;</button>
                        </header>
                        <div className="p-4 space-y-3">
                            <div className="flex gap-2">
                                <input type="text" value={globalFindQuery} onChange={e => dispatch({ type: 'SET_STATE', payload: { globalFindQuery: e.target.value }})} placeholder="Find" className="w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded px-3 py-2" />
                                <input type="text" value={globalReplaceQuery} onChange={e => dispatch({ type: 'SET_STATE', payload: { globalReplaceQuery: e.target.value }})} placeholder="Replace" className="w-full bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded px-3 py-2" />
                            </div>
                            <div className="flex flex-wrap gap-2 text-sm">
                                {Object.entries({useRegex: 'Regex', caseSensitive: 'Match Case', wholeWord: 'Whole Word'}).map(([key, label]) => (
                                    <button key={key} onClick={() => dispatch({ type: 'SET_STATE', payload: { globalFindOptions: { ...globalFindOptions, [key]: !globalFindOptions[key as keyof typeof globalFindOptions] } } })} className={`px-3 py-1 rounded-md ${globalFindOptions[key as keyof typeof globalFindOptions] ? 'bg-primary-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{label}</button>
                                ))}
                            </div>
                        </div>
                        <div className="px-4 pb-2 text-sm text-slate-600 dark:text-slate-400 flex justify-between items-center">
                            <span>{globalMatches.length} result(s) found</span>
                             {globalMatches.length > 0 && <span>{currentGlobalMatchIndex + 1} / {globalMatches.length}</span>}
                        </div>
                        <ul className="flex-1 overflow-y-auto border-t border-b border-slate-200 dark:border-slate-700 list-none m-0 p-0">
                            {globalMatches.map((match, index) => (
                                <li key={`${match.chapterId}-${match.index}-${index}`} onClick={() => dispatch({ type: 'SET_STATE', payload: { currentGlobalMatchIndex: index }})} className={`p-3 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-b-0 ${index === currentGlobalMatchIndex ? 'bg-primary-500/20' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}>
                                    <div className="font-semibold truncate">{match.chapterTitle}</div>
                                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                        ...{match.text}...
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <footer className="p-4 flex justify-end gap-2">
                            <button onClick={handleGlobalReplace} disabled={currentGlobalMatchIndex < 0} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50">Replace</button>
                            <button onClick={() => { setReviewSelection(new Set(globalMatches.map((_, i) => i))); setReviewModalOpen(true); }} disabled={globalMatches.length === 0} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">Replace All</button>
                        </footer>
                    </div>
                </div>
            )}
            
            {/* Replace All Review Modal */}
            {isReviewModalOpen && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReviewModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <header className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h2 className="text-xl font-semibold">Review Replacements</h2>
                            <button onClick={() => setReviewModalOpen(false)} className="text-2xl">&times;</button>
                        </header>
                         <div className="p-3 bg-slate-100 dark:bg-slate-900/50 flex items-center gap-4">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={reviewSelection.size === globalMatches.length} onChange={e => setReviewSelection(e.target.checked ? new Set(globalMatches.map((_, i) => i)) : new Set())} /> {reviewSelection.size} of {globalMatches.length} selected</label>
                        </div>
                        <ul className="flex-1 overflow-y-auto list-none m-0 p-0">
                            {globalMatches.map((match, index) => {
                                const chapterContent = chapters.find(c => c.id === match.chapterId)?.content || '';
                                const contextStart = Math.max(0, match.index - 50);
                                const preContext = chapterContent.substring(contextStart, match.index);
                                const postContext = chapterContent.substring(match.index + match.length, match.index + match.length + 50);
                                return (
                                <li key={index} className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-start gap-3">
                                    <input type="checkbox" checked={reviewSelection.has(index)} onChange={e => setReviewSelection(s => { const n = new Set(s); e.target.checked ? n.add(index) : n.delete(index); return n;})} className="mt-1" />
                                    <div>
                                        <div className="font-semibold text-sm">{match.chapterTitle}</div>
                                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">...{preContext}<mark className="bg-red-200 dark:bg-red-800/50">{match.text}</mark>{postContext}...</div>
                                    </div>
                                </li>
                            )})}
                        </ul>
                        <footer className="p-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                             <button onClick={() => setReviewModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Cancel</button>
                            <button onClick={handleConfirmReplaceAll} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Confirm {reviewSelection.size} Replacements</button>
                        </footer>
                    </div>
                </div>
            )}

            {/* Mobile FAB */}
            <div className="md:hidden fixed bottom-5 right-5 z-30 flex flex-col items-center gap-3">
                {isFabOpen && (
                    <div className="flex flex-col items-center gap-3 p-2 bg-slate-700/50 backdrop-blur-sm rounded-xl">
                        <button onClick={() => { contentEditableRef.current && dispatch({ type: 'SPLIT_CHAPTER', payload: { cursorPosition: contentEditableRef.current.selectionStart } }); setFabOpen(false); }} className="bg-white/90 text-slate-800 rounded-full p-3 shadow-md" title="Split at Cursor"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button>
                        <button onClick={() => { dispatch({ type: 'SET_STATE', payload: { showFindReplace: !showFindReplace }}); setFabOpen(false); }} className="bg-white/90 text-slate-800 rounded-full p-3 shadow-md" title="Find/Replace"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>
                        <button onClick={() => { dispatch({ type: 'MERGE_CHAPTER_WITH_NEXT' }); setFabOpen(false); }} className="bg-white/90 text-slate-800 rounded-full p-3 shadow-md" title="Merge with Next"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a1 1 0 00-2 0v1H2a1 1 0 000 2h1v1a1 1 0 002 0v-1h1a1 1 0 000-2H5V8z"/><path d="M10.25 4.75a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zM12 10a2 2 0 11-4 0 2 2 0 014 0z"/><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" /></svg></button>
                    </div>
                )}
                <button onClick={() => setFabOpen(!isFabOpen)} className="bg-primary-600 text-white rounded-full p-4 shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 transition-transform duration-200 ${isFabOpen ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                </button>
            </div>
            
            {/* Batch Rename Modal */}
            {isBatchRenameModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setBatchRenameModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="p-4 font-semibold border-b border-slate-200 dark:border-slate-700">Batch Rename Chapters</h3>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="text-sm block mb-1">Pattern (use '{'n'}' for number):</label>
                                <input type="text" value={renamePattern} onChange={e => setRenamePattern(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5" />
                            </div>
                            <div>
                                <label className="text-sm block mb-1">Start Number:</label>
                                <input type="number" value={renameStartNum} onChange={e => setRenameStartNum(Number(e.target.value))} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-1.5" />
                            </div>
                        </div>
                        <div className="p-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700">
                            <button onClick={() => setBatchRenameModalOpen(false)} className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Cancel</button>
                            <button onClick={handleBatchRename} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">Rename</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};