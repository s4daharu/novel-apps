/**
 * Browser-compatible EPUB Splitter functionality
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';

// Helper function
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Parses an EPUB file to extract a structured list of chapters.
 * @param {File} epubFile The EPUB file object.
 * @returns {Promise<Array<{title: string, text: string}>>} A promise that resolves to an array of chapter objects.
 */
async function parseEpubForChapters(epubFile) {
    const parser = new DOMParser();
    const EPUB_NS = 'http://www.idpf.org/2007/ops';

    const getFileAsString = async (zip, path) => {
        const file = zip.file(path);
        if (!file) return null;
        return file.async('string');
    };
    
    const resolvePath = (path, base) => {
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
        
        return decodeURIComponent(resolvedUrl.pathname.replace(/^\/base\//, ''));
    };

    const buffer = await readFileAsArrayBuffer(epubFile);
    const JSZip = await getJSZip();
    const epub = await JSZip.loadAsync(buffer);
    
    const containerXmlText = await getFileAsString(epub, 'META-INF/container.xml');
    if (!containerXmlText) throw new Error('META-INF/container.xml not found.');
    const containerDoc = parser.parseFromString(containerXmlText, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('Could not find OPF file path in container.xml');
    
    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

    const opfText = await getFileAsString(epub, opfPath);
    if (!opfText) throw new Error(`OPF file not found at ${opfPath}`);
    const opfDoc = parser.parseFromString(opfText, 'application/xml');

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
    
    const navText = await getFileAsString(epub, fullNavPath);
    if (!navText) throw new Error(`Navigation document not found at ${fullNavPath}`);
    const navDoc = parser.parseFromString(navText, isNavDoc ? 'application/xhtml+xml' : 'application/xml');
    if (navDoc.querySelector('parsererror')) throw new Error(`Error parsing navigation document: ${fullNavPath}`);

    const chapterLinks = [];
    const navDir = fullNavPath.includes('/') ? fullNavPath.substring(0, fullNavPath.lastIndexOf('/')) : '';
    
    if (isNavDoc) { // XHTML Nav document
        const navs = Array.from(navDoc.getElementsByTagName('nav'));
        // FIX: Use getAttributeNS for namespaced attributes
        const tocNav = navs.find(n => 
            n.getAttributeNS(EPUB_NS, 'type') === 'toc' ||
            n.getAttribute('epub:type') === 'toc' // Fallback for non-standard parsing
        );
        
        if (tocNav) {
            const links = Array.from(tocNav.getElementsByTagName('a'));
            links.forEach(el => {
                const title = el.textContent?.trim();
                const href = el.getAttribute('href');
                if (title && href) {
                    chapterLinks.push({ title, href: resolvePath(href, navDir) });
                }
            });
        } else {
            console.warn('No nav element with epub:type="toc" found. Trying all links...');
            // Fallback: get all links if TOC nav not found
            const links = Array.from(navDoc.getElementsByTagName('a'));
            links.forEach(el => {
                const title = el.textContent?.trim();
                const href = el.getAttribute('href');
                if (title && href) {
                    chapterLinks.push({ title, href: resolvePath(href, navDir) });
                }
            });
        }
    } else { // NCX document
        const navPoints = Array.from(navDoc.getElementsByTagName('navPoint'));
        navPoints.forEach(el => {
            const textEl = el.querySelector('navLabel text');
            const title = textEl?.textContent?.trim();
            const contentEl = el.querySelector('content');
            const href = contentEl?.getAttribute('src');
            if (title && href) {
                chapterLinks.push({ title, href: resolvePath(href, navDir) });
            }
        });
    }

    if (chapterLinks.length === 0) throw new Error('No chapters found in the Table of Contents.');

    const contentCache = new Map();
    const chapters = [];
    
    for (const link of chapterLinks) {
        const [filePath, fragmentId] = link.href.split('#');
        if (!filePath) continue;
        
        let contentDoc;
        if (contentCache.has(filePath)) {
            contentDoc = contentCache.get(filePath);
        } else {
            const contentHtml = await getFileAsString(epub, filePath);
            if (contentHtml) {
                contentDoc = parser.parseFromString(contentHtml, 'application/xhtml+xml');
                if (contentDoc.querySelector('parsererror')) {
                    contentDoc = parser.parseFromString(contentHtml, 'text/html');
                }
                contentCache.set(filePath, contentDoc);
            } else {
                console.warn(`Content file not found: ${filePath}`);
                continue;
            }
        }
        
        let chapterElement = null;
        
        if (fragmentId) {
            const targetElement = contentDoc.getElementById(fragmentId);
            
            if (targetElement) {
                // Try .closest() first (works in modern browsers)
                chapterElement = targetElement.closest('section, div, article');
                
                // Fallback: manually walk up the DOM tree
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
        
        // Fallback: if no fragment or element not found, try to find first chapter section
        if (!chapterElement) {
            // Try to find section with epub:type="chapter"
            const sections = Array.from(contentDoc.getElementsByTagName('section'));
            const chapterSection = sections.find(s => 
                s.getAttributeNS(EPUB_NS, 'type') === 'chapter' ||
                s.getAttribute('epub:type') === 'chapter'
            );
            
            if (chapterSection) {
                chapterElement = chapterSection;
            } else if (sections.length > 0) {
                // Use first section if no explicit chapter sections
                chapterElement = sections[0];
            } else {
                // Last resort: use entire body
                chapterElement = contentDoc.body;
            }
        }

        if (chapterElement) {
            // Cloning prevents modification of the cached DOM object.
            const clonedElement = chapterElement.cloneNode(true);
            clonedElement.querySelectorAll('script, style').forEach(el => el.remove());
            const text = clonedElement.textContent.trim();
            
            if (text && text.length > 20) { // Ensure meaningful content
                chapters.push({ title: link.title, text });
            } else {
                console.warn(`Chapter "${link.title}" has insufficient content (${text.length} chars)`);
            }
        } else {
            console.warn(`Could not extract chapter content for href: ${link.href}`);
        }
    }
    
    return chapters;
}

export function initializeEpubSplitter(showAppToast, toggleAppSpinner) {
    const uploadInput = document.getElementById('epubUpload');
    const fileNameEl = document.getElementById('epubFileName');
    const clearFileBtn = document.getElementById('clearEpubUpload');
    const splitBtn = document.getElementById('splitBtn');
    const modeSelect = document.getElementById('modeSelect');
    const groupSizeGrp = document.getElementById('groupSizeGroup');
    const statusEl = document.getElementById('statusMessage');
    const downloadSec = document.querySelector('#splitterApp .download-section');
    const chapterPatternEl = document.getElementById('chapterPattern');
    const startNumberEl = document.getElementById('startNumber');
    const offsetNumberEl = document.getElementById('offsetNumber');
    const groupSizeEl = document.getElementById('groupSize');
    const chapterSelectionArea = document.getElementById('splitterChapterSelectionArea');
    const chapterListUl = document.getElementById('splitterChapterList');
    const selectAllChaptersBtn = document.getElementById('splitterSelectAllChapters');
    const deselectAllChaptersBtn = document.getElementById('splitterDeselectAllChapters');
    const chapterCountEl = document.getElementById('chapterCount');

    let parsedChaptersForSelection = [];

    if (!uploadInput || !splitBtn || !modeSelect || !fileNameEl || !clearFileBtn || !groupSizeGrp ||
        !statusEl || !downloadSec || !chapterPatternEl ||
        !startNumberEl || !offsetNumberEl || !groupSizeEl ||
        !chapterSelectionArea || !chapterListUl || !selectAllChaptersBtn || !deselectAllChaptersBtn || !chapterCountEl) {
        console.error("EPUB Splitter UI elements not found. Initialization failed.");
        return;
    }

    function resetChapterSelectionUI() {
        chapterListUl.innerHTML = '';
        chapterSelectionArea.classList.add('hidden');
        parsedChaptersForSelection = [];
    }

    function displayChapterSelectionUI(chapters) {
        chapterListUl.innerHTML = '';
        chapterCountEl.textContent = `${chapters.length} chapters found`;

        if (chapters.length === 0) {
            chapterSelectionArea.classList.add('hidden');
            return;
        }

        chapters.forEach((chapInfo, index) => {
            const li = document.createElement('li');
            li.className = "flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-700";
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `splitter-chap-${index}`;
            checkbox.value = index.toString();
            checkbox.checked = true;
            checkbox.setAttribute('data-chapter-index', index.toString());
            checkbox.className = "w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600";

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = chapInfo.title;
            label.className = "text-sm text-slate-700 dark:text-slate-300 flex-1 cursor-pointer";

            li.appendChild(checkbox);
            li.appendChild(label);
            chapterListUl.appendChild(li);
        });
        chapterSelectionArea.classList.remove('hidden');
    }

    selectAllChaptersBtn.addEventListener('click', () => {
        chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = true));
    });

    deselectAllChaptersBtn.addEventListener('click', () => {
        chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
    });

    setupFileInput({
        inputEl: uploadInput,
        fileNameEl: fileNameEl,
        clearBtnEl: clearFileBtn,
        async onFileSelected(files) {
            const selectedFile = files[0];
            resetChapterSelectionUI();
            statusEl.classList.add('hidden');
            downloadSec.classList.add('hidden');
            splitBtn.disabled = true;

            toggleAppSpinner(true);
            try {
                const chapters = await parseEpubForChapters(selectedFile);
                
                parsedChaptersForSelection = chapters.map((chap, index) => ({
                    index: index,
                    title: chap.title,
                    text: chap.text
                }));

                displayChapterSelectionUI(parsedChaptersForSelection);

                if (parsedChaptersForSelection.length > 0) {
                    showAppToast(`Found ${parsedChaptersForSelection.length} chapters. Review selection.`, false);
                } else {
                    showAppToast('No chapters found for selection. Check EPUB structure.', true);
                    updateStatus(statusEl, 'Error: No chapters found for selection. Check EPUB structure.', 'error');
                }

            } catch (err) {
                console.error("EPUB parsing failed:", err);
                showAppToast(`Error parsing EPUB: ${err.message}`, true);
                updateStatus(statusEl, `Error: ${err.message || 'Could not parse EPUB.'}`, 'error');
            } finally {
                toggleAppSpinner(false);
                splitBtn.disabled = parsedChaptersForSelection.length === 0;
            }
        },
        onFileCleared() {
            resetChapterSelectionUI();
            statusEl.classList.add('hidden');
            downloadSec.classList.add('hidden');
            splitBtn.disabled = true;
        }
    });

    modeSelect.addEventListener('change', () => {
        groupSizeGrp.classList.toggle('hidden', modeSelect.value !== 'grouped');
    });

    splitBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        downloadSec.classList.add('hidden');

        const selectedChapterIndices = Array.from(chapterListUl.querySelectorAll('input[type="checkbox"]:checked'))
                                            .map(cb => parseInt(cb.value, 10));

        if (selectedChapterIndices.length === 0) {
            showAppToast("No chapters selected to split.", true);
            return updateStatus(statusEl, 'Error: No chapters selected to split.', 'error');
        }
        
        const chaptersToProcess = parsedChaptersForSelection
            .filter(chapInfo => selectedChapterIndices.includes(chapInfo.index))
            .map(chapInfo => chapInfo.text);

        const pattern = chapterPatternEl.value.trim() || 'Chapter';
        const startNumber = parseInt(startNumberEl.value, 10);
        if (isNaN(startNumber) || startNumber < 1) {
            startNumberEl.focus();
            return updateStatus(statusEl, 'Error: Start Number must be 1 or greater.', 'error');
        }
        const offset = parseInt(offsetNumberEl.value, 10);
        if (isNaN(offset) || offset < 0) {
            offsetNumberEl.focus();
            return updateStatus(statusEl, 'Error: Offset must be 0 or greater.', 'error');
        }

        const mode = modeSelect.value;
        let groupSize = 1;
        if (mode === 'grouped') {
            groupSize = parseInt(groupSizeEl.value, 10);
            if (isNaN(groupSize) || groupSize < 1) {
                groupSizeEl.focus();
                return updateStatus(statusEl, 'Error: Chapters per File must be 1 or greater.', 'error');
            }
        }

        toggleAppSpinner(true);

        try {
            const usableChaps = chaptersToProcess.slice(offset);
            if (usableChaps.length === 0) {
                throw new Error(`Offset of ${offset} resulted in no chapters to process from your selection.`);
            }
            
            const JSZip = await getJSZip();
            const zip = new JSZip();

            if (mode === 'single') {
                usableChaps.forEach((text, i) => {
                    const chapNum = String(startNumber + i).padStart(2, '0');
                    zip.file(`${pattern}${chapNum}.txt`, text);
                });
            } else { // grouped
                for (let i = 0; i < usableChaps.length; i += groupSize) {
                    const groupStartNum = startNumber + i;
                    const groupEndNum = Math.min(startNumber + i + groupSize - 1, startNumber + usableChaps.length - 1);
                    const name = groupStartNum === groupEndNum
                        ? `${pattern}${String(groupStartNum).padStart(2, '0')}.txt`
                        : `${pattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}.txt`;
                    
                    const content = usableChaps.slice(i, i + groupSize).join('\n\n\n---------------- END ----------------\n\n\n');
                    zip.file(name, content);
                }
            }
            const blob = await zip.generateAsync({ type: 'blob' });

            const downloadFilename = `${pattern}_chapters.zip`;
            await triggerDownload(blob, downloadFilename, 'application/zip', showAppToast);

            updateStatus(statusEl, `Extracted ${usableChaps.length} chapter(s). Download started.`, 'success');
            showAppToast(`Extracted ${usableChaps.length} chapter(s).`);

        } catch (err) {
            console.error("EPUB Splitter Error:", err);
            updateStatus(statusEl, `Error: ${err.message}`, 'error');
            showAppToast(`Error splitting EPUB: ${err.message}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
