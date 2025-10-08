
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload, getJSZip, escapeHTML } from '../utils/helpers';
import { Status } from '../utils/types';

export const NovelSplitter: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [step, setStep] = useState<'upload' | 'editor'>('upload');
    const [rawText, setRawText] = useState<string | null>(null);
    const [fileName, setFileName] = useState('');
    const [encoding, setEncoding] = useState('utf-8');
    const [splitRegex, setSplitRegex] = useState('^\\s*(第?\\s*[〇一二三四五六七八九十百千万零\\d]+\\s*[章章节回部卷])');
    const [matchedHeadings, setMatchedHeadings] = useState<string[]>([]);
    const [cleanupRules, setCleanupRules] = useState<{ id: number, find: string, replace: string }[]>([{ id: 1, find: '', replace: '' }]);
    
    type Chapter = { id: string; title: string; content: string; };
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
    
    const [meta, setMeta] = useState({ title: '', author: '', coverFile: null as File | null, coverURL: null as string | null, language: 'en' });
    const [status, setStatus] = useState<Status | null>(null);

    const [isFullScreen, setIsFullScreen] = useState(false);
    const contentEditableRef = useRef<HTMLTextAreaElement>(null);
    
    // Editor find/replace state
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [replaceQuery, setReplaceQuery] = useState('');
    
    // Drag-and-drop state for chapter list
    const draggedItem = useRef<Chapter | null>(null);
    const draggedOverItem = useRef<Chapter | null>(null);
    const [dragIndicator, setDragIndicator] = useState<{ id: string, position: 'top' | 'bottom' } | null>(null);

    const LOCAL_STORAGE_KEY = 'novelSplitterSession';

    const useDebouncedEffect = (effect: () => void, deps: any[], delay: number) => {
        useEffect(() => {
            const handler = setTimeout(() => effect(), delay);
            return () => clearTimeout(handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [JSON.stringify(deps)]);
    };
    
    // Save session to localStorage
    useDebouncedEffect(() => {
        if (step === 'editor') {
            const sessionData = {
                step, rawText, fileName, encoding, splitRegex, cleanupRules, chapters, selectedChapterId, meta: { ...meta, coverFile: null, coverURL: meta.coverURL }
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessionData));
        }
    }, [step, rawText, fileName, encoding, splitRegex, cleanupRules, chapters, selectedChapterId, meta], 1000);

    // Load session from localStorage on mount
    useEffect(() => {
        const savedSession = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (savedSession) {
            if (confirm('An unfinished session was found. Do you want to restore it?')) {
                const sessionData = JSON.parse(savedSession);
                setStep(sessionData.step);
                setRawText(sessionData.rawText);
                setFileName(sessionData.fileName);
                setEncoding(sessionData.encoding);
                setSplitRegex(sessionData.splitRegex);
                setCleanupRules(sessionData.cleanupRules);
                setChapters(sessionData.chapters);
                setSelectedChapterId(sessionData.selectedChapterId);
                setMeta({ ...sessionData.meta, coverFile: null }); // Don't restore file object
            } else {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
        }
    }, []);

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleNovelFile(files[0]);
        }
    };
    
    const handleNovelFile = async (file: File) => {
        showSpinner();
        try {
            const buffer = await file.arrayBuffer();
            const decoder = new TextDecoder(encoding, { fatal: true });
            const text = decoder.decode(buffer);
            setRawText(text);
            setFileName(file.name);
            setMeta(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, "") }));
            showToast(`Loaded ${file.name} successfully.`);
        } catch (error) {
            showToast(`Failed to decode file with ${encoding}. Try another encoding.`, true);
            setRawText(null);
            setFileName('');
        } finally {
            hideSpinner();
        }
    };

    const previewSplit = () => {
        if (!rawText || !splitRegex) return;
        try {
            const regex = new RegExp(splitRegex, 'gm');
            const matches = rawText.match(regex);
            setMatchedHeadings(matches || []);
        } catch (e) {
            setMatchedHeadings(['Invalid Regex']);
        }
    };

    const processNovel = () => {
        if (!rawText) return;
        showSpinner();
        try {
            // Apply cleanup
            let processedText = cleanupRules.reduce((text, rule) => {
                if (rule.find) {
                    try {
                        return text.replace(new RegExp(rule.find, 'g'), rule.replace);
                    } catch { return text; }
                }
                return text;
            }, rawText);

            // Split chapters
            const regex = new RegExp(splitRegex, 'gm');
            const titles = [...processedText.matchAll(regex)];
            const contents = processedText.split(regex).slice(1);
            
            const newChapters: Chapter[] = [];
            for (let i = 0; i < titles.length; i++) {
                newChapters.push({
                    id: `chap-${Date.now()}-${i}`,
                    title: titles[i][0].trim(),
                    content: (contents[i*2+1] || '').trim(),
                });
            }

            if (newChapters.length === 0) {
                newChapters.push({ id: `chap-${Date.now()}-0`, title: "Chapter 1", content: processedText });
            }

            setChapters(newChapters);
            setSelectedChapterId(newChapters[0]?.id || null);
            setStep('editor');
        } catch (e: any) {
            showToast(`Error processing novel: ${e.message}`, true);
        } finally {
            hideSpinner();
        }
    };
    
    // Editor functions
    const updateChapter = (id: string, newTitle: string, newContent: string) => {
        setChapters(chapters.map(c => c.id === id ? { ...c, title: newTitle, content: newContent } : c));
    };

    const handleMergeNext = () => {
        const currentIndex = chapters.findIndex(c => c.id === selectedChapterId);
        if (currentIndex === -1 || currentIndex >= chapters.length - 1) return;
        
        const currentChapter = chapters[currentIndex];
        const nextChapter = chapters[currentIndex + 1];
        const mergedContent = `${currentChapter.content}\n\n${nextChapter.title}\n\n${nextChapter.content}`;

        const newChapters = [...chapters];
        newChapters[currentIndex] = { ...currentChapter, content: mergedContent };
        newChapters.splice(currentIndex + 1, 1);
        setChapters(newChapters);
    };

    const handleSplitChapter = () => {
        if (!contentEditableRef.current) return;
        const cursorPosition = contentEditableRef.current.selectionStart;
        const currentIndex = chapters.findIndex(c => c.id === selectedChapterId);
        if (currentIndex === -1) return;
        
        const currentChapter = chapters[currentIndex];
        const content1 = currentChapter.content.substring(0, cursorPosition).trim();
        const content2 = currentChapter.content.substring(cursorPosition).trim();
        
        if (!content1 || !content2) return showToast("Cannot split at the beginning or end.", true);

        const newChapter: Chapter = { id: `chap-${Date.now()}`, title: `${currentChapter.title} (Split)`, content: content2 };
        
        const newChapters = [...chapters];
        newChapters[currentIndex] = { ...currentChapter, content: content1 };
        newChapters.splice(currentIndex + 1, 0, newChapter);
        
        setChapters(newChapters);
        setSelectedChapterId(newChapter.id);
    };
    
    const handleFindReplace = (isReplaceAll: boolean) => {
        const currentChapter = chapters.find(c => c.id === selectedChapterId);
        if (!currentChapter || !findQuery) return;
        try {
            const regex = new RegExp(findQuery, isReplaceAll ? 'g' : '');
            const newContent = currentChapter.content.replace(regex, replaceQuery);
            updateChapter(currentChapter.id, currentChapter.title, newContent);
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
            epubZip.folder("META-INF").file("container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
            const oebps = epubZip.folder("OEBPS");
            oebps.folder("css").file("style.css", "body{font-family:sans-serif;line-height:1.6;} h2{text-align:center;font-weight:bold;} p{text-indent:1.5em; margin-top:0; margin-bottom:0; text-align:justify;} p+p{margin-top: 1em;}");
            
            const manifestItems: any[] = [{ id: "css", href: "css/style.css", "media-type": "text/css" }, { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }];
            const spineItems: any[] = [];
            
            if (meta.coverFile) {
                const ext = meta.coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const mediaType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                oebps.folder("images").file(`cover.${ext}`, await meta.coverFile.arrayBuffer());
                manifestItems.push({ id: "cover-image", href: `images/cover.${ext}`, "media-type": mediaType, properties: "cover-image" });
                oebps.folder("text").file("cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="text-align:center;margin:0;padding:0;"><img src="../images/cover.${ext}" alt="Cover" style="max-width:100%;max-height:100vh;object-fit:contain;"/></body></html>`);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }
            
            const textToXHTML = (text: string, chapterTitle: string) => {
                const bodyContent = text.split('\n').filter(line => line.trim()).map(line => `<p>${escapeHTML(line)}</p>`).join('\n');
                return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${meta.language}"><head><title>${escapeHTML(chapterTitle)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><h2>${escapeHTML(chapterTitle)}</h2>${bodyContent}</body></html>`;
            };

            chapters.forEach((chapter, i) => {
                const filename = `chapter_${i + 1}.xhtml`;
                oebps.folder("text").file(filename, textToXHTML(chapter.content, chapter.title));
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
        if (isFullScreen) {
            document.body.classList.add('fullscreen-editor');
            document.documentElement.requestFullscreen?.();
        } else {
            document.body.classList.remove('fullscreen-editor');
            if(document.fullscreenElement) document.exitFullscreen?.();
        }
        return () => document.body.classList.remove('fullscreen-editor');
    }, [isFullScreen]);

    // Drag and drop handlers for chapter list
    const handleDragSort = () => {
        if (!draggedItem.current || !draggedOverItem.current || draggedItem.current.id === draggedOverItem.current.id) {
            setDragIndicator(null);
            return;
        }
        const items = [...chapters];
        const draggedItemIndex = items.findIndex(c => c.id === draggedItem.current!.id);
        const draggedOverItemIndex = items.findIndex(c => c.id === draggedOverItem.current!.id);
        
        items.splice(draggedItemIndex, 1);
        const newIndex = dragIndicator?.position === 'bottom' ? draggedOverItemIndex + 1 : draggedOverItemIndex;
        items.splice(newIndex, 0, draggedItem.current);
        
        setChapters(items);
        draggedItem.current = null;
        draggedOverItem.current = null;
        setDragIndicator(null);
    };


    const currentChapter = useMemo(() => chapters.find(c => c.id === selectedChapterId), [chapters, selectedChapterId]);

    if (step === 'upload') {
        return (
            <div id="novelSplitterApp" className="tool-section">
                <div className="wrap">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Novel Splitter</h1>
                    <div className="card">
                        <label>1. Upload Novel File (.txt)</label>
                        <div
                            className="drop-zone text-center p-4"
                            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
                            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
                            onDrop={handleFileDrop}>
                            <input type="file" accept=".txt" onChange={e => e.target.files && handleNovelFile(e.target.files[0])} id="novelFile" />
                            <label htmlFor="novelFile" className="cursor-pointer">{fileName || "Drag & drop .txt file here, or click to select"}</label>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            <label className="text-sm" htmlFor="encodingSelect">Encoding:</label>
                            <select id="encodingSelect" value={encoding} onChange={e => setEncoding(e.target.value)} className="text-sm !w-auto">
                                <option value="utf-8">UTF-8</option>
                                <option value="gbk">GBK</option>
                                <option value="big5">Big5</option>
                            </select>
                        </div>
                    </div>
                    <div className="card mt-4">
                        <label>2. Cleanup Rules (Regex)</label>
                        {cleanupRules.map((rule, index) => (
                            <div key={rule.id} className="rule-item">
                                <input type="text" placeholder="Find pattern" value={rule.find} onChange={e => setCleanupRules(rules => rules.map(r => r.id === rule.id ? { ...r, find: e.target.value } : r))} />
                                <input type="text" placeholder="Replace with" value={rule.replace} onChange={e => setCleanupRules(rules => rules.map(r => r.id === rule.id ? { ...r, replace: e.target.value } : r))} />
                                <button onClick={() => setCleanupRules(rules => rules.filter(r => r.id !== rule.id))} disabled={cleanupRules.length === 1}>-</button>
                            </div>
                        ))}
                        <button onClick={() => setCleanupRules(rules => [...rules, { id: Date.now(), find: '', replace: '' }])} className="small-btn">+</button>
                    </div>
                    <div className="card mt-4">
                         <label>3. Chapter Splitting (Regex)</label>
                         <input type="text" value={splitRegex} onChange={e => setSplitRegex(e.target.value)} />
                         <div className="btns">
                            <button onClick={previewSplit}>Preview Matches</button>
                         </div>
                         {matchedHeadings.length > 0 && <div className="status max-h-32 overflow-y-auto text-xs">{matchedHeadings.map((h, i) => <div key={i}>{h}</div>)}</div>}
                    </div>
                    <div className="mt-6 flex justify-center">
                        <button className="primary" onClick={processNovel} disabled={!rawText}>Process Novel</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div id="novelSplitterApp" className="tool-section">
            <div className="wrap">
                <div id="editorView">
                    <div className="editor-controls">
                        <div className="left-controls">
                            <input type="text" placeholder="Book Title" value={meta.title} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))} className="!w-48"/>
                            <input type="text" placeholder="Author" value={meta.author} onChange={e => setMeta(m => ({ ...m, author: e.target.value }))} className="!w-48"/>
                        </div>
                        <div className="right-controls btns">
                             <button onClick={exportToZip}>Export ZIP</button>
                             <button onClick={exportToEpub}>Export EPUB</button>
                             <button onClick={() => setStep('upload')}>Back</button>
                        </div>
                    </div>
                    <p className="small muted">Total Chapters: {chapters.length}</p>

                    <div className="editor-grid">
                        <div className="chapter-list-container">
                            <div className="list-header">Chapters</div>
                            <ul id="chapterList">
                                {chapters.map(chapter => (
                                    <li key={chapter.id}
                                        onClick={() => setSelectedChapterId(chapter.id)}
                                        className={`${selectedChapterId === chapter.id ? 'selected' : ''} ${dragIndicator?.id === chapter.id ? `drag-over-${dragIndicator.position}` : ''}`}
                                        draggable
                                        onDragStart={() => (draggedItem.current = chapter)}
                                        onDragEnter={(e) => {
                                            draggedOverItem.current = chapter;
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const position = e.clientY - rect.top > rect.height / 2 ? 'bottom' : 'top';
                                            setDragIndicator({ id: chapter.id, position });
                                        }}
                                        onDragEnd={handleDragSort}
                                        onDragOver={e => e.preventDefault()}>
                                        <input type="text" value={chapter.title} onChange={e => updateChapter(chapter.id, e.target.value, chapter.content)} className="chapter-title" />
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="chapter-editor-container" id="chapterEditorContainer">
                            <div className="editor-toolbar btns">
                                <button onClick={handleMergeNext}>Merge with Next</button>
                                <button onClick={handleSplitChapter}>Split at Cursor</button>
                                <button onClick={() => setShowFindReplace(!showFindReplace)}>Find/Replace</button>
                                <div className="flex-grow"></div>
                                <button onClick={() => setIsFullScreen(!isFullScreen)}>{isFullScreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
                            </div>
                             {showFindReplace && (
                                <div className="find-replace-widget">
                                    <input type="text" placeholder="Find" value={findQuery} onChange={e => setFindQuery(e.target.value)} />
                                    <input type="text" placeholder="Replace" value={replaceQuery} onChange={e => setReplaceQuery(e.target.value)} />
                                    <div className="btns">
                                        <button onClick={() => handleFindReplace(false)}>Replace</button>
                                        <button onClick={() => handleFindReplace(true)}>All</button>
                                    </div>
                                </div>
                            )}
                            <textarea id="chapterContent" ref={contentEditableRef} value={currentChapter?.content || ''} onChange={e => currentChapter && updateChapter(currentChapter.id, currentChapter.title, e.target.value)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
