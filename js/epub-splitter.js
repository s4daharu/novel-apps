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
                const buffer = await readFileAsArrayBuffer(selectedFile);
                const JSZip = await getJSZip();
                const epub = await JSZip.loadAsync(buffer);
                const tempChapters = [];
                // Simplified chapter finding logic
                const contentFiles = [];
                epub.forEach((path, file) => {
                    if (!file.dir && (path.toLowerCase().endsWith('.xhtml') || path.toLowerCase().endsWith('.html'))) {
                       contentFiles.push(file.async('text'));
                    }
                });

                const contents = await Promise.all(contentFiles);
                const parser = new DOMParser();
                contents.forEach(content => {
                    const doc = parser.parseFromString(content, 'text/html');
                    const text = doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
                    if (text.length > 200) { // Arbitrary length to filter out small/nav files
                       tempChapters.push(doc.body.textContent.trim());
                    }
                });
                
                parsedChaptersForSelection = tempChapters.map((text, index) => ({
                    index: index,
                    title: `Chapter ${index + 1} (Preview: ${text.substring(0, 50).replace(/\s+/g, ' ')}${text.length > 50 ? '...' : ''})`,
                    text: text
                }));

                displayChapterSelectionUI(parsedChaptersForSelection);

                if (parsedChaptersForSelection.length > 0) {
                    showAppToast(`Found ${parsedChaptersForSelection.length} potential chapters. Review selection.`, false);
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
