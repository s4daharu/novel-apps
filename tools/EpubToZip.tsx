import React, { useReducer, useRef, useState } from 'react';
import JSZip from 'jszip';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';

const domParser = new DOMParser();

// Helper: Safely escape HTML
const escapeHTML = (str: string) => {
    const el = document.createElement('div');
    el.innerText = str;
    return el.innerHTML;
};

// Helper: Extract plain text from HTML string
const extractTextFromHtml = (htmlString: string): string => {
    const doc = domParser.parseFromString(htmlString, 'text/html');
    if (!doc.body) return '';
    let output = '';
    function traverse(node: Node) {
        if (node.nodeType === 3) { output += node.textContent; return; }
        if (node.nodeType !== 1) return;
        const tagName = (node as Element).tagName.toLowerCase();
        if (['script', 'style', 'header', 'footer', 'nav'].includes(tagName)) return;
        const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'hr'].includes(tagName);
        if (isBlock && output.length > 0 && !output.endsWith('\n\n')) { if (!output.endsWith('\n')) output += '\n'; output += '\n'; }
        if (tagName === 'br') output += '\n';
        for (const child of Array.from(node.childNodes)) traverse(child);
        if (isBlock && output.length > 0 && !output.endsWith('\n\n')) { if (!output.endsWith('\n')) output += '\n'; output += '\n'; }
    }
    traverse(doc.body);
    return output.replace(/\n{3,}/g, '\n\n').trim();
};

// Helper: Sanitize filename
const sanitizeFilenameForZip = (name: string): string => {
    if (!name) return 'download';
    return (name.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/__+/g, '_')).substring(0, 100) || 'file';
};

// State Management
interface TocEntry { title: string; href: string; id: string; }
interface State {
    epubFile: File | null; epubFileName: string; toc: TocEntry[];
    selectedChapters: Set<string>; // Set of hrefs
    removeLines: { enabled: boolean; count: number }; isLoading: boolean;
    status: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
}
type Action =
    | { type: 'SET_EPUB_FILE'; payload: { file: File, name: string } } | { type: 'CLEAR_EPUB_FILE' }
    | { type: 'SET_TOC'; payload: TocEntry[] } | { type: 'TOGGLE_CHAPTER'; payload: string }
    | { type: 'SELECT_ALL' } | { type: 'DESELECT_ALL' }
    | { type: 'SET_REMOVE_LINES'; payload: Partial<State['removeLines']> }
    | { type: 'SET_FIELD'; payload: { field: keyof State; value: any } } | { type: 'RESET' };

const initialState: State = {
    epubFile: null, epubFileName: '', toc: [], selectedChapters: new Set(),
    removeLines: { enabled: false, count: 1 }, isLoading: false, status: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_EPUB_FILE': return { ...state, epubFile: action.payload.file, epubFileName: action.payload.name, status: null };
        case 'CLEAR_EPUB_FILE': return { ...initialState };
        case 'SET_TOC': return { ...state, toc: action.payload, selectedChapters: new Set(action.payload.map(c => c.href)) };
        case 'TOGGLE_CHAPTER':
            const newSelection = new Set(state.selectedChapters);
            if (newSelection.has(action.payload)) newSelection.delete(action.payload);
            else newSelection.add(action.payload);
            return { ...state, selectedChapters: newSelection };
        case 'SELECT_ALL': return { ...state, selectedChapters: new Set(state.toc.map(c => c.href)) };
        case 'DESELECT_ALL': return { ...state, selectedChapters: new Set() };
        case 'SET_REMOVE_LINES': return { ...state, removeLines: { ...state.removeLines, ...action.payload } };
        case 'SET_FIELD': return { ...state, [action.payload.field]: action.payload.value };
        case 'RESET': return initialState;
        default: return state;
    }
}

const EpubToZip: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [zipInstance, setZipInstance] = useState<JSZip | null>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) { dispatch({ type: 'CLEAR_EPUB_FILE' }); return; }

        dispatch({ type: 'RESET' });
        dispatch({ type: 'SET_EPUB_FILE', payload: { file, name: file.name } });
        dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: true } });
        dispatch({ type: 'SET_FIELD', payload: { field: 'status', value: { message: `Reading ${file.name}...`, type: 'info' } } });
        
        try {
            const buffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(buffer);
            setZipInstance(zip);

            const containerXml = await zip.file('META-INF/container.xml')?.async('string');
            if (!containerXml) throw new Error("Could not find EPUB's container.xml.");

            const opfPath = domParser.parseFromString(containerXml, 'application/xml').querySelector('*|rootfile[full-path]')?.getAttribute('full-path');
            if (!opfPath) throw new Error("Could not find OPF path in container.xml.");
            
            const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';
            const opfContent = await zip.file(opfPath)?.async('string');
            if (!opfContent) throw new Error(`Could not read OPF file at ${opfPath}`);

            const opfDoc = domParser.parseFromString(opfContent, 'application/xml');
            
            const findTocHref = (): {href: string, type: 'nav' | 'ncx'} | null => {
                const navItem = opfDoc.querySelector('*|manifest > *|item[properties~="nav"]');
                if (navItem?.getAttribute('href')) return { href: navItem.getAttribute('href')!, type: 'nav' };
                const spineTocId = opfDoc.querySelector('*|spine[toc]')?.getAttribute('toc');
                if (spineTocId) {
                    const ncxItem = opfDoc.querySelector(`*|manifest > *|item[id="${spineTocId}"]`);
                    if (ncxItem?.getAttribute('href')) return { href: ncxItem.getAttribute('href')!, type: 'ncx' };
                }
                return null;
            };

            const tocInfo = findTocHref();
            if (!tocInfo?.href) throw new Error("No standard Table of Contents (NAV/NCX) found.");

            const tocPath = (opfDir ? `${opfDir}/` : '') + tocInfo.href;
            const tocContent = await zip.file(tocPath)?.async('string');
            if (!tocContent) throw new Error(`ToC file not found at ${tocPath}`);

            const tocDoc = domParser.parseFromString(tocContent, 'application/xml');
            let chapters: TocEntry[] = [];
            
            if (tocInfo.type === 'ncx') {
                tocDoc.querySelectorAll('*|navPoint').forEach((el, index) => {
                    const label = el.querySelector('*|navLabel > *|text')?.textContent?.trim();
                    const src = el.querySelector('*|content')?.getAttribute('src');
                    if(label && src) chapters.push({ title: label, href: (opfDir ? `${opfDir}/` : '') + src.split('#')[0], id: `chap-ncx-${index}` });
                });
            } else { // nav
                tocDoc.querySelectorAll('nav[epub\\:type="toc"] ol a[href], nav[*|type="toc"] ol a[href]').forEach((el, index) => {
                    const label = el.textContent?.trim();
                    const src = el.getAttribute('href');
                    if (label && src) chapters.push({ title: label, href: (opfDir ? `${opfDir}/` : '') + src.split('#')[0], id: `chap-nav-${index}` });
                });
            }
            
            const uniqueChapters = [...new Map(chapters.map(item => [item.href, item])).values()];

            if (uniqueChapters.length === 0) throw new Error("No chapters found in ToC.");
            
            dispatch({ type: 'SET_TOC', payload: uniqueChapters });
            dispatch({ type: 'SET_FIELD', payload: { field: 'status', value: { message: `Found ${uniqueChapters.length} chapters.`, type: 'success' } } });

        } catch (err: any) {
            showToast(`Error: ${err.message}`, true);
            dispatch({ type: 'SET_FIELD', payload: { field: 'status', value: { message: `Error: ${err.message}`, type: 'error' } } });
            dispatch({ type: 'CLEAR_EPUB_FILE' });
        } finally {
            dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: false } });
        }
    };
    
    const handleExtract = async () => {
        if (!zipInstance || state.selectedChapters.size === 0) { showToast('No chapters selected.', true); return; }
        dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: true } });
        try {
            const outputZip = new JSZip();
            let filesAdded = 0;
            const chaptersToExtract = state.toc.filter(c => state.selectedChapters.has(c.href));

            for (const [index, entry] of chaptersToExtract.entries()) {
                const chapterHtml = await zipInstance.file(entry.href)?.async('string');
                if (!chapterHtml) continue;
                let chapterText = extractTextFromHtml(chapterHtml);
                if (state.removeLines.enabled && state.removeLines.count > 0) {
                    chapterText = chapterText.split('\n').slice(state.removeLines.count).join('\n');
                }
                if (chapterText.trim()) {
                    const filename = `${String(index + 1).padStart(4, '0')}_${sanitizeFilenameForZip(entry.title)}.txt`;
                    outputZip.file(filename, chapterText);
                    filesAdded++;
                }
            }
            if (filesAdded === 0) throw new Error('No chapter content could be retrieved.');
            
            const zipBlob = await outputZip.generateAsync({ type: "blob" });
            const baseName = state.epubFileName.replace(/\.epub$/i, '') || 'epub_content';
            triggerDownload(zipBlob, `${sanitizeFilenameForZip(baseName)}_chapters.zip`, showToast);
            dispatch({ type: 'SET_FIELD', payload: { field: 'status', value: { message: `Download started for ${filesAdded} chapters.`, type: 'success' } } });
        } catch(err: any) {
            showToast(`Error: ${err.message}`, true);
        } finally {
            dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: false } });
        }
    };

    return (
        <div className="space-y-5">
            { /* JSX from original epub-to-zip.html adapted to React */ }
        </div>
    );
};

export default EpubToZip;
