import React, { useState, useEffect, useRef, useMemo, useReducer } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload, getJSZip, escapeHTML } from '../utils/helpers';

// Types
type Chapter = { id: string; title: string; content: string; };
type Meta = { title: string; author: string; coverFile: File | null; coverURL: string | null; language: string; };
type CleanupRule = { id: number; find: string; replace: string; };
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
    isFullScreen: boolean;
    showFindReplace: boolean;
    findQuery: string;
    replaceQuery: string;
    isChapterNavOpen: boolean;
};
type Action =
    | { type: 'SET_STATE'; payload: Partial<State> }
    | { type: 'SET_RAW_TEXT'; payload: { text: string | null; fileName: string; title: string } }
    | { type: 'UPDATE_RULE'; payload: { id: number; find?: string; replace?: string } }
    | { type: 'ADD_RULE' }
    | { type: 'DELETE_RULE'; payload: number }
    | { type: 'SET_CHAPTERS'; payload: Chapter[] }
    | { type: 'UPDATE_CHAPTER'; payload: { id: string; title?: string; content?: string } }
    | { type: 'REORDER_CHAPTERS', payload: Chapter[] }
    | { type: 'SET_META'; payload: Partial<Meta> }
    | { type: 'MERGE_CHAPTER_WITH_NEXT' }
    | { type: 'SPLIT_CHAPTER'; payload: { cursorPosition: number } };

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
    isFullScreen: false,
    showFindReplace: false,
    findQuery: '',
    replaceQuery: '',
    isChapterNavOpen: false,
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
        default:
            return state;
    }
};

export const NovelSplitter: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [state, dispatch] = useReducer(reducer, initialState);
    const { step, rawText, fileName, encoding, splitRegex, matchedHeadings, cleanupRules, chapters, selectedChapterId, meta, isFullScreen, showFindReplace, findQuery, replaceQuery, isChapterNavOpen } = state;
    const [isCleanupOpen, setCleanupOpen] = useState(false);
    const [isSplitPreviewOpen, setSplitPreviewOpen] = useState(false);
    const [isActionsMenuOpen, setActionsMenuOpen] = useState(false);
    const contentEditableRef = useRef<HTMLTextAreaElement>(null);
    const draggedItem = useRef<Chapter | null>(null);
    const [dragIndicator, setDragIndicator] = useState<{ id: string, position: 'top' | 'bottom' } | null>(null);

    const LOCAL_STORAGE_KEY = 'novelSplitterSession';

    const sessionDataToSave = useMemo(() => {
        if (step !== 'editor') return null;
        
        const { coverFile, ...metaToSave } = meta; 
        const sessionData = { ...state, meta: metaToSave };
        
        if (sessionData.chapters.length > 0) {
            sessionData.rawText = null;
        }

        return JSON.stringify(sessionData);
    }, [state, step, meta]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (sessionDataToSave) {
                localStorage.setItem(LOCAL_STORAGE_KEY, sessionDataToSave);
            }
        }, 1000);

        return () => clearTimeout(handler);
    }, [sessionDataToSave]);

    useEffect(() => {
        const savedSession = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedSession) {
            if (confirm('An unfinished session was found. Do you want to restore it?')) {
                const sessionData = JSON.parse(savedSession);
                dispatch({ type: 'SET_STATE', payload: { ...sessionData, meta: { ...sessionData.meta, coverFile: null } } });
            } else {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        }
    }, []);

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.classList.remove('ring-2', 'ring-primary-500');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) handleNovelFile(files[0]);
    };
    
    const handleNovelFile = async (file: File) => {
        showSpinner();
        try {
            const buffer = await file.arrayBuffer();
            const decoder = new TextDecoder(encoding, { fatal: true });
            const text = decoder.decode(buffer);
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
            const regex = new RegExp(splitRegex, 'gm');
            const matches = rawText.match(regex);
            dispatch({ type: 'SET_STATE', payload: { matchedHeadings: matches || [] } });
        } catch (e) {
            dispatch({ type: 'SET_STATE', payload: { matchedHeadings: ['Invalid Regex'] } });
        }
    };

    const processNovel = () => {
        if (!rawText) return;
        showSpinner();
        try {
            let processedText = cleanupRules.reduce((text, rule) => {
                if (rule.find) {
                    try {
                        return text.replace(new RegExp(rule.find, 'g'), rule.replace);
                    } catch { return text; }
                }
                return text;
            }, rawText);

            const regex = new RegExp(splitRegex, 'gm');
            const titles = [...processedText.matchAll(regex)];
            const contents = processedText.split(regex);
            
            const newChapters: Chapter[] = [];

            const prefaceContent = contents[0]?.trim();
            if (prefaceContent) {
                newChapters.push({
                    id: `chap-${Date.now()}-preface`,
                    title: 'Preface',
                    content: prefaceContent,
                });
            }

            titles.forEach((title, i) => {
                newChapters.push({
                    id: `chap-${Date.now()}-${i}`,
                    title: title[0].trim(),
                    content: (contents[(i * 2) + 2] || '').trim(),
                });
            });

            if (newChapters.length === 0 && processedText) {
                newChapters.push({ id: `chap-${Date.now()}-0`, title: "Chapter 1", content: processedText });
            }
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
            const regex = new RegExp(findQuery, isReplaceAll ? 'g' : '');
            const newContent = currentChapter.content.replace(regex, replaceQuery);
            dispatch({ type: 'UPDATE_CHAPTER', payload: { id: currentChapter.id, content: newContent } });
        } catch (e) {
            showToast('Invalid find regex', true);
        }
    };

    const exportToZip = async () => {
        showSpinner();
        try {
            const JSZip = await getJSZip();
            const zip = new JSZip();
            chapters.forEach((chapter, index) => {
                const filename = `${String(index + 1).padStart(3, '0')}-${chapter.title.replace(/[^\w\s.-]/g, '').slice(0, 50)}.txt`;
                zip.file(filename, chapter.content);
            });
            const blob = await zip.generateAsync({ type: 'blob' });
            triggerDownload(blob, `${meta.title || 'novel'}.zip`);
        } catch (e: any) {
            showToast(`Failed to generate ZIP: ${e.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    const exportToEpub = async () => {
        showSpinner();
        try {
            const JSZip = await getJSZip();
            const epubZip = new JSZip();
            epubZip.file("mimetype", "application/epub+zip", { compression: "STORE" });
            epubZip.folder("META-INF")!.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
            const oebps = epubZip.folder("OEBPS")!;
            oebps.folder("css")!.file("style.css", "body{font-family:sans-serif;line-height:1.6;} h2{text-align:center;font-weight:bold;} p{text-indent:1.5em; margin-top:0; margin-bottom:0; text-align:justify;} p+p{margin-top: 1em;}");
            
            const manifestItems: any[] = [{ id: "css", href: "css/style.css", "media-type": "text/css" }, { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }];
            const spineItems: any[] = [];
            
            if (meta.coverFile) {
                const ext = meta.coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const mediaType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                oebps.folder("images")!.file(`cover.${ext}`, await meta.coverFile.arrayBuffer());
                manifestItems.push({ id: "cover-image", href: `images/cover.${ext}`, "media-type": mediaType, properties: "cover-image" });
                oebps.folder("text")!.file("cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="text-align:center;margin:0;padding:0;"><img src="../images/cover.${ext}" alt="Cover" style="max-width:100%;max-height:100vh;object-fit:contain;"/></body></html>`);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }
            
            const textToXHTML = (text: string, chapterTitle: string) => {
                const bodyContent = text.split('\n').filter(line => line.trim()).map(line => `<p>${escapeHTML(line)}</p>`).join('\n');
                return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${meta.language}"><head><title>${escapeHTML(chapterTitle)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><h2>${escapeHTML(chapterTitle)}</h2>${bodyContent}</body></html>`;
            };

            chapters.forEach((chapter, i) => {
                const filename = `chapter_${i + 1}.xhtml`;
                oebps.folder("text")!.file(filename, textToXHTML(chapter.content, chapter.title));
                manifestItems.push({ id: `chapter-${i + 1}`, href: `text/${filename}`, "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: `chapter-${i + 1}` });
            });
            
            const navLiItems = chapters.map((c, i) => `<li><a href="text/chapter_${i+1}.xhtml">${escapeHTML(c.title)}</a></li>`).join("\n");
            oebps.file("nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navLiItems}</ol></nav></body></html>`);

            const contentOPF = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>${escapeHTML(meta.title)}</dc:title><dc:language>${escapeHTML(meta.language)}</dc:language><dc:creator>${escapeHTML(meta.author)}</dc:creator><meta property="dcterms:modified">${new Date().toISOString()}</meta>${meta.coverFile ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifestItems.map(item => `<item id="${item.id}" href="${item.href}" media-type="${item["media-type"]}" ${item.properties ? `properties="${item.properties}"` : ''}/>`).join("")}</manifest><spine>${spineItems.map(item => `<itemref idref="${item.idref}" ${item.linear ? `linear="${item.linear}"` : ''}/>`).join("")}</spine></package>`;
            oebps.file("content.opf", contentOPF);

            const epubBlob = await epubZip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
            triggerDownload(epubBlob, `${meta.title.replace(/[^a-z0-9]/gi, '_')}.epub`);
            showToast('EPUB created successfully!');
        } catch (e: any) {
            showToast(`Failed to generate EPUB: ${e.message}`, true);
        } finally {
            hideSpinner();
        }
    };
    
    useEffect(() => {
        const root = document.documentElement;
        if (isFullScreen) {
            root.classList.add('fullscreen-active');
            root.requestFullscreen?.().catch(err => console.error(err));
        } else {
            root.classList.remove('fullscreen-active');
            if (document.fullscreenElement) document.exitFullscreen?.();
        }
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                dispatch({ type: 'SET_STATE', payload: { isFullScreen: false } });
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            root.classList.remove('fullscreen-active');
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [isFullScreen]);

    const handleDragSort = (draggedOverItem: Chapter) => {
        if (!draggedItem.current || !draggedOverItem || draggedItem.current.id === draggedOverItem.id) {
            setDragIndicator(null);
            return;
        }
        const items = [...chapters];
        const draggedItemIndex = items.findIndex(c => c.id === draggedItem.current!.id);
        const draggedOverItemIndex = items.findIndex(c => c.id === draggedOverItem.id);
        
        items.splice(draggedItemIndex, 1);
        const newIndex = dragIndicator?.position === 'bottom' ? draggedOverItemIndex + 1 : draggedOverItemIndex;
        items.splice(newIndex, 0, draggedItem.current);
        
        dispatch({ type: 'REORDER_CHAPTERS', payload: items });
        draggedItem.current = null;
        setDragIndicator(null);
    };

    const handleMoveChapter = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === chapters.length - 1)) {
            return;
        }
        const newChapters = [...chapters];
        const item = newChapters.splice(index, 1)[0];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        newChapters.splice(newIndex, 0, item);
        dispatch({ type: 'REORDER_CHAPTERS', payload: newChapters });
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
                 <button type="button" onClick={() => setCleanupOpen(!isCleanupOpen)} className="w-full flex justify-between items-center font-semibold text-slate-800 dark:text-slate-200">
                    2. Cleanup Rules (Regex)
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform ${isCleanupOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                 </button>
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
        <div className={`transition-all duration-300 ${isFullScreen ? 'bg-slate-50 dark:bg-slate-900 fixed inset-0 z-50' : 'max-w-7xl mx-auto p-2 md:p-4'}`}>
            <div className={`flex flex-col ${isFullScreen ? 'h-screen' : 'min-h-[75vh]'}`}>
                <header className={`flex-shrink-0 flex flex-col sm:flex-row sm:flex-wrap items-center justify-between gap-y-2 gap-x-4 p-2 mb-2 ${isFullScreen ? 'px-4 pt-4' : ''}`}>
                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                        <input type="text" placeholder="Book Title" value={meta.title} onChange={e => dispatch({ type: 'SET_META', payload: { title: e.target.value } })} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-1.5 text-lg font-semibold w-full sm:w-48"/>
                        <input type="text" placeholder="Author" value={meta.author} onChange={e => dispatch({ type: 'SET_META', payload: { author: e.target.value } })} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-1.5 w-full sm:w-48"/>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                         <button onClick={exportToZip} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Export ZIP</button>
                         <button onClick={exportToEpub} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Export EPUB</button>
                         <button onClick={() => dispatch({ type: 'SET_STATE', payload: { step: 'upload' } })} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Back</button>
                    </div>
                </header>

                <div className={`flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 ${isFullScreen ? 'md:grid-cols-[350px_1fr]' : ''}`}>
                    {/* Mobile Chapter Nav Toggle */}
                     <button onClick={() => dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: true }})} className="md:hidden fixed bottom-4 right-4 z-30 bg-primary-600 text-white rounded-full p-3 shadow-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                    
                    {/* Chapter List */}
                    <div className={`fixed inset-0 z-40 md:static md:block bg-black/30 md:bg-transparent transition-opacity duration-300 ${isChapterNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto'}`} onClick={() => dispatch({ type: 'SET_STATE', payload: { isChapterNavOpen: false }})}>
                        <div className={`absolute top-0 left-0 h-full w-64 md:w-full bg-slate-100 dark:bg-slate-800 md:bg-white/70 md:dark:bg-slate-800/50 backdrop-blur-sm border-r md:border border-slate-200 dark:border-slate-700 rounded-r-lg md:rounded-xl shadow-lg flex flex-col transform transition-transform duration-300 ${isChapterNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`} onClick={e => e.stopPropagation()}>
                            <div className="p-4 border-b border-slate-200 dark:border-slate-700 font-semibold">Chapters ({chapters.length})</div>
                            <ul className="flex-1 overflow-y-auto p-2 list-none">
                                {chapters.map((chapter, index) => (
                                    <li key={chapter.id} 
                                        className={`p-1 rounded-md cursor-pointer ${selectedChapterId === chapter.id ? 'bg-primary-500 text-white' : 'hover:bg-slate-200 dark:hover:bg-slate-700'} ${dragIndicator?.id === chapter.id ? (dragIndicator.position === 'top' ? 'border-t-2 border-primary-500' : 'border-b-2 border-primary-500') : ''}`}
                                        draggable onDragStart={() => (draggedItem.current = chapter)} onDragEnd={() => handleDragSort(chapter)} onDragOver={e => { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); setDragIndicator({ id: chapter.id, position: e.clientY - rect.top > rect.height / 2 ? 'bottom' : 'top' }); }}>
                                        <div onClick={() => { dispatch({ type: 'SET_STATE', payload: { selectedChapterId: chapter.id, isChapterNavOpen: false } }); }} className="flex items-center">
                                            <div className="flex-grow">
                                                <input type="text" value={chapter.title} onClick={e => e.stopPropagation()} onChange={e => dispatch({ type: 'UPDATE_CHAPTER', payload: { id: chapter.id, title: e.target.value } })} className="w-full bg-transparent outline-none border-none p-1 rounded focus:bg-white/20" />
                                            </div>
                                            <div className="flex flex-col ml-1">
                                                <button onClick={(e) => { e.stopPropagation(); handleMoveChapter(index, 'up'); }} disabled={index === 0} className="p-2 disabled:opacity-20">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleMoveChapter(index, 'down'); }} disabled={index === chapters.length - 1} className="p-2 disabled:opacity-20">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7 7" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    
                    {/* Editor Panel */}
                    <div className="flex flex-col gap-2">
                        <div className="flex-shrink-0 flex items-center gap-2">
                            {/* Mobile Actions Dropdown */}
                            <div className="relative md:hidden">
                                <button onClick={() => setActionsMenuOpen(!isActionsMenuOpen)} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">More Actions</button>
                                {isActionsMenuOpen && (
                                    <div className="absolute top-full mt-2 left-0 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 z-10 w-48">
                                        <button onClick={() => { dispatch({ type: 'MERGE_CHAPTER_WITH_NEXT' }); setActionsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600">Merge with Next</button>
                                        <button onClick={() => { contentEditableRef.current && dispatch({ type: 'SPLIT_CHAPTER', payload: { cursorPosition: contentEditableRef.current.selectionStart } }); setActionsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600">Split at Cursor</button>
                                    </div>
                                )}
                            </div>
                            {/* Desktop Actions */}
                            <div className="hidden md:flex flex-wrap items-center gap-2">
                                <button onClick={() => dispatch({ type: 'MERGE_CHAPTER_WITH_NEXT' })} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Merge with Next</button>
                                <button onClick={() => contentEditableRef.current && dispatch({ type: 'SPLIT_CHAPTER', payload: { cursorPosition: contentEditableRef.current.selectionStart } })} className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500">Split at Cursor</button>
                            </div>
                            <div className="flex-grow"></div>
                            <button onClick={() => dispatch({ type: 'SET_STATE', payload: { showFindReplace: !showFindReplace }})} className="p-2 rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500" title="Find/Replace">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </button>
                            <button onClick={() => dispatch({ type: 'SET_STATE', payload: { isFullScreen: !isFullScreen }})} className="p-2 rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500" title={isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
                                {isFullScreen ? 
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H4v4m12 0V4h-4M8 20H4v-4m12 0v4h-4" /></svg> : 
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4m12 4V4h-4M4 16v4h4m12-4v4h-4" /></svg>
                                }
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
                        <textarea ref={contentEditableRef} value={currentChapter?.content || ''} onChange={e => currentChapter && dispatch({ type: 'UPDATE_CHAPTER', payload: { id: currentChapter.id, content: e.target.value } })} className="flex-1 w-full resize-none p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none font-mono text-base leading-relaxed" />
                    </div>
                </div>
            </div>
        </div>
    );
};