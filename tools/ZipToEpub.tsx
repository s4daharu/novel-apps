import React, { useReducer, useRef } from 'react';
import JSZip from 'jszip';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';

// Helper: Escape HTML
const escapeHTML = (str: string) => {
    if (typeof str !== 'string') return '';
    const lookup: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
    return str.replace(/[&<>"']/g, (c) => lookup[c]);
};

// Helper: Generate a UUID
const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
});

// Helper: Clean title from filename
const cleanTitleFromFilename = (filename: string): string => {
    let title = filename
        .replace(/\.txt$/i, '')
        .replace(/^[0-9\s._-]+/, '')
        .replace(/[_-]/g, ' ')
        .trim();
    return title.charAt(0).toUpperCase() + title.slice(1) || "Untitled Chapter";
};

// Helper: Text to XHTML
const textToXHTML = (text: string, chapterTitle: string, useMarkdown: boolean, language: string): string => {
    const heading = `<h2>${escapeHTML(chapterTitle)}</h2>\n`;
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const bodyContent = lines
        .map(line => line.trim())
        .filter(Boolean)
        .map(trimmedLine => `<p>${escapeHTML(trimmedLine)}</p>`)
        .join('\n    ');

    const finalBody = bodyContent.trim() ? bodyContent : '    <p>&nbsp;</p>\n';

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeHTML(language)}">
<head>
  <title>${escapeHTML(chapterTitle)}</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css" />
</head>
<body>
  <section epub:type="chapter">\n${heading}${finalBody}  </section>
</body>
</html>`;
};

// State Management
interface Chapter { name: string; content: string; title: string; }
interface State {
    zipFile: File | null; zipFileName: string; coverFile: File | null; coverFileName: string;
    chapters: Chapter[]; epubTitle: string; epubAuthor: string; epubLanguage: string;
    processMarkdown: boolean; isLoading: boolean; status: { message: string; type: 'success' | 'error' | 'info' } | null;
}
type Action =
    | { type: 'SET_ZIP_FILE'; payload: { file: File, name: string } } | { type: 'CLEAR_ZIP_FILE' }
    | { type: 'SET_COVER_FILE'; payload: { file: File | null, name: string } }
    | { type: 'SET_CHAPTERS'; payload: Chapter[] }
    | { type: 'UPDATE_CHAPTER_TITLE'; payload: { name: string; title: string } }
    | { type: 'REORDER_CHAPTERS'; payload: Chapter[] }
    | { type: 'SET_FIELD'; payload: { field: keyof State; value: any } };

const initialState: State = {
    zipFile: null, zipFileName: '', coverFile: null, coverFileName: '', chapters: [],
    epubTitle: 'My Novel', epubAuthor: 'Unknown Author', epubLanguage: 'en',
    processMarkdown: false, isLoading: false, status: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_ZIP_FILE': return { ...state, zipFile: action.payload.file, zipFileName: action.payload.name, status: null };
        case 'CLEAR_ZIP_FILE': return { ...initialState };
        case 'SET_COVER_FILE': return { ...state, coverFile: action.payload.file, coverFileName: action.payload.name };
        case 'SET_CHAPTERS': return { ...state, chapters: action.payload };
        case 'UPDATE_CHAPTER_TITLE': return { ...state, chapters: state.chapters.map(c => c.name === action.payload.name ? { ...c, title: action.payload.title } : c) };
        case 'REORDER_CHAPTERS': return { ...state, chapters: action.payload };
        case 'SET_FIELD': return { ...state, [action.payload.field]: action.payload.value };
        default: return state;
    }
}

const ZipToEpub: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const zipInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const draggedItem = useRef<HTMLElement | null>(null);

    const handleZipChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) { dispatch({type: 'CLEAR_ZIP_FILE'}); return; }

        dispatch({ type: 'SET_ZIP_FILE', payload: { file, name: file.name } });
        dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: true } });
        try {
            const zip = await JSZip.loadAsync(file);
            const chapterPromises: Promise<Chapter>[] = [];
            zip.forEach((path, zipEntry) => {
                if (!zipEntry.dir && path.toLowerCase().endsWith('.txt')) {
                    chapterPromises.push(
                        zipEntry.async('string').then(text => ({
                            name: zipEntry.name,
                            content: text,
                            title: cleanTitleFromFilename(zipEntry.name)
                        }))
                    );
                }
            });
            const loadedChapters = await Promise.all(chapterPromises);
            if (loadedChapters.length === 0) throw new Error("No .txt files found in ZIP.");
            
            loadedChapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
            dispatch({ type: 'SET_CHAPTERS', payload: loadedChapters });

        } catch (err: any) {
            showToast(`Error reading ZIP: ${err.message}`, true);
            dispatch({ type: 'CLEAR_ZIP_FILE' });
        } finally {
            dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: false } });
        }
    };
    
    const handleCreateEpub = async () => {
        if (state.chapters.length === 0) { showToast("No chapters to create an EPUB.", true); return; }
        if (!state.epubTitle) { showToast("EPUB Title is required.", true); return; }
        if (!state.epubAuthor) { showToast("Author is required.", true); return; }

        dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: true } });
        try {
            const epubZip = new JSZip();
            epubZip.file("mimetype", "application/epub+zip", { compression: "STORE" });
            epubZip.folder("META-INF")?.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
            const oebps = epubZip.folder("OEBPS")!;
            oebps.folder("css")?.file("style.css", `body{font-family:sans-serif;line-height:1.6;margin:1em;}h1,h2{text-align:center;line-height:1.3;}p{text-indent:1.5em;margin:0 0 .5em;text-align:justify;}.cover{text-align:center;margin:0;padding:0;height:100vh;page-break-after:always;}.cover img{max-width:100%;max-height:100vh;object-fit:contain;}`);

            let manifestItems: any[] = [{ id: "css", href: "css/style.css", "media-type": "text/css" }, { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }];
            let spineItems: any[] = [];
            
            if (state.coverFile) {
                const ext = state.coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const mediaType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
                const coverData = await state.coverFile.arrayBuffer();
                oebps.folder("images")?.file(`cover.${ext}`, coverData);
                manifestItems.push({ id: "cover-image", href: `images/cover.${ext}`, "media-type": mediaType, properties: "cover-image" });
                const coverXHTML = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Cover</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><div class="cover"><img src="../images/cover.${ext}" alt="Cover Image"/></div></body></html>`;
                oebps.folder("text")?.file("cover.xhtml", coverXHTML);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }

            state.chapters.forEach((chapter, i) => {
                const filename = `chapter_${i + 1}.xhtml`;
                const xhtml = textToXHTML(chapter.content, chapter.title, state.processMarkdown, state.epubLanguage);
                oebps.folder("text")?.file(filename, xhtml);
                manifestItems.push({ id: `chapter-${i + 1}`, href: `text/${filename}`, "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: `chapter-${i + 1}` });
            });
            
            const navLiItems = state.chapters.map((c, i) => `<li><a href="text/chapter_${i+1}.xhtml">${escapeHTML(c.title)}</a></li>`).join("\n      ");
            const navXHTML = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Table of Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navLiItems}</ol></nav></body></html>`;
            oebps.file("nav.xhtml", navXHTML);

            const contentOPF = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">urn:uuid:${generateUUID()}</dc:identifier><dc:title>${escapeHTML(state.epubTitle)}</dc:title><dc:language>${escapeHTML(state.epubLanguage)}</dc:language><dc:creator>${escapeHTML(state.epubAuthor)}</dc:creator><meta property="dcterms:modified">${new Date().toISOString().split('.')[0]+'Z'}</meta>${state.coverFile ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifestItems.map(item => `<item id="${item.id}" href="${item.href}" media-type="${item['media-type']}" ${item.properties ? `properties="${item.properties}"` : ''}/>`).join("\n    ")}</manifest><spine>${spineItems.map(item => `<itemref idref="${item.idref}" ${item.linear ? `linear="${item.linear}"` : ''}/>`).join("\n    ")}</spine></package>`;
            oebps.file("content.opf", contentOPF);

            const epubBlob = await epubZip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
            const safeFileName = state.epubTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'generated_epub';
            triggerDownload(epubBlob, `${safeFileName}.epub`, showToast);
            dispatch({ type: 'SET_FIELD', payload: { field: 'status', value: { message: `EPUB created successfully!`, type: 'success' } } });
        } catch (err: any) {
            showToast(`Error: ${err.message}`, true);
            dispatch({ type: 'SET_FIELD', payload: { field: 'status', value: { message: `Error: ${err.message}`, type: 'error' } } });
        } finally {
            dispatch({ type: 'SET_FIELD', payload: { field: 'isLoading', value: false } });
        }
    };
    
    // ... Render logic, drag & drop handlers
    return (
        <div className="space-y-5">
            { /* JSX from original zip-to-epub.html adapted to React */ }
        </div>
    );
};

export default ZipToEpub;
