/**
 * Browser-compatible ZIP to EPUB converter
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';

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

function escapeHTML(str) {
    if (typeof str !== 'string') {
        return '';
    }
    return str.replace(/[&<>"']/g, function (match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return match;
        }
    });
}

/**
 * A safe, simple inline markdown processor that runs after HTML escaping.
 * It uses placeholders to avoid issues with user-inputted characters.
 * @param line The string line to process.
 * @returns An HTML string with bold and italic tags.
 */
function escapeAndProcessInlines(line) {
    // Use unique placeholders to protect markdown syntax from the HTML escaper.
    let processedLine = line
        .replace(/\*\*(.*?)\*\*|__(.*?)__/g, '%%STRONG_START%%$1$2%%STRONG_END%%')
        .replace(/\*(.*?)\*|_(.*?)_/g, '%%EM_START%%$1$2%%EM_END%%');

    // Escape all HTML-sensitive characters.
    processedLine = escapeHTML(processedLine);

    // Restore the markdown placeholders with their HTML tags.
    processedLine = processedLine
        .replace(/%%STRONG_START%%/g, '<strong>').replace(/%%STRONG_END%%/g, '</strong>')
        .replace(/%%EM_START%%/g, '<em>').replace(/%%EM_END%%/g, '</em>');

    return processedLine;
}

/**
 * Converts plain text to basic XHTML for a chapter.
 * Handles paragraphs (separated by blank lines), single line breaks, and optional Markdown.
 * @param text The raw chapter text.
 * @param chapterTitle The title for the chapter heading.
 * @param useMarkdown Whether to process basic Markdown syntax.
 * @param language The language code for the HTML tag.
 * @returns A full XHTML document string.
 */
function textToXHTML(text, chapterTitle, useMarkdown, language) {
    const bodyContent = `<h2>${escapeHTML(chapterTitle)}</h2>\n`;
    let chapterBody = '';

    // Normalize line endings and split into individual lines.
    const lines = text.replace(/\r\n/g, '\n').split('\n');

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            let paragraphHtml = '';
            if (useMarkdown) {
                const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)/);
                if (headingMatch) {
                    const level = headingMatch[1].length;
                    const content = headingMatch[2];
                    paragraphHtml = `<h${level}>${escapeAndProcessInlines(content)}</h${level}>\n`;
                } else {
                    paragraphHtml = `    <p>${escapeAndProcessInlines(trimmedLine)}</p>\n`;
                }
            } else {
                paragraphHtml = `    <p>${escapeHTML(trimmedLine)}</p>\n`;
            }
            chapterBody += paragraphHtml;
        }
    });
    
    // If chapterBody is empty (e.g., input was only whitespace), add an empty paragraph to ensure a valid body.
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
  <section epub:type="chapter">\n${bodyContent}${chapterBody}  </section>
</body>
</html>`;
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
    const downloadLink = document.getElementById('downloadLinkEpub');

    let selectedZipFile = null;
    let selectedCoverFile = null;
    let chapters = [];
    let draggedItem = null;

    if (!zipUploadInput || !createBtn || !zipFileNameEl || !clearZipBtn || !epubTitleInput || !epubAuthorInput ||
        !epubLangInput || !epubCoverImageInput || !epubCoverFileNameEl || !clearCoverBtn ||
        !processMarkdownCheckbox || !chapterArea || !chapterListUl ||
        !statusEl || !downloadSec || !downloadLink) {
        console.error("ZIP to EPUB UI elements not found. Initialization failed.");
        return;
    }

    function resetUI(full = false) {
        if (downloadSec) downloadSec.style.display = 'none';
        if (statusEl) statusEl.style.display = 'none';
        if (chapterArea) chapterArea.style.display = 'none';
        if (chapterListUl) chapterListUl.innerHTML = '';
        chapters = [];

        if (full) {
            selectedZipFile = null;
            zipUploadInput.value = '';
            zipFileNameEl.textContent = '';
            clearZipBtn.style.display = 'none';
            createBtn.disabled = true;
        }
    }

    function renderChapterList() {
        if (!chapterListUl) return;
        chapterListUl.innerHTML = '';

        chapters.forEach(chapter => {
            const li = document.createElement('li');
            li.draggable = true;
            li.dataset.name = chapter.name;
            li.className = 'flex items-center p-2.5 border-b border-slate-200 dark:border-slate-700 cursor-grab user-select-none transition-all duration-200 rounded-md mb-0.5 last:border-b-0 hover:bg-slate-200/50 dark:hover:bg-slate-700/50';

            const handle = document.createElement('span');
            handle.className = 'mr-3 text-slate-500 text-lg leading-none p-1 rounded-sm transition-colors duration-200 hover:text-primary-600 hover:bg-slate-200 dark:hover:bg-slate-700';
            handle.textContent = '☰';

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'flex-grow bg-transparent border-none text-slate-800 dark:text-slate-200 p-1.5 rounded-md border border-transparent text-sm transition-all duration-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 focus:bg-white/50 dark:focus:bg-slate-600/50 focus:border-primary-500 focus:outline-none';
            titleInput.value = chapter.title;
            titleInput.ariaLabel = `Title for chapter ${chapter.name}`;
            titleInput.addEventListener('input', () => {
                const chapterToUpdate = chapters.find(c => c.name === chapter.name);
                if (chapterToUpdate) {
                    chapterToUpdate.title = titleInput.value;
                }
            });

            li.appendChild(handle);
            li.appendChild(titleInput);
            chapterListUl.appendChild(li);
        });
    }

    // Drag and Drop Event Handlers for Chapter List
    const draggingClasses = ['opacity-70', 'bg-primary-600', 'text-white', 'rotate-2', 'shadow-lg'];
    chapterListUl.addEventListener('dragstart', (e) => {
        draggedItem = e.target;
        setTimeout(() => {
            if (draggedItem) draggedItem.classList.add(...draggingClasses);
        }, 0);
    });

    chapterListUl.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove(...draggingClasses);
            draggedItem = null;
        }
    });

    chapterListUl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(chapterListUl, e.clientY);
        const currentDragged = document.querySelector('.opacity-70'); // Using one of the dragging classes to find the element
        if (currentDragged) {
            if (afterElement == null) {
                chapterListUl.appendChild(currentDragged);
            } else {
                chapterListUl.insertBefore(currentDragged, afterElement);
            }
        }
    });

    chapterListUl.addEventListener('drop', (e) => {
        e.preventDefault();
        const newOrderedNames = Array.from(chapterListUl.querySelectorAll('li')).map(li => li.dataset.name);
        chapters.sort((a, b) => {
            const indexA = newOrderedNames.indexOf(a.name);
            const indexB = newOrderedNames.indexOf(b.name);
            return indexA - indexB;
        });
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('li:not(.opacity-70)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
    }

    zipUploadInput.addEventListener('change', async (e) => {
        const target = e.target;
        resetUI();
        selectedZipFile = target.files ? target.files[0] : null;

        if (selectedZipFile) {
            zipFileNameEl.textContent = `Selected ZIP: ${selectedZipFile.name}`;
            if (clearZipBtn) clearZipBtn.style.display = 'inline-block';
            createBtn.disabled = true;
            toggleAppSpinner(true);

            try {
                const JSZip = await getJSZip();
                const contentZip = await JSZip.loadAsync(selectedZipFile);
                const chapterPromises = [];
                contentZip.forEach((relativePath, zipEntry) => {
                    if (!zipEntry.dir && zipEntry.name.toLowerCase().endsWith('.txt')) {
                        chapterPromises.push(
                            zipEntry.async('string').then((text) => ({
                                name: zipEntry.name,
                                content: text,
                                title: zipEntry.name.replace(/\.txt$/i, '').replace(/_/g, ' ')
                            }))
                        );
                    }
                });

                const loadedChapters = (await Promise.all(chapterPromises)).filter(Boolean);
                if (loadedChapters.length === 0) {
                    throw new Error("No .txt files found in the uploaded ZIP.");
                }

                loadedChapters.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
                chapters = loadedChapters;

                renderChapterList();
                chapterArea.style.display = 'block';
                createBtn.disabled = false;

            } catch (err) {
                showAppToast(`Error reading ZIP: ${err.message}`, true);
                resetUI(true);
            } finally {
                toggleAppSpinner(false);
            }
        } else {
            resetUI(true);
        }
    });

    clearZipBtn.addEventListener('click', () => {
        resetUI(true);
    });

    epubCoverImageInput.addEventListener('change', (e) => {
        const target = e.target;
        selectedCoverFile = target.files ? target.files[0] : null;
        if (selectedCoverFile) {
            epubCoverFileNameEl.textContent = `Cover: ${selectedCoverFile.name}`;
            if (clearCoverBtn) clearCoverBtn.style.display = 'inline-block';
        } else {
            epubCoverFileNameEl.textContent = '';
            if (clearCoverBtn) clearCoverBtn.style.display = 'none';
        }
    });

    clearCoverBtn.addEventListener('click', () => {
        selectedCoverFile = null;
        epubCoverImageInput.value = '';
        epubCoverFileNameEl.textContent = '';
        clearCoverBtn.style.display = 'none';
    });

    createBtn.addEventListener('click', async () => {
        if (statusEl) statusEl.style.display = 'none';

        if (chapters.length === 0) {
            showAppToast("Please upload a ZIP file with .txt chapters.", true);
            statusEl.textContent = 'Error: No chapters loaded to create an EPUB.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.style.display = 'block';
            zipUploadInput.focus();
            return;
        }

        const title = epubTitleInput.value.trim();
        if (!title) {
            showAppToast("EPUB Title is required.", true);
            statusEl.textContent = 'Error: EPUB Title is required.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.style.display = 'block';
            epubTitleInput.focus();
            return;
        }

        const author = epubAuthorInput.value.trim();
        if (!author) {
            showAppToast("Author is required.", true);
            statusEl.textContent = 'Error: Author is required.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.style.display = 'block';
            epubAuthorInput.focus();
            return;
        }

        const language = epubLangInput.value.trim() || 'en';
        const useMarkdown = processMarkdownCheckbox.checked;

        const bookUUID = `urn:uuid:${generateUUID()}`;
        toggleAppSpinner(true);
        if (downloadSec) downloadSec.style.display = 'none';

        try {
            const JSZip = await getJSZip();
            const epubZip = new JSZip();

            epubZip.file("mimetype", "application/epub+zip", { compression: "STORE" });

            const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
            epubZip.folder("META-INF")?.file("container.xml", containerXML);

            const oebps = epubZip.folder("OEBPS");
            if (!oebps) throw new Error("Could not create OEBPS folder.");
            const cssFolder = oebps.folder("css");
            const textFolder = oebps.folder("text");
            const imagesFolder = oebps.folder("images");

            const basicCSS = `body { font-family: sans-serif; line-height: 1.6; margin: 1em; }
h1, h2, h3, h4, h5, h6 { text-align: center; line-height: 1.3; }
p { text-indent: 1.5em; margin-top: 0; margin-bottom: 0.5em; text-align: justify; }
.cover { text-align: center; margin: 0; padding: 0; height: 100vh; page-break-after: always; }
.cover img { max-width: 100%; max-height: 100vh; object-fit: contain; }`;
            cssFolder.file("style.css", basicCSS);

            const manifestItems = [
                { id: "css", href: "css/style.css", "media-type": "text/css" },
                { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }
            ];
            const spineItems = [];
            const navLiItems = [];
            const ncxNavPoints = [];
            let playOrder = 1;

            if (selectedCoverFile) {
                const coverExt = selectedCoverFile.name.split('.').pop()?.toLowerCase() || 'png';
                const coverImageFilename = `cover.${coverExt}`;
                const coverMediaType = (coverExt === 'jpg' || coverExt === 'jpeg') ? 'image/jpeg' : 'image/png';

                const coverImageData = await selectedCoverFile.arrayBuffer();
                imagesFolder.file(coverImageFilename, coverImageData);

                manifestItems.push({ id: "cover-image", href: `images/${coverImageFilename}`, "media-type": coverMediaType, properties: "cover-image" });

                const coverXHTMLContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <title>Cover</title>
  <link rel="stylesheet" type="text/css" href="../css/style.css" />
</head>
<body>
  <div class="cover">
    <img src="../images/${coverImageFilename}" alt="Cover Image"/>
  </div>
</body>
</html>`;
                textFolder.file("cover.xhtml", coverXHTMLContent);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }

            chapters.forEach((chapter, i) => {
                const chapterBaseName = sanitizeForXML(chapter.title) || `chapter_${i + 1}`;
                const chapterFilename = `${chapterBaseName}.xhtml`;

                const xhtmlContent = textToXHTML(chapter.content, chapter.title, useMarkdown, language);
                textFolder.file(chapterFilename, xhtmlContent);

                const itemId = `chapter-${i + 1}`;
                manifestItems.push({ id: itemId, href: `text/${chapterFilename}`, "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: itemId, linear: "yes" });

                navLiItems.push(`<li><a href="text/${chapterFilename}">${escapeHTML(chapter.title)}</a></li>`);
                ncxNavPoints.push(`
    <navPoint id="navpoint-${playOrder}" playOrder="${playOrder}">
      <navLabel><text>${escapeHTML(chapter.title)}</text></navLabel>
      <content src="text/${chapterFilename}"/>
    </navPoint>`);
                playOrder++;
            });

            const navXHTMLContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${language}">
<head>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="css/style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of Contents</h1>
    <ol>
      ${navLiItems.join("\n      ")}
    </ol>
  </nav>
</body>
</html>`;
            oebps.file("nav.xhtml", navXHTMLContent);

            const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookUUID}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeHTML(title)}</text></docTitle>
  <navMap>
    ${ncxNavPoints.join("\n    ")}
  </navMap>
</ncx>`;
            oebps.file("toc.ncx", ncxContent);
            manifestItems.push({ id: "ncx", href: "toc.ncx", "media-type": "application/x-dtbncx+xml" });

            let manifestXML = manifestItems.map(item => {
                let props = item.properties ? ` properties="${item.properties}"` : '';
                return `<item id="${item.id}" href="${item.href}" media-type="${item['media-type']}"${props}/>`;
            }).join("\n    ");

            let spineXML = spineItems.map(item => {
                let linearAttr = item.linear ? ` linear="${item.linear}"` : '';
                return `<itemref idref="${item.idref}"${linearAttr}/>`;
            }).join("\n    ");

            const contentOPF = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">${bookUUID}</dc:identifier>
    <dc:title>${escapeHTML(title)}</dc:title>
    <dc:language>${language}</dc:language>
    <dc:creator id="creator">${escapeHTML(author)}</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
    ${selectedCoverFile ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifestXML}
  </manifest>
  <spine toc="ncx">
    ${spineXML}
  </spine>
</package>`;
            oebps.file("content.opf", contentOPF);

            const epubBlob = await epubZip.generateAsync({
                type: "blob",
                mimeType: "application/epub+zip",
                compression: "DEFLATE"
            });

            if (downloadLink) {
                const safeFileName = title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'generated_epub';
                const downloadFilename = `${safeFileName}.epub`;

                await triggerDownload(epubBlob, downloadFilename, 'application/epub+zip', showAppToast);
            }

            if (downloadSec) downloadSec.style.display = 'block';
            statusEl.textContent = `EPUB "${title}" created successfully with ${chapters.length} chapter(s). Download started.`;
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-green-50 dark:bg-green-600/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400';
            statusEl.style.display = 'block';
            showAppToast("EPUB created successfully!");

        } catch (err) {
            console.error("ZIP to EPUB Error:", err);
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.style.display = 'block';
            showAppToast(`Error creating EPUB: ${err.message}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}