/**
 * Browser-compatible EPUB to ZIP converter
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { escapeHTML } from './ui-helpers.js';

let currentZipInstance = null;
let currentTocEntries = [];
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
    const fileEntry = zip.file(path);
    if (!fileEntry) {
         console.error(`File not found in EPUB archive: ${path}`);
         return null;
    }
    return fileEntry.async('string').catch(err => {
        console.error(`Error reading file "${path}" from zip:`, err);
        return null;
    });
 }

function parseXml(xmlString, sourceFileName = 'XML') {
    const doc = domParser.parseFromString(xmlString, 'application/xml');
    if (doc.querySelector('parsererror')) {
        console.error(`XML Parsing Error in ${sourceFileName}:`, doc.querySelector('parsererror').textContent);
        return null;
    }
    return doc;
}

function extractTextFromHtml(htmlString) {
    const doc = domParser.parseFromString(htmlString, 'text/html');
    doc.body.querySelectorAll('script, style').forEach(el => el.remove());
    return doc.body.textContent.trim().replace(/\s+/g, ' ');
}

function resolvePath(relativePath, baseDirPath) {
    if (!baseDirPath) {
        return relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    }
    // Simple but effective path joining for EPUBs
    const parts = baseDirPath.split('/').concat(relativePath.split('/'));
    const resolved = [];
    for (const part of parts) {
        if (part === '.' || part === '') continue;
        if (part === '..') resolved.pop();
        else resolved.push(part);
    }
    return resolved.join('/');
}

function sanitizeFilenameForZip(name) {
    if (!name) return 'download';
    let sanitized = name.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/__+/g, '_');
    return sanitized.substring(0, 100) || 'file';
}

async function findOpfPath(zip) {
    const containerXml = await readFileFromZip(zip, 'META-INF/container.xml');
    if (!containerXml) return null;
    const doc = parseXml(containerXml, 'container.xml');
    const rootfilePath = doc?.querySelector('rootfile[full-path]')?.getAttribute('full-path');
    if (!rootfilePath) return null;
    return rootfilePath;
}

function findTocHref(opfDoc) {
    const navItem = opfDoc.querySelector('manifest > item[properties~="nav"]');
    if (navItem) return { href: navItem.getAttribute('href'), type: 'nav' };
    
    const spineTocId = opfDoc.querySelector('spine[toc]')?.getAttribute('toc');
    if (spineTocId) {
        const ncxItem = opfDoc.querySelector(`manifest > item[id="${spineTocId}"]`);
        if (ncxItem) return { href: ncxItem.getAttribute('href'), type: 'ncx' };
    }
    return null;
}

function extractChaptersFromToc(tocDoc, tocType, baseDir) {
    const chapters = [];
    const selector = tocType === 'ncx' ? 'navMap navPoint' : 'nav[epub\\:type="toc"] ol a[href]';
    tocDoc.querySelectorAll(selector).forEach((el, index) => {
        const label = tocType === 'ncx' ? el.querySelector('navLabel > text')?.textContent?.trim() : el.textContent?.trim();
        const src = tocType === 'ncx' ? el.querySelector('content')?.getAttribute('src') : el.getAttribute('href');
        if (label && src) {
            chapters.push({
                title: label,
                href: resolvePath(src.split('#')[0], baseDir),
                id: `epubzip-chap-${index}`,
                originalIndex: index
            });
        }
    });
    return chapters;
}

async function getChapterListFromEpub(zip, localUpdateStatus) {
    const opfFullPath = await findOpfPath(zip);
    if (!opfFullPath) throw new Error("Could not find EPUB's OPF file.");
    
    const opfDir = opfFullPath.includes('/') ? opfFullPath.substring(0, opfFullPath.lastIndexOf('/')) : '';
    const opfContent = await readFileFromZip(zip, opfFullPath);
    if (!opfContent) throw new Error(`Could not read OPF file at ${opfFullPath}`);

    const opfDoc = parseXml(opfContent, opfFullPath);
    if (!opfDoc) throw new Error(`Could not parse OPF XML at ${opfFullPath}`);

    const tocInfo = findTocHref(opfDoc);
    if (!tocInfo) throw new Error("No standard Table of Contents (NAV/NCX) found.");

    const tocFullPath = resolvePath(tocInfo.href, opfDir);
    const tocContent = await readFileFromZip(zip, tocFullPath);
    if (!tocContent) throw new Error(`ToC file not found at ${tocFullPath}`);
    
    const tocDoc = tocInfo.type === 'ncx' ? parseXml(tocContent, tocFullPath) : domParser.parseFromString(tocContent, 'application/xhtml+xml');
    if (!tocDoc) throw new Error(`Could not parse ToC file at ${tocFullPath}`);

    const chapters = extractChaptersFromToc(tocDoc, tocInfo.type, opfDir);
    return [...new Map(chapters.map(item => [item.href, item])).values()]; // Deduplicate by href
}

export function initializeEpubToZip(showAppToast, toggleAppSpinner) {
    const fileInput = document.getElementById('epubUploadForTxt');
    const fileNameEl = document.getElementById('epubFileNameForTxt');
    const clearFileBtn = document.getElementById('clearEpubUploadForTxt');
    const extractBtn = document.getElementById('extractChaptersBtn');
    const statusEl = document.getElementById('statusMessageEpubToZip');
    const enableRemoveLinesToggle = document.getElementById('epubToZipEnableRemoveLines');
    const removeLinesOptionsGroup = document.getElementById('epubToZipRemoveLinesOptionsGroup');
    const linesToRemoveInput = document.getElementById('epubToZipLinesToRemove');
    const chapterSelectionArea = document.getElementById('epubToZipChapterSelectionArea');
    const chapterListUl = document.getElementById('epubToZipChapterList');
    const selectAllChaptersBtn = document.getElementById('epubToZipSelectAllChapters');
    const deselectAllChaptersBtn = document.getElementById('epubToZipDeselectAllChapters');
    let currentEpubFilename = '';

    if (!fileInput || !extractBtn || !enableRemoveLinesToggle || !removeLinesOptionsGroup ||
         !linesToRemoveInput || !fileNameEl || !clearFileBtn || !statusEl ||
         !chapterSelectionArea || !chapterListUl || !selectAllChaptersBtn || !deselectAllChaptersBtn) {
        console.error("EPUB to ZIP UI elements not found.");
        return;
    }

    enableRemoveLinesToggle.addEventListener('change', (e) => {
        removeLinesOptionsGroup.classList.toggle('hidden', !e.target.checked);
    });

    function displayChapterSelectionList(chapters) {
        chapterListUl.innerHTML = '';
        if (chapters.length === 0) {
            chapterSelectionArea.classList.add('hidden');
            return;
        }
        chapters.forEach(entry => {
            chapterListUl.innerHTML += `<li><input type="checkbox" id="${entry.id}" value="${entry.originalIndex}" data-chapter-href="${entry.href}" checked><label for="${entry.id}">${escapeHTML(entry.title)}</label></li>`;
        });
        chapterSelectionArea.classList.remove('hidden');
    }

    selectAllChaptersBtn.addEventListener('click', () => chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true));
    deselectAllChaptersBtn.addEventListener('click', () => chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false));

    const resetUI = () => {
        statusEl.classList.add('hidden');
        extractBtn.disabled = true;
        currentZipInstance = null;
        currentTocEntries = [];
        chapterListUl.innerHTML = '';
        chapterSelectionArea.classList.add('hidden');
    };

    setupFileInput({
        inputEl: fileInput,
        fileNameEl: fileNameEl,
        clearBtnEl: clearFileBtn,
        async onFileSelected(files) {
            const file = files[0];
            resetUI();
            if (!file.name.toLowerCase().endsWith('.epub')) {
                updateStatus(statusEl, 'Error: Please select a valid .epub file.', 'error');
                return;
            }
            currentEpubFilename = file.name;
            updateStatus(statusEl, `Reading ${file.name}...`, 'info');
            toggleAppSpinner(true);
            try {
                const buffer = await readFileAsArrayBuffer(file);
                const JSZip = await getJSZip();
                currentZipInstance = await JSZip.loadAsync(buffer);
                currentTocEntries = await getChapterListFromEpub(currentZipInstance, (msg, isErr) => updateStatus(statusEl, msg, isErr ? 'error' : 'info'));
                if (currentTocEntries.length > 0) {
                    displayChapterSelectionList(currentTocEntries);
                    updateStatus(statusEl, `Found ${currentTocEntries.length} chapters.`, 'success');
                } else {
                    updateStatus(statusEl, 'No chapters found or ToC unparsable.', 'warning');
                }
            } catch (error) {
                console.error("EPUB parsing Error:", error);
                updateStatus(statusEl, `Error: ${error.message}`, 'error');
            } finally {
                toggleAppSpinner(false);
                extractBtn.disabled = currentTocEntries.length === 0;
            }
        },
        onFileCleared: resetUI,
        onButtonUpdate(hasFile) { extractBtn.disabled = !hasFile; }
    });

    extractBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        const selectedCheckboxes = chapterListUl.querySelectorAll('input:checked');
        if (selectedCheckboxes.length === 0) {
            return updateStatus(statusEl, "No chapters selected to extract.", 'error');
        }

        const linesToRemove = enableRemoveLinesToggle.checked ? parseInt(linesToRemoveInput.value, 10) : 0;
        if (isNaN(linesToRemove) || linesToRemove < 0) {
            return updateStatus(statusEl, 'Error: "Lines to remove" must be 0 or greater.', 'error');
        }

        toggleAppSpinner(true);
        try {
            const JSZip = await getJSZip();
            const outputZip = new JSZip();
            let filesAdded = 0;

            for (const cb of selectedCheckboxes) {
                const href = cb.dataset.chapterHref;
                const entry = currentTocEntries.find(e => e.href === href);
                if (!entry) continue;

                const chapterHtml = await readFileFromZip(currentZipInstance, href);
                if (!chapterHtml) continue;
                
                let chapterText = extractTextFromHtml(chapterHtml);
                if (linesToRemove > 0) {
                    chapterText = chapterText.split('\n').slice(linesToRemove).join('\n');
                }

                if (chapterText.trim()) {
                    const filename = `${sanitizeFilenameForZip(entry.title)}.txt`;
                    outputZip.file(filename, chapterText);
                    filesAdded++;
                }
            }

            if (filesAdded > 0) {
                updateStatus(statusEl, `Generating ZIP with ${filesAdded} chapters...`, 'info');
                const zipBlob = await outputZip.generateAsync({ type: "blob" });
                const baseName = currentEpubFilename.replace(/\.epub$/i, '') || 'epub_content';
                await triggerDownload(zipBlob, `${sanitizeFilenameForZip(baseName)}_chapters.zip`, 'application/zip', showAppToast);
                updateStatus(statusEl, `Download started for ${filesAdded} chapters.`, 'success');
            } else {
                updateStatus(statusEl, "No chapter content retrieved after processing.", 'warning');
            }
        } catch (err) {
            console.error("Error during extraction:", err);
            updateStatus(statusEl, `Error: ${err.message}`, 'error');
        } finally {
            toggleAppSpinner(false);
        }
    });
}