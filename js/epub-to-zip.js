/**
 * Browser-compatible EPUB to ZIP converter
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { escapeHTML } from './ui-helpers.js';

let currentZipInstance = null;
let currentTocEntries = [];
const domParser = new DOMParser();
const EPUB_NS = 'http://www.idpf.org/2007/ops';

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result);
        reader.onerror = (error) => reject(new Error(`FileReader error: ${error}`));
        reader.readAsArrayBuffer(file);
    });
}

async function getFileAsString(zip, path) {
    const file = zip.file(path);
    if (!file) {
        console.warn(`File not found in EPUB archive: ${path}`);
        return null;
    }
    return file.async('string').catch(err => {
        console.error(`Error reading file "${path}" from zip:`, err);
        return null;
    });
}

function resolvePath(path, base) {
    // If it's an external URI, return it as is.
    if (/^[a-z]+:/i.test(path)) {
        return path;
    }
    // If it's an absolute path from the root.
    if (path.startsWith('/')) {
        const decodedPath = decodeURIComponent(path);
        return decodedPath.substring(1);
    }
    if (!base) {
        return decodeURIComponent(path);
    }

    // Using URL constructor for robust path resolution for relative paths.
    const dummyBase = 'file:///base/';
    const baseUrl = new URL(base.endsWith('/') ? base : base + '/', dummyBase);
    const resolvedUrl = new URL(path, baseUrl);
    
    // The pathname is percent-encoded, so we need to decode it for jszip.
    return decodeURIComponent(resolvedUrl.pathname.replace(/^\/base\//, ''));
}


function sanitizeFilenameForZip(name) {
    if (!name) return 'download';
    let sanitized = name.replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/__+/g, '_');
    return sanitized.substring(0, 100) || 'file';
}


async function getChapterListFromEpub(zip) {
    const containerXmlText = await getFileAsString(zip, 'META-INF/container.xml');
    if (!containerXmlText) throw new Error('META-INF/container.xml not found.');
    const containerDoc = domParser.parseFromString(containerXmlText, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('Could not find OPF file path in container.xml');
    
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

    const opfText = await getFileAsString(zip, opfPath);
    if (!opfText) throw new Error(`OPF file not found at ${opfPath}`);
    const opfDoc = domParser.parseFromString(opfText, 'application/xml');

    let navPath = opfDoc.querySelector('manifest item[properties~="nav"]')?.getAttribute('href');
    let isNavDoc = true;
    
    if (!navPath) {
        const spineTocId = opfDoc.querySelector('spine[toc]')?.getAttribute('toc');
        if (spineTocId) {
            navPath = opfDoc.querySelector(`manifest item[id="${spineTocId}"]`)?.getAttribute('href');
            isNavDoc = false;
        }
    }
    
    if (!navPath) throw new Error('Could not find NAV or NCX document in OPF manifest.');
    
    const fullNavPath = resolvePath(navPath, opfDir);
    
    const navText = await getFileAsString(zip, fullNavPath);
    if (!navText) throw new Error(`Navigation document not found at ${fullNavPath}`);
    const navDoc = domParser.parseFromString(navText, isNavDoc ? 'application/xhtml+xml' : 'application/xml');
    if (navDoc.querySelector('parsererror')) throw new Error(`Error parsing navigation document: ${fullNavPath}`);

    const chapters = [];
    const navDir = fullNavPath.includes('/') ? fullNavPath.substring(0, fullNavPath.lastIndexOf('/')) : '';

    if (isNavDoc) { // XHTML Nav document
        const navs = Array.from(navDoc.getElementsByTagName('nav'));
        const tocNav = navs.find(n => 
            n.getAttributeNS(EPUB_NS, 'type') === 'toc' ||
            n.getAttribute('epub:type') === 'toc'
        );
        
        let links;
        if (tocNav) {
            links = Array.from(tocNav.getElementsByTagName('a'));
        } else {
            console.warn('No nav element with epub:type="toc" found. Trying all links...');
            links = Array.from(navDoc.getElementsByTagName('a'));
        }

        links.forEach((el, index) => {
            const title = el.textContent?.trim();
            const href = el.getAttribute('href');
            if (title && href) {
                chapters.push({
                    title: title,
                    href: resolvePath(href, navDir),
                    id: `epubzip-chap-${index}`,
                    originalIndex: index
                });
            }
        });
    } else { // NCX document
        const navPoints = Array.from(navDoc.getElementsByTagName('navPoint'));
        navPoints.forEach((el, index) => {
            const title = el.querySelector('navLabel text')?.textContent?.trim();
            const href = el.querySelector('content')?.getAttribute('src');
            if (title && href) {
                chapters.push({
                    title: title,
                    href: resolvePath(href, navDir),
                    id: `epubzip-chap-${index}`,
                    originalIndex: index
                });
            }
        });
    }

    if (chapters.length === 0) throw new Error('No chapters found in the Table of Contents.');
    return chapters;
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
            const li = document.createElement('li');
            li.className = "flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-700";
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = entry.id;
            checkbox.value = entry.originalIndex;
            checkbox.dataset.chapterHref = escapeHTML(entry.href);
            checkbox.checked = true;
            checkbox.className = "w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600";
            
            const label = document.createElement('label');
            label.htmlFor = entry.id;
            label.textContent = escapeHTML(entry.title);
            label.className = "text-sm text-slate-700 dark:text-slate-300 flex-1 cursor-pointer";

            li.appendChild(checkbox);
            li.appendChild(label);
            chapterListUl.appendChild(li);
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
                currentTocEntries = await getChapterListFromEpub(currentZipInstance);
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
            const contentCache = new Map();
            let filesAdded = 0;

            for (const cb of selectedCheckboxes) {
                const fullHref = cb.dataset.chapterHref;
                const entry = currentTocEntries.find(e => e.href === fullHref);
                if (!entry) continue;

                const [filePath, fragmentId] = fullHref.split('#');

                let contentDoc;
                if (contentCache.has(filePath)) {
                    contentDoc = contentCache.get(filePath);
                } else {
                    const chapterHtml = await getFileAsString(currentZipInstance, filePath);
                    if (chapterHtml) {
                        contentDoc = domParser.parseFromString(chapterHtml, 'application/xhtml+xml');
                        if (contentDoc.querySelector('parsererror')) {
                           contentDoc = domParser.parseFromString(chapterHtml, 'text/html');
                        }
                        contentCache.set(filePath, contentDoc);
                    } else {
                        console.warn(`Content file not found: ${filePath}`);
                        continue;
                    }
                }

                if (!contentDoc) continue;
                
                let chapterElement = null;
                if (fragmentId) {
                    const targetElement = contentDoc.getElementById(fragmentId);
                    if (targetElement) {
                        chapterElement = targetElement.closest('section, div, article');
                         if (!chapterElement) {
                            let current = targetElement.parentElement;
                            while (current && current !== contentDoc.body) {
                                const tagName = current.tagName?.toLowerCase();
                                if (tagName === 'section' || tagName === 'div' || tagName === 'article') {
                                    chapterElement = current;
                                    break;
                                }
                                current = current.parentElement;
                            }
                        }
                    } else {
                        console.warn(`Fragment #${fragmentId} not found in ${filePath}`);
                    }
                }
                
                if (!chapterElement) {
                    const sections = Array.from(contentDoc.getElementsByTagName('section'));
                    const chapterSection = sections.find(s => 
                        s.getAttributeNS(EPUB_NS, 'type') === 'chapter' ||
                        s.getAttribute('epub:type') === 'chapter'
                    );
                    
                    if (chapterSection) {
                        chapterElement = chapterSection;
                    } else if (sections.length > 0) {
                        chapterElement = sections[0];
                    } else {
                        chapterElement = contentDoc.body;
                    }
                }

                let chapterText = '';
                if (chapterElement) {
                    const clonedElement = chapterElement.cloneNode(true);
                    clonedElement.querySelectorAll('script, style').forEach(el => el.remove());
                    chapterText = clonedElement.textContent.trim();
                } else {
                     console.warn(`Could not extract chapter content for href: ${fullHref}`);
                }
                
                if (linesToRemove > 0) {
                    chapterText = chapterText.split('\n').slice(linesToRemove).join('\n');
                }

                if (chapterText.trim()) {
                    const filename = `${String(filesAdded + 1).padStart(3, '0')}_${sanitizeFilenameForZip(entry.title)}.txt`;
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
