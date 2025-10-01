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
                
                const containerXml = await epub.file('META-INF/container.xml').async('text');
                const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
                const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
                
                const opfContent = await epub.file(opfPath).async('text');
                const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
                
                const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
                
                const manifestItems = {};
                opfDoc.querySelectorAll('manifest > item').forEach(item => {
                    manifestItems[item.getAttribute('id')] = item.getAttribute('href');
                });
                
                const spineItems = [];
                opfDoc.querySelectorAll('spine > itemref').forEach(itemref => {
                    const idref = itemref.getAttribute('idref');
                    const href = manifestItems[idref];
                    if (href && !href.includes('toc') && !href.includes('nav')) {
                        spineItems.push(opfBasePath + href);
                    }
                });
                
                const tempChapters = [];
                const parser = new DOMParser();

                const extractChapterContent = (doc_element) => {
                    const clone = doc_element.cloneNode(true);
                    // More robustly remove titles and unwanted elements
                    clone.querySelectorAll('script, style, nav, header, footer, .toc, .page-break, [epub\\:type="pagebreak"], [role="navigation"], h1, h2, h3, .title, .chapter-title').forEach(el => el.remove());
                
                    function convertNodeToText(node) {
                        let text = '';
                        if (node.nodeType === Node.TEXT_NODE) {
                            // For text nodes, just return their content.
                            return node.textContent;
                        }
                        if (node.nodeType !== Node.ELEMENT_NODE) {
                            // Ignore comments, etc.
                            return '';
                        }
                
                        const tagName = node.tagName.toLowerCase();
                        // Treat these tags as block-level, causing line breaks.
                        const isBlock = ['p', 'div', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'header', 'footer', 'tr', 'br', 'hr'].includes(tagName);
                
                        // Add a newline before processing a block element's content.
                        if (isBlock) text += '\n';
                
                        // Recursively process child nodes.
                        for (const child of node.childNodes) {
                            text += convertNodeToText(child);
                        }
                        
                        // Add a newline after a block element's content.
                        if (isBlock) text += '\n';
                        
                        return text;
                    }
                
                    let rawText = convertNodeToText(clone);
                
                    // Post-processing to create clean paragraphs from the raw text.
                    return rawText
                        .replace(/\r\n?/g, '\n') // Normalize line endings.
                        .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace.
                        .split('\n')             // Split into lines.
                        .map(line => line.trim())  // Trim whitespace from each line.
                        .filter(line => line.length > 0) // Remove empty lines.
                        .join('\n\n');           // Join paragraphs with a double newline.
                };
                
                for (const spinePath of spineItems) {
                    const file = epub.file(spinePath);
                    if (!file) continue;
                    
                    const content = await file.async('text');
                    let doc = parser.parseFromString(content, 'application/xhtml+xml');
                    if (doc.querySelector("parsererror")) {
                        doc = parser.parseFromString(content, 'text/html');
                    }

                    const chapterSections = doc.querySelectorAll('section[epub\\:type="chapter"], section[*|type="chapter"]');
                    
                    if (chapterSections.length > 0) {
                        chapterSections.forEach((section) => {
                            const titleEl = section.querySelector('h1, h2, h3');
                            const title = titleEl ? titleEl.textContent.trim() : `Chapter ${tempChapters.length + 1}`;
                            const text = extractChapterContent(section);
                            
                            if (text) {
                                tempChapters.push({ title, text });
                            }
                        });
                    } else if (doc.body) {
                        const titleEl = doc.body.querySelector('h1, h2, h3, title');
                        const title = titleEl ? titleEl.textContent.trim() : `Chapter ${tempChapters.length + 1}`;
                        const text = extractChapterContent(doc.body);
                        
                        if (text) {
                            tempChapters.push({ title, text });
                        }
                    }
                }
                
                parsedChaptersForSelection = tempChapters.map((chap, index) => ({
                    index: index,
                    title: chap.title,
                    text: chap.text
                }));
                
                displayChapterSelectionUI(parsedChaptersForSelection);
                
                if (parsedChaptersForSelection.length > 0) {
                    showAppToast(`Found ${parsedChaptersForSelection.length} chapters.`, false);
                } else {
                    showAppToast('No chapters found. Check EPUB structure.', true);
                    updateStatus(statusEl, 'Error: No chapters found.', 'error');
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
