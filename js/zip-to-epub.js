/**
 * Browser-compatible ZIP to EPUB converter
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { escapeHTML } from './ui-helpers.js';

// Helper: Generate a UUID (simple version)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Helper: Sanitize string for use in XML IDs or filenames
function sanitizeForXML(str) {
    if (!str) return '';
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * A safe, simple inline markdown processor that runs after HTML escaping.
 * @param line The string line to process.
 * @returns An HTML string with bold and italic tags.
 */
function escapeAndProcessInlines(line) {
    // Use unique placeholders to protect markdown syntax from the HTML escaper.
    let processedLine = line
        .replace(/\*\*(.*?)\*\*|__(.*?)__/g, '%%STRONG_START%%$1$2%%STRONG_END%%')
        .replace(/\*(.*?)\*|_(.*?)_/g, '%%EM_START%%$1$2%%EM_END%%');

    processedLine = escapeHTML(processedLine);

    return processedLine
        .replace(/%%STRONG_START%%/g, '<strong>').replace(/%%STRONG_END%%/g, '</strong>')
        .replace(/%%EM_START%%/g, '<em>').replace(/%%EM_END%%/g, '</em>');
}

/**
 * Converts plain text to basic XHTML for a chapter.
 * @param text The raw chapter text.
 * @param chapterTitle The title for the chapter heading.
 * @param useMarkdown Whether to process basic Markdown syntax.
 * @param language The language code for the HTML tag.
 * @returns A full XHTML document string.
 */
function textToXHTML(text, chapterTitle, useMarkdown, language) {
    const heading = `<h2>${escapeHTML(chapterTitle)}</h2>\n`;
    let chapterBody = '';

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            if (useMarkdown) {
                const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const content = headingMatch[2];
                    chapterBody += `<h${level + 1}>${escapeAndProcessInlines(content)}</h${level + 1}>\n`;
                } else {
                    chapterBody += `    <p>${escapeAndProcessInlines(trimmedLine)}</p>\n`;
                }
            } else {
                chapterBody += `    <p>${escapeHTML(trimmedLine)}</p>\n`;
            }
        }
    });
    
    if (!chapterBody.trim()) {
        chapterBody = '    <p>&nbsp;</p>\n';
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeHTML(language)}">
<head>
  <title>${escapeHTML(chapterTitle)}</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css" />
</head>
<body>
  <section epub:type="chapter">\n${heading}${chapterBody}  </section>
</body>
</html>`;
}

/**
 * Cleans up a filename to be used as a default chapter title.
 * @param {string} filename The original filename from the ZIP.
 * @returns {string} A cleaned-up, more readable title.
 */
function cleanTitleFromFilename(filename) {
    let title = filename
        .replace(/\.txt$/i, '') // Remove .txt extension
        .replace(/^[0-9\s._-]+/, '') // Remove leading numbers, spaces, dots, underscores, hyphens
        .replace(/[_-]/g, ' ') // Replace underscores and hyphens with spaces
        .trim();
    
    // Capitalize the first letter
    if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    
    return title || "Untitled Chapter";
}


export function initializeZipToEpub(showAppToast, toggleAppSpinner) {
    const zipUploadInput = document.getElementById('zipUploadForEpub');
    const zipFileNameEl = document.getElementById('zipFileNameForEpub');
    const clearZipBtn = document.getElementById('clearZipUploadForEpub');
    const epubTitleInput = document.getElementById('epubTitle');
    const epubAuthorInput = document.getElementById('epubAuthor');
    const epubLangInput = document.getElementById('epubLanguage');
    const epubCoverImageInput = document.getElementById('epubCoverImage');
    const epubCoverFileNameEl = document.getElementById('epubCoverFileName');
    const clearCoverBtn = document.getElementById('clearEpubCoverImage');
    const processMarkdownCheckbox = document.getElementById('processMarkdown');
    const chapterArea = document.getElementById('zipToEpubChapterArea');
    const chapterListUl = document.getElementById('zipToEpubChapterList');
    const createBtn = document.getElementById('createEpubBtn');
    const statusEl = document.getElementById('statusMessageZipToEpub');
    const downloadSec = document.getElementById('downloadSectionZipToEpub');
    
    let chapters = [];
    let draggedItem = null;

    if (!zipUploadInput || !createBtn || !zipFileNameEl || !clearZipBtn || !epubTitleInput || !epubAuthorInput ||
        !epubLangInput || !epubCoverImageInput || !epubCoverFileNameEl || !clearCoverBtn ||
        !processMarkdownCheckbox || !chapterArea || !chapterListUl || !statusEl || !downloadSec) {
        console.error("ZIP to EPUB UI elements not found. Initialization failed.");
        return;
    }

    function renderChapterList() {
        chapterListUl.innerHTML = '';
        chapters.forEach(chapter => {
            const li = document.createElement('li');
            li.draggable = true;
            li.dataset.name = chapter.name;
            li.className = 'flex items-center p-2.5 border-b border-slate-200 dark:border-slate-700 cursor-grab user-select-none transition-all duration-200 rounded-md mb-0.5 last:border-b-0 hover:bg-slate-200/50 dark:hover:bg-slate-700/50';
            li.innerHTML = `<input type="text" value="${escapeHTML(chapter.title)}" class="flex-grow bg-transparent border-none text-slate-800 dark:text-slate-200 p-1.5 rounded-md border border-transparent text-sm transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 focus:bg-white/50 dark:focus:bg-slate-600/50 focus:border-primary-500 focus:outline-none" aria-label="Title for chapter ${escapeHTML(chapter.name)}">`;
            chapterListUl.appendChild(li);
        });
    }

    chapterListUl.addEventListener('input', (e) => {
        if (e.target.matches('input[type="text"]')) {
            const name = e.target.closest('li').dataset.name;
            const chapter = chapters.find(c => c.name === name);
            if (chapter) {
                chapter.title = e.target.value;
            }
        }
    });

    // Drag and Drop Event Handlers
    const draggingClasses = ['opacity-50', 'bg-primary-100', 'dark:bg-primary-800', 'scale-105', 'shadow-lg'];
    chapterListUl.addEventListener('dragstart', (e) => {
        if (e.target.matches('li')) {
            draggedItem = e.target;
            setTimeout(() => draggedItem.classList.add(...draggingClasses), 0);
        }
    });
    chapterListUl.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove(...draggingClasses);
            draggedItem = null;
        }
    });
    chapterListUl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = [...chapterListUl.querySelectorAll('li:not(.opacity-50)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        if (draggedItem) {
            if (afterElement == null) chapterListUl.appendChild(draggedItem);
            else chapterListUl.insertBefore(draggedItem, afterElement);
        }
    });
    chapterListUl.addEventListener('drop', (e) => {
        e.preventDefault();
        const newOrderedNames = [...chapterListUl.querySelectorAll('li')].map(li => li.dataset.name);
        chapters.sort((a, b) => newOrderedNames.indexOf(a.name) - newOrderedNames.indexOf(b.name));
    });

    setupFileInput({
        inputEl: zipUploadInput,
        fileNameEl: zipFileNameEl,
        clearBtnEl: clearZipBtn,
        async onFileSelected(files) {
            statusEl.classList.add('hidden');
            downloadSec.classList.add('hidden');
            const selectedZipFile = files[0];
            createBtn.disabled = true;
            toggleAppSpinner(true);
            try {
                const JSZip = await getJSZip();
                const zip = await JSZip.loadAsync(selectedZipFile);
                const chapterPromises = [];
                zip.forEach((path, file) => {
                    if (!file.dir && path.toLowerCase().endsWith('.txt')) {
                        chapterPromises.push(file.async('string').then(text => ({
                            name: file.name,
                            content: text,
                            title: cleanTitleFromFilename(file.name)
                        })));
                    }
                });
                const loadedChapters = await Promise.all(chapterPromises);
                if (loadedChapters.length === 0) throw new Error("No .txt files found in ZIP.");
                loadedChapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                chapters = loadedChapters;
                renderChapterList();
                chapterArea.classList.remove('hidden');
            } catch (err) {
                showAppToast(`Error reading ZIP: ${err.message}`, true);
                chapters = [];
                chapterArea.classList.add('hidden');
            } finally {
                toggleAppSpinner(false);
                createBtn.disabled = chapters.length === 0;
            }
        },
        onFileCleared() {
            chapters = [];
            chapterArea.classList.add('hidden');
            statusEl.classList.add('hidden');
            downloadSec.classList.add('hidden');
        },
        onButtonUpdate(hasFile) {
            createBtn.disabled = !hasFile;
        }
    });

    setupFileInput({
        inputEl: epubCoverImageInput,
        fileNameEl: epubCoverFileNameEl,
        clearBtnEl: clearCoverBtn
    });

    createBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        if (chapters.length === 0) {
            return updateStatus(statusEl, "Error: No chapters loaded to create an EPUB.", 'error');
        }
        const title = epubTitleInput.value.trim();
        if (!title) {
            epubTitleInput.focus();
            return updateStatus(statusEl, "Error: EPUB Title is required.", 'error');
        }
        const author = epubAuthorInput.value.trim();
        if (!author) {
            epubAuthorInput.focus();
            return updateStatus(statusEl, "Error: Author is required.", 'error');
        }

        toggleAppSpinner(true);
        downloadSec.classList.add('hidden');

        try {
            const JSZip = await getJSZip();
            const epubZip = new JSZip();
            epubZip.file("mimetype", "application/epub+zip", { compression: "STORE" });

            const containerXML = `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
            epubZip.folder("META-INF").file("container.xml", containerXML);

            const oebps = epubZip.folder("OEBPS");
            const css = `body{font-family:sans-serif;line-height:1.6;margin:1em;}h1,h2{text-align:center;line-height:1.3;}p{text-indent:1.5em;margin:0 0 .5em;text-align:justify;}.cover{text-align:center;margin:0;padding:0;height:100vh;page-break-after:always;}.cover img{max-width:100%;max-height:100vh;object-fit:contain;}`;
            oebps.folder("css").file("style.css", css);

            const manifestItems = [{ id: "css", href: "css/style.css", "media-type": "text/css" }, { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }];
            const spineItems = [];
            
            const coverFile = epubCoverImageInput.files?.[0];
            if (coverFile) {
                const ext = coverFile.name.split('.').pop().toLowerCase();
                const mediaType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
                const coverData = await coverFile.arrayBuffer();
                oebps.folder("images").file(`cover.${ext}`, coverData);
                manifestItems.push({ id: "cover-image", href: `images/cover.${ext}`, "media-type": mediaType, properties: "cover-image" });
                const coverXHTML = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Cover</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><div class="cover"><img src="../images/cover.${ext}" alt="Cover Image"/></div></body></html>`;
                oebps.folder("text").file("cover.xhtml", coverXHTML);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }

            chapters.forEach((chapter, i) => {
                const filename = `chapter_${i + 1}.xhtml`;
                const xhtml = textToXHTML(chapter.content, chapter.title, processMarkdownCheckbox.checked, epubLangInput.value.trim() || 'en');
                oebps.folder("text").file(filename, xhtml);
                const itemId = `chapter-${i + 1}`;
                manifestItems.push({ id: itemId, href: `text/${filename}`, "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: itemId });
            });
            
            const navLiItems = chapters.map((c, i) => `<li><a href="text/chapter_${i+1}.xhtml">${escapeHTML(c.title)}</a></li>`).join("\n      ");
            const navXHTML = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Table of Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navLiItems}</ol></nav></body></html>`;
            oebps.file("nav.xhtml", navXHTML);

            const bookUUID = `urn:uuid:${generateUUID()}`;
            const modifiedDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
            const manifestXML = manifestItems.map(item => `<item id="${item.id}" href="${item.href}" media-type="${item['media-type']}" ${item.properties ? `properties="${item.properties}"` : ''}/>`).join("\n    ");
            const spineXML = spineItems.map(item => `<itemref idref="${item.idref}" ${item.linear ? `linear="${item.linear}"` : ''}/>`).join("\n    ");
            const contentOPF = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">${bookUUID}</dc:identifier><dc:title>${escapeHTML(title)}</dc:title><dc:language>${escapeHTML(epubLangInput.value.trim() || 'en')}</dc:language><dc:creator>${escapeHTML(author)}</dc:creator><meta property="dcterms:modified">${modifiedDate}</meta>${coverFile ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifestXML}</manifest><spine>${spineXML}</spine></package>`;
            oebps.file("content.opf", contentOPF);

            const epubBlob = await epubZip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
            const safeFileName = title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'generated_epub';
            await triggerDownload(epubBlob, `${safeFileName}.epub`, 'application/epub+zip', showAppToast);

            downloadSec.classList.remove('hidden');
            updateStatus(statusEl, `EPUB created successfully with ${chapters.length} chapter(s).`, 'success');

        } catch (err) {
            console.error("ZIP to EPUB Error:", err);
            updateStatus(statusEl, `Error: ${err.message}`, 'error');
        } finally {
            toggleAppSpinner(false);
        }
    });
}