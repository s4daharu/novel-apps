/**
 * Browser-compatible EPUB to ZIP converter
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';

let currentZipInstance = null;
let currentTocEntries = [];
let currentOpfDirPath = '';
let currentEpubFilename = '';
const domParser = new DOMParser();

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result);
        reader.onerror = (error) => reject(new Error(`FileReader error: ${error}`));
        reader.readAsArrayBuffer(file);
    });
}

async function readFileFromZip(zip, path) {
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    const fileEntry = zip.file(normalizedPath);

    if (!fileEntry) {
         console.error(`File not found in EPUB archive: ${normalizedPath}`);
         return null;
    }
    try {
         const content = await fileEntry.async('string');
         return { path: normalizedPath, content: content };
    } catch (err) {
         console.error(`Error reading file "${normalizedPath}" from zip:`, err);
         return null;
    }
 }

function parseXml(xmlString, sourceFileName = 'XML') {
    try {
        const doc = domParser.parseFromString(xmlString, 'application/xml');
        const errorNode = doc.querySelector('parsererror');
        if (errorNode) {
            console.error(`XML Parsing Error in ${sourceFileName}:`, errorNode.textContent);
            return null;
        }
        return doc;
    } catch (e) {
        console.error(`Exception during XML parsing of ${sourceFileName}:`, e);
        return null;
    }
}

function parseHtml(htmlString, sourceFileName = 'HTML') {
     try {
        const doc = domParser.parseFromString(htmlString, 'text/html');
         if (!doc || (!doc.body && !doc.documentElement)) {
             console.warn(`Parsed HTML for ${sourceFileName} seems empty or invalid.`);
         }
        return doc;
     } catch (e) {
         console.error(`Exception during HTML parsing of ${sourceFileName}:`, e);
         return null;
     }
 }

function extractTextFromHtml(htmlString) {
    try {
        const PARA_BREAK_MARKER = " \uE000P\uE000 ";
        const LINE_BREAK_MARKER = " \uE000L\uE000 ";

        let processedHtml = htmlString;
        processedHtml = processedHtml.replace(/<\/(p|h[1-6]|div|li|blockquote|pre|section|article|aside|header|footer|nav|figure|figcaption|table|tr|th|td)>\s*/gi, '$&' + PARA_BREAK_MARKER);
        processedHtml = processedHtml.replace(/<br\s*\/?>/gi, LINE_BREAK_MARKER);

        const doc = domParser.parseFromString(processedHtml, 'text/html');
        const body = doc.body;

        if (!body) {
             console.warn("HTML string appears to lack a <body> tag, attempting fallback.");
             let fallbackText = doc.documentElement?.innerText || doc.documentElement?.textContent || '';
             return fallbackText.trim();
        }

        body.querySelectorAll('script, style').forEach(el => el.remove());
        let text = body.textContent || "";

        text = text.replace(new RegExp(PARA_BREAK_MARKER.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), '\n\n');
        text = text.replace(new RegExp(LINE_BREAK_MARKER.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), '\n');
         text = text.replace(/[ \t]+/g, ' ');
         text = text.replace(/ *\n */g, '\n');
         text = text.replace(/\n{3,}/g, '\n\n');

        return text.trim();
    } catch (e) {
        console.error("Error extracting text from HTML:", e);
        return '';
    }
}

function resolvePath(relativePath, baseDirPath) {
    if (!relativePath) return '';
     if (!baseDirPath) {
        return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
     }
    try {
         const baseUrl = `file:///${baseDirPath}/`;
         const resolvedUrl = new URL(relativePath, baseUrl);
         let resolved = resolvedUrl.pathname.substring(1);
         return decodeURIComponent(resolved);
    } catch (e) {
         console.error(`Error resolving path: relative="${relativePath}", base="${baseDirPath}"`, e);
         const simplePath = (baseDirPath + '/' + relativePath).replace(/\/+/g, '/');
         console.warn(`Falling back to simple path concatenation: ${simplePath}`);
         return simplePath;
    }
 }

function sanitizeFilenameForZip(name) {
    if (!name) return 'download';
    let sanitized = name.replace(/[^\p{L}\p{N}._-]+/gu, '_');
    sanitized = sanitized.replace(/__+/g, '_');
    sanitized = sanitized.replace(/^[_.-]+|[_.-]+$/g, '');
    sanitized = sanitized.substring(0, 100);
    return sanitized || 'file';
}

function delay(ms) {
     return new Promise(resolve => setTimeout(resolve, ms));
 }

async function findOpfPath(zip) {
    const containerPath = 'META-INF/container.xml';
    const containerContent = await readFileFromZip(zip, containerPath);
    if (!containerContent) return null;

    const containerDoc = parseXml(containerContent.content, containerPath);
    if (!containerDoc) return null;

    const rootfileElement = containerDoc.querySelector('rootfile[full-path]');
    const rootfilePath = rootfileElement?.getAttribute('full-path');

    if (!rootfilePath) {
        console.error('Cannot find rootfile[full-path] attribute in container.xml');
        return null;
    }
    const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/')) : '';
    return { path: rootfilePath, dir: opfDir };
}

function findTocHref(opfDoc) {
    const navItem = opfDoc.querySelector('manifest > item[properties~="nav"]');
    if (navItem) {
        const href = navItem.getAttribute('href');
        if (href) {
            console.log("Found EPUB3 NAV ToC reference:", href);
            return { href: href, type: 'nav' };
        }
    }

    const spineTocAttr = opfDoc.querySelector('spine[toc]');
    if (spineTocAttr) {
        const ncxId = spineTocAttr.getAttribute('toc');
        if (ncxId) {
            const ncxItem = opfDoc.querySelector(`manifest > item[id="${ncxId}"]`);
            if (ncxItem) {
                const href = ncxItem.getAttribute('href');
                if (href) {
                    console.log("Found EPUB2 NCX ToC reference:", href);
                    return { href: href, type: 'ncx' };
                }
            }
        }
    }
    return null;
}

function extractChaptersFromNcx(ncxDoc, baseDir) {
    const chapters = [];
    let originalIndex = 0;
    const navPoints = ncxDoc.querySelectorAll('navMap navPoint');
    navPoints.forEach(point => {
        const label = point.querySelector('navLabel > text')?.textContent?.trim();
        const contentSrc = point.querySelector('content')?.getAttribute('src');
        if (label && contentSrc) {
            const href = resolvePath(contentSrc.split('#')[0], baseDir);
            chapters.push({ title: label, href: href, id: `epubzip-chap-${originalIndex}`, originalIndex: originalIndex++ });
        }
    });
    return chapters;
}

function extractChaptersFromNav(navDoc, baseDir) {
    const chapters = [];
    let originalIndex = 0;
    let tocList = navDoc.querySelector('nav[epub\\:type="toc"] ol, nav#toc ol, nav.toc ol');

    if (!tocList && navDoc.body) {
         tocList = navDoc.body.querySelector('ol');
         if (tocList) console.warn("Using generic 'ol' fallback for NAV ToC list.");
    }

    if (tocList) {
        const links = tocList.querySelectorAll(':scope > li > a[href]');
        links.forEach(link => {
            const label = (link.textContent || '').replace(/\s+/g, ' ').trim();
            const rawHref = link.getAttribute('href');
            if (label && rawHref) {
                 const href = resolvePath(rawHref.split('#')[0], baseDir);
                 chapters.push({ title: label, href: href, id: `epubzip-chap-${originalIndex}`, originalIndex: originalIndex++ });
            }
        });
    } else {
         console.warn("Could not find a suitable <ol> list within the NAV document for the Table of Contents.");
    }
    return chapters;
}

function deduplicateChapters(chapters) {
    const uniqueChapters = [];
    const seenHrefs = new Set();
    for (const chapter of chapters) {
        if (chapter.href && !seenHrefs.has(chapter.href)) {
            uniqueChapters.push(chapter);
            seenHrefs.add(chapter.href);
        } else if (seenHrefs.has(chapter.href)) {
             console.log(`Duplicate chapter href found and removed: ${chapter.href} (Title: ${chapter.title})`);
        } else {
             console.warn(`Chapter entry skipped due to missing href: (Title: ${chapter.title})`);
        }
    }
    return uniqueChapters;
}

async function getChapterListFromEpub(zip, updateAppStatus) {
    currentOpfDirPath = '';
    currentTocEntries = [];

    const opfPathData = await findOpfPath(zip);
    if (!opfPathData) {
        updateAppStatus("Error: Could not find EPUB's OPF file.", true);
        return [];
    }
    currentOpfDirPath = opfPathData.dir;

    const opfContentFile = await readFileFromZip(zip, opfPathData.path);
    if (!opfContentFile) {
        updateAppStatus(`Error: Could not read OPF file at ${opfPathData.path}`, true);
        return [];
    }
    const opfDoc = parseXml(opfContentFile.content, opfContentFile.path);
    if (!opfDoc) {
        updateAppStatus(`Error: Could not parse OPF XML at ${opfPathData.path}`, true);
        return [];
    }

    const tocInfo = findTocHref(opfDoc);
    if (!tocInfo) {
        updateAppStatus("Warning: No standard Table of Contents (NAV/NCX) link found in OPF.", true);
        return [];
    }

    const tocFullPath = resolvePath(tocInfo.href, currentOpfDirPath);
    const tocContentFile = await readFileFromZip(zip, tocFullPath);
    if (!tocContentFile) {
        updateAppStatus(`Error: ToC file not found at ${tocFullPath}`, true);
        return [];
    }

    let chapters;
    if (tocInfo.type === 'ncx') {
        const ncxDoc = parseXml(tocContentFile.content, tocContentFile.path);
        chapters = ncxDoc ? extractChaptersFromNcx(ncxDoc, currentOpfDirPath) : [];
        if (!ncxDoc) updateAppStatus(`Error: Could not parse NCX file XML at ${tocContentFile.path}`, true);
    } else { // nav
        const navDoc = parseHtml(tocContentFile.content, tocContentFile.path);
        chapters = navDoc ? extractChaptersFromNav(navDoc, currentOpfDirPath) : [];
        if (!navDoc) updateAppStatus(`Error: Could not parse NAV file HTML at ${tocContentFile.path}`, true);
    }

    currentTocEntries = deduplicateChapters(chapters);
    return currentTocEntries;
}

export function initializeEpubToZip(showAppToast, toggleAppSpinner) {
    const fileInput = document.getElementById('epubUploadForTxt');
    const fileNameEl = document.getElementById('epubFileNameForTxt');
    const clearFileBtn = document.getElementById('clearEpubUploadForTxt');
    const extractBtn = document.getElementById('extractChaptersBtn');
    const statusEl = document.getElementById('statusMessageEpubToZip');
    const downloadSec = document.getElementById('downloadSectionEpubToZip');
    const downloadLink = document.getElementById('downloadLinkZipFromEpub');

    const enableRemoveLinesToggle = document.getElementById('epubToZipEnableRemoveLines');
    const removeLinesOptionsGroup = document.getElementById('epubToZipRemoveLinesOptionsGroup');
    const linesToRemoveInput = document.getElementById('epubToZipLinesToRemove');

    const chapterSelectionArea = document.getElementById('epubToZipChapterSelectionArea');
    const chapterListUl = document.getElementById('epubToZipChapterList');
    const selectAllChaptersBtn = document.getElementById('epubToZipSelectAllChapters');
    const deselectAllChaptersBtn = document.getElementById('epubToZipDeselectAllChapters');

     if (!fileInput || !extractBtn || !enableRemoveLinesToggle || !removeLinesOptionsGroup ||
         !linesToRemoveInput || !fileNameEl || !clearFileBtn || !statusEl || !downloadSec || !downloadLink ||
         !chapterSelectionArea || !chapterListUl || !selectAllChaptersBtn || !deselectAllChaptersBtn) {
        console.error("EPUB to ZIP UI elements not found.");
        return;
    }

    enableRemoveLinesToggle.addEventListener('change', (e) => {
        const target = e.target;
        if (removeLinesOptionsGroup) {
            removeLinesOptionsGroup.style.display = target.checked ? 'block' : 'none';
        }
    });

    function updateLocalStatus(message, isError = false) {
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.style.display = 'block';
            statusEl.className = isError ? 'status error' : 'status success';
        }
        if (isError) showAppToast(message, true);
        else if (message.toLowerCase().includes("download started") || message.toLowerCase().includes("file saved") || message.toLowerCase().includes("found") || message.toLowerCase().includes("reading")) {
             showAppToast(message, false);
        }
    }

    function resetChapterSelectionUI() {
        if (chapterListUl) chapterListUl.innerHTML = '';
        if (chapterSelectionArea) chapterSelectionArea.style.display = 'none';
    }

    function displayChapterSelectionList(tocEntries) {
        if (!chapterListUl || !chapterSelectionArea) return;
        chapterListUl.innerHTML = '';

        if (tocEntries.length === 0) {
            chapterSelectionArea.style.display = 'none';
            return;
        }

        tocEntries.forEach((entry) => {
            const li = document.createElement('li');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = entry.id || `epubzip-chap-${entry.originalIndex}`;
            checkbox.value = entry.originalIndex !== undefined ? entry.originalIndex.toString() : entry.href;
            checkbox.checked = true;
            checkbox.setAttribute('data-chapter-href', entry.href);

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = entry.title;

            li.appendChild(checkbox);
            li.appendChild(label);
            chapterListUl.appendChild(li);
        });
        chapterSelectionArea.style.display = 'block';
    }

    selectAllChaptersBtn.addEventListener('click', () => {
        chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = true));
    });

    deselectAllChaptersBtn.addEventListener('click', () => {
        chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
    });

    function resetUIState(fullReset = true) {
        updateLocalStatus('Select an EPUB file.');
        if (downloadSec) downloadSec.style.display = 'none';
        extractBtn.disabled = true;
        currentZipInstance = null;
        currentTocEntries = [];
        currentOpfDirPath = '';
        currentEpubFilename = '';
        resetChapterSelectionUI();

        if (fullReset) {
            fileInput.value = '';
            fileNameEl.textContent = '';
            if (clearFileBtn) clearFileBtn.style.display = 'none';
        }

        if (enableRemoveLinesToggle) enableRemoveLinesToggle.checked = false;
        if (removeLinesOptionsGroup) removeLinesOptionsGroup.style.display = 'none';
        if (linesToRemoveInput) linesToRemoveInput.value = '1';
    }

    clearFileBtn.addEventListener('click', () => {
        resetUIState(true);
    });

    fileInput.addEventListener('change', async (event) => {
        const target = event.target;
        const file = target.files ? target.files[0] : null;

        resetUIState(false);

        if (!file) {
            fileNameEl.textContent = '';
            if (clearFileBtn) clearFileBtn.style.display = 'none';
            extractBtn.disabled = true;
            return;
        }
        if (!file.name.toLowerCase().endsWith('.epub')) {
            updateLocalStatus('Error: Please select a valid .epub file.', true);
            fileInput.value = '';
            fileNameEl.textContent = '';
            if (clearFileBtn) clearFileBtn.style.display = 'none';
            extractBtn.disabled = true;
            return;
        }

        currentEpubFilename = file.name;
        fileNameEl.textContent = `Selected: ${file.name}`;
        if (clearFileBtn) clearFileBtn.style.display = 'inline-block';
        updateLocalStatus(`Reading ${file.name}...`);
        toggleAppSpinner(true);

        try {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            updateLocalStatus('Unzipping EPUB...');
            const JSZip = await getJSZip();
            currentZipInstance = await JSZip.loadAsync(arrayBuffer);

            updateLocalStatus('Parsing Table of Contents...');
            const chapters = await getChapterListFromEpub(currentZipInstance, updateLocalStatus);

            if (chapters.length > 0) {
                displayChapterSelectionList(chapters);
                updateLocalStatus(`Found ${chapters.length} chapters. Review selection and options.`);
                extractBtn.disabled = false;
            } else {
                 let existingMessage = statusEl?.textContent || "";
                 if (!existingMessage.toLowerCase().includes('error') && !existingMessage.toLowerCase().includes('warning')) {
                     updateLocalStatus('No chapters found or ToC unparsable. EPUB might lack a standard ToC or be structured differently.', true);
                 } else if (existingMessage.toLowerCase().includes("warning")) {
                     updateLocalStatus('Table of Contents link was found, but no chapter items could be extracted. Check EPUB structure.', true);
                 }
                 extractBtn.disabled = true;
            }
        } catch (error) {
            console.error("EPUB selection/parsing Error:", error);
            updateLocalStatus(`Error: ${error.message || 'Could not process EPUB.'}`, true);
            resetUIState(true);
        } finally {
            toggleAppSpinner(false);
        }
    });

    extractBtn.addEventListener('click', async () => {
        statusEl.style.display = 'none';

        if (!currentZipInstance || currentTocEntries.length === 0) {
            updateLocalStatus("Cannot extract: No EPUB loaded or no chapters found.", true);
            fileInput.focus();
            return;
        }

        const selectedChapterCheckboxes = chapterListUl.querySelectorAll('input[type="checkbox"]:checked');
        if (selectedChapterCheckboxes.length === 0) {
            updateLocalStatus("No chapters selected to extract. Please select at least one chapter.", true);
            return;
        }

        const selectedChapters = [];
        selectedChapterCheckboxes.forEach(cb => {
            const checkbox = cb;
            const href = checkbox.getAttribute('data-chapter-href');
            const entry = currentTocEntries.find(e => e.href === href);
            if (entry) {
                selectedChapters.push(entry);
            }
        });

        let numLinesToRemove = 0;
        if (enableRemoveLinesToggle.checked) {
            numLinesToRemove = parseInt(linesToRemoveInput.value, 10);
            if (isNaN(numLinesToRemove) || numLinesToRemove < 0) {
                showAppToast('Invalid "Number of lines to remove". Must be 0 or greater.', true);
                statusEl.textContent = 'Error: "Number of lines to remove" must be 0 or greater.';
                statusEl.className = 'status error';
                statusEl.style.display = 'block';
                linesToRemoveInput.focus();
                return;
            }
        }

        extractBtn.disabled = true;
        extractBtn.textContent = 'Extracting...';
        toggleAppSpinner(true);

            const JSZip = await getJSZip();
            const outputZip = new JSZip();
        let filesAdded = 0;
        const totalChaptersToProcess = selectedChapters.length;

        try {
            updateLocalStatus(`Starting chapter extraction (0/${totalChaptersToProcess})...`);

            for (let i = 0; i < totalChaptersToProcess; i++) {
                const entry = selectedChapters[i];
                updateLocalStatus(`Processing chapter ${i + 1}/${totalChaptersToProcess}: ${entry.title.substring(0,30)}...`);

                const chapterFile = currentZipInstance.file(entry.href);
                if (!chapterFile) {
                    console.warn(`Chapter file not found in EPUB: ${entry.href}`);
                    continue;
                }

                const chapterBytes = await chapterFile.async("uint8array");
                let chapterHtml;
                try {
                    const decoder = new TextDecoder('utf-8', { fatal: false });
                    chapterHtml = decoder.decode(chapterBytes);
                } catch (e) {
                    console.error(`Error decoding chapter ${entry.href} as UTF-8:`, e);
                    chapterHtml = "";
                    updateLocalStatus(`Warning: Could not decode chapter "${entry.title.substring(0,30)}". It may be corrupted or not UTF-8.`, true);
                }

                let chapterText = extractTextFromHtml(chapterHtml);

                if (numLinesToRemove > 0 && chapterText) {
                    const lines = chapterText.split('\n');
                    if (lines.length > numLinesToRemove) {
                        chapterText = lines.slice(numLinesToRemove).join('\n');
                    } else {
                        chapterText = '';
                    }
                }

                if (chapterText && chapterText.trim().length > 0) {
                    const safeChapterTitle = sanitizeFilenameForZip(entry.title) || `Chapter_${String(i + 1).padStart(2, '0')}`;
                    const txtFilename = `${safeChapterTitle}.txt`;
                    outputZip.file(txtFilename, chapterText);
                    filesAdded++;
                } else {
                    console.warn(`No text content extracted (or became empty after line removal) from: ${entry.href}`);
                }
                await delay(5);
            }

            if (filesAdded > 0) {
                 updateLocalStatus(`Generating ZIP file with ${filesAdded} chapters...`);
                const zipBlob = await outputZip.generateAsync({ type: "blob", compression: "DEFLATE" });

                const downloadFilenameBase = currentEpubFilename.replace(/\.epub$/i, '') || 'epub_content';
                const finalFilename = `${sanitizeFilenameForZip(downloadFilenameBase)}_chapters.zip`;

                await triggerDownload(zipBlob, finalFilename, 'application/zip', showAppToast);

                updateLocalStatus(`Download started / File saved (${filesAdded}/${totalChaptersToProcess} chapters).`);
                if (downloadSec && downloadLink) {
                    downloadLink.href = "#";
                    downloadLink.setAttribute('download', finalFilename);
                    downloadLink.textContent = `Download ${finalFilename}`;
                    downloadSec.style.display = 'block';
                }
            } else {
                updateLocalStatus("Extraction complete, but no chapter content was retrieved or all content was removed. Check EPUB and options.", true);
            }

        } catch (err) {
            console.error("Error during chapter extraction or ZIP creation:", err);
            updateLocalStatus(`Error: ${err.message}`, true);
        } finally {
            extractBtn.disabled = false;
            extractBtn.textContent = 'Extract Chapters to ZIP';
            toggleAppSpinner(false);
        }
    });
}
