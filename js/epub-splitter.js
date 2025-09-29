/**
 * Browser-compatible EPUB Splitter functionality
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';

// Helper function
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
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
    const downloadLink = document.getElementById('downloadLink');
    const chapterPatternLabel = document.querySelector('label[for="chapterPattern"]');
    const tooltipTrigger = chapterPatternLabel?.querySelector('.tooltip-trigger');

    const chapterPatternEl = document.getElementById('chapterPattern');
    const startNumberEl = document.getElementById('startNumber');
    const offsetNumberEl = document.getElementById('offsetNumber');
    const groupSizeEl = document.getElementById('groupSize');

    const chapterSelectionArea = document.getElementById('splitterChapterSelectionArea');
    const chapterListUl = document.getElementById('splitterChapterList');
    const selectAllChaptersBtn = document.getElementById('splitterSelectAllChapters');
    const deselectAllChaptersBtn = document.getElementById('splitterDeselectAllChapters');
    const chapterCountEl = document.getElementById('chapterCount');

    let selectedFile = null;
    let parsedChaptersForSelection = [];

    if (!uploadInput || !splitBtn || !modeSelect || !fileNameEl || !clearFileBtn || !groupSizeGrp ||
        !statusEl || !downloadSec || !downloadLink || !tooltipTrigger || !chapterPatternEl ||
        !startNumberEl || !offsetNumberEl || !groupSizeEl ||
        !chapterSelectionArea || !chapterListUl || !selectAllChaptersBtn || !deselectAllChaptersBtn || !chapterCountEl) {
        console.error("EPUB Splitter UI elements not found. Initialization failed.");
        return;
    }

    tooltipTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        tooltipTrigger.classList.toggle('active');
    });
    tooltipTrigger.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            tooltipTrigger.click();
        }
    });
    document.addEventListener('click', (e) => {
        if (tooltipTrigger.classList.contains('active') && !tooltipTrigger.contains(e.target)) {
            tooltipTrigger.classList.remove('active');
        }
    });

    function resetChapterSelectionUI() {
        if (chapterListUl) chapterListUl.innerHTML = '';
        if (chapterSelectionArea) chapterSelectionArea.classList.add('hidden');
        parsedChaptersForSelection = [];
    }

    function displayChapterSelectionUI(chapters) {
        if (!chapterListUl || !chapterSelectionArea) return;
        chapterListUl.innerHTML = '';

        if (chapters.length === 0) {
            chapterSelectionArea.classList.add('hidden');
            return;
        }

        chapters.forEach((chapInfo, index) => {
            const li = document.createElement('li');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `splitter-chap-${index}`;
            checkbox.value = index.toString();
            checkbox.checked = true;
            checkbox.setAttribute('data-chapter-index', index.toString());

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = chapInfo.title;

            li.appendChild(checkbox);
            li.appendChild(label);
            li.addEventListener('click', (e) => {
                if (e.target !== checkbox) {
                    checkbox.checked = !checkbox.checked;
                }
            });
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

    uploadInput.addEventListener('change', async (e) => {
        const target = e.target;
        selectedFile = target.files ? target.files[0] : null;
        resetChapterSelectionUI();
        statusEl.classList.add('hidden');
        downloadSec.classList.add('hidden');

        if (selectedFile) {
            fileNameEl.textContent = `Selected: ${selectedFile.name}`;
            if(clearFileBtn) clearFileBtn.classList.remove('hidden');
            splitBtn.disabled = true;

            toggleAppSpinner(true);
            try {
                const buffer = await readFileAsArrayBuffer(selectedFile);
                const JSZip = await getJSZip();
                const epub = await JSZip.loadAsync(buffer);
                const tempChapters = [];
                const structure = {};
                const promises = [];

                epub.forEach((path, file) => {
                    structure[path] = { dir: file.dir, contentType: file.options.contentType };
                    if (!file.dir && (path.endsWith('.xhtml') || path.endsWith('.html') ||
                                        path.includes('content.opf') || path.includes('toc.ncx'))) {
                        promises.push(file.async('text').then((c) => structure[path].content = c));
                    }
                });
                await Promise.all(promises);

                const parser = new DOMParser();
                for (let path in structure) {
                    const info = structure[path];
                    if (!info.dir && info.content) {
                        let doc = parser.parseFromString(info.content, 'text/xml');
                        if (doc.querySelector('parsererror')) {
                            doc = parser.parseFromString(info.content, 'text/html');
                        }
                        const sections = doc.querySelectorAll(
                            'section[epub\\:type="chapter"], div[epub\\:type="chapter"], ' +
                            'section.chapter, div.chapter, section[role="chapter"], div[role="chapter"]'
                        );
                        if (sections.length) {
                            sections.forEach(sec => {
                                sec.querySelectorAll('h1,h2,h3,.title,.chapter-title').forEach(el => el.remove());
                                const paras = sec.querySelectorAll('p');
                                const text = paras.length ?
                                    Array.from(paras).map(p => p.textContent?.trim() || '').filter(t => t).join('\n') :
                                    (sec.textContent || '').replace(/\s*\n\s*/g, '\n').trim();
                                if (text) tempChapters.push(text);
                            });
                        } else {
                            const headings = doc.querySelectorAll('h1,h2,h3');
                            if (headings.length > 1) {
                                for (let i = 0; i < headings.length; i++) {
                                    let node = headings[i].nextSibling;
                                    let content = '';
                                    while (node && !(node.nodeType === 1 && /H[1-3]/.test(node.tagName))) {
                                        content += node.nodeType === 1 ? node.textContent + '\n' : node.textContent;
                                        node = node.nextSibling;
                                    }
                                    content = content.replace(/\n{3,}/g, '\n').trim();
                                    if (content) tempChapters.push(content);
                                }
                            }
                        }
                    }
                }

                parsedChaptersForSelection = tempChapters.map((text, index) => ({
                    index: index,
                    title: `Chapter ${index + 1} (Preview: ${text.substring(0, 50).replace(/\s+/g, ' ')}${text.length > 50 ? '...' : ''})`,
                    text: text
                }));

                if (parsedChaptersForSelection.length > 0) {
                    if (chapterCountEl) chapterCountEl.textContent = `${parsedChaptersForSelection.length} chapters found`;
                    displayChapterSelectionUI(parsedChaptersForSelection);
                    splitBtn.disabled = false;
                    showAppToast(`Found ${parsedChaptersForSelection.length} potential chapters. Review selection.`, false);
                } else {
                    if (chapterCountEl) chapterCountEl.textContent = '0 chapters found';
                    showAppToast('No chapters found for selection. Check EPUB structure.', true);
                    statusEl.textContent = 'Error: No chapters found for selection. Check EPUB structure.';
                    statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                    statusEl.classList.remove('hidden');
                    splitBtn.disabled = true;
                }

            } catch (err) {
                console.error("EPUB parsing for chapter selection failed:", err);
                showAppToast(`Error parsing EPUB for chapter list: ${err.message}`, true);
                 statusEl.textContent = `Error: ${err.message || 'Could not parse EPUB for chapter list.'}`;
                 statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                 statusEl.classList.remove('hidden');
                splitBtn.disabled = true;
            } finally {
                toggleAppSpinner(false);
            }

        } else {
            fileNameEl.textContent = '';
            if(clearFileBtn) clearFileBtn.classList.add('hidden');
            splitBtn.disabled = true;
        }
    });

    clearFileBtn.addEventListener('click', () => {
        selectedFile = null;
        uploadInput.value = '';
        fileNameEl.textContent = '';
        clearFileBtn.classList.add('hidden');
        splitBtn.disabled = true;
        statusEl.classList.add('hidden');
        downloadSec.classList.add('hidden');
        if (chapterCountEl) chapterCountEl.textContent = '0 chapters found';
        resetChapterSelectionUI();
    });

    modeSelect.addEventListener('change', () => {
        if (groupSizeGrp) {
            if (modeSelect.value === 'grouped') {
                groupSizeGrp.classList.remove('hidden');
            } else {
                groupSizeGrp.classList.add('hidden');
            }
        }
    });

    splitBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        downloadSec.classList.add('hidden');

        if (!selectedFile) {
            showAppToast("No file selected for EPUB splitting.", true);
            statusEl.textContent = 'Error: No file selected.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.classList.remove('hidden');
            uploadInput.focus();
            return;
        }
        if (parsedChaptersForSelection.length === 0) {
            showAppToast("No chapters available for splitting. Please re-upload or check the EPUB.", true);
            statusEl.textContent = 'Error: No chapters available for splitting.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.classList.remove('hidden');
            return;
        }

        const selectedChapterIndices = [];
        chapterListUl.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            const index = parseInt(cb.value, 10);
            selectedChapterIndices.push(index);
        });

        if (selectedChapterIndices.length === 0) {
            showAppToast("No chapters selected to split. Please select at least one chapter.", true);
            statusEl.textContent = 'Error: No chapters selected to split.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.classList.remove('hidden');
            return;
        }

        const chaptersToProcess = parsedChaptersForSelection
            .filter(chapInfo => selectedChapterIndices.includes(chapInfo.index))
            .map(chapInfo => chapInfo.text);

        const pattern = chapterPatternEl.value.trim() || 'Chapter';
        const startNumber = parseInt(startNumberEl.value, 10);
        if (isNaN(startNumber) || startNumber < 1) {
            showAppToast('Start Number must be 1 or greater.', true);
            statusEl.textContent = 'Error: Start Number must be 1 or greater.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.classList.remove('hidden');
            startNumberEl.focus();
            return;
        }
        const offset = parseInt(offsetNumberEl.value, 10);
        if (isNaN(offset) || offset < 0) {
            showAppToast('Offset must be 0 or greater.', true);
            statusEl.textContent = 'Error: Offset must be 0 or greater.';
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.classList.remove('hidden');
            offsetNumberEl.focus();
            return;
        }

        const mode = modeSelect.value;
        let groupSize = 1;
        if (mode === 'grouped') {
            groupSize = parseInt(groupSizeEl.value, 10);
            if (isNaN(groupSize) || groupSize < 1) {
                showAppToast('Chapters per File (for grouped mode) must be 1 or greater.', true);
                statusEl.textContent = 'Error: Chapters per File must be 1 or greater.';
                statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusEl.classList.remove('hidden');
                groupSizeEl.focus();
                return;
            }
        }

        toggleAppSpinner(true);

        try {
            const usableChaps = chaptersToProcess.slice(offset);
            if (usableChaps.length === 0) {
                showAppToast(`Offset of ${offset} resulted in no chapters to process from your selection.`, true);
                statusEl.textContent = `Warning: Offset of ${offset} resulted in 0 chapters to process from selection.`;
                statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusEl.classList.remove('hidden');
                toggleAppSpinner(false);
                return;
            }
            const effectiveStart = startNumber;
            const JSZip = await getJSZip();
            const zip = new JSZip();

            if (mode === 'single') {
                usableChaps.forEach((text, i) => {
                    const chapNum = String(effectiveStart + i).padStart(2, '0');
                    zip.file(`${pattern}${chapNum}.txt`, text);
                });
            } else { // grouped
                for (let i = 0; i < usableChaps.length; i += groupSize) {
                    const groupStartNum = effectiveStart + i;
                    const groupEndNum = Math.min(
                        effectiveStart + i + groupSize - 1,
                        effectiveStart + usableChaps.length - 1
                    );

                    const name = groupStartNum === groupEndNum ?
                        `${pattern}${String(groupStartNum).padStart(2, '0')}.txt` :
                        `${pattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}.txt`;

                    let content = '';
                    for (let j = 0; j < groupSize && (i + j) < usableChaps.length; j++) {
                        if (j > 0) content += '\n\n\n---------------- END ----------------\n\n\n';
                        content += usableChaps[i + j];
                    }
                    zip.file(name, content);
                }
            }
            const blob = await zip.generateAsync({ type: 'blob' });

            if (downloadLink) {
                const downloadFilename = `${pattern}_chapters.zip`;
                await triggerDownload(blob, downloadFilename, 'application/zip', showAppToast);
            }
            downloadSec.classList.remove('hidden');
            statusEl.textContent = `Extracted ${usableChaps.length} chapter(s) from your selection. Download started.`;
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-green-50 dark:bg-green-600/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400';
            statusEl.classList.remove('hidden');
            showAppToast(`Extracted ${usableChaps.length} chapter(s).`);

        } catch (err) {
            console.error("EPUB Splitter Error:", err);
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
            statusEl.classList.remove('hidden');
            showAppToast(`Error splitting EPUB: ${err.message}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}