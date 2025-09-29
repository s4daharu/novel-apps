/**
 * Browser-compatible Find & Replace Backup functionality (HUD Overhaul)
 */
import { triggerDownload } from './browser-helpers.js';

// --- STATE ---
let frData = null; // The loaded backup file content (as a JS object)
let allMatches = []; // Array of all found matches across the selected scope
let currentMatchIndex = -1; // Index of the currently highlighted match in `allMatches`
let modificationsMade = false; // Flag to enable the download button

const SNIPPET_CONTEXT_LENGTH = 80; // Characters of context before and after match

// --- DOM ELEMENTS ---
// Main containers
const frContainer = document.getElementById('findReplaceBackupApp');
const frUploadArea = document.getElementById('frUploadArea');
const frDownloadContainer = document.getElementById('frDownloadContainer');
const frSnippetPreview = document.getElementById('frSnippetPreview');
// Upload
const frBackupFileInput = document.getElementById('frBackupFile');
// HUD
const frHud = document.getElementById('frHud');
const findPatternInput = document.getElementById('findPattern');
const replaceTextInput = document.getElementById('replaceText');
const frReplaceToggleBtn = document.getElementById('frReplaceToggleBtn');
const frReplaceRow = document.getElementById('frReplaceRow');
const matchCountDisplay = document.getElementById('frMatchCountDisplay');
const findPreviousBtn = document.getElementById('findPreviousBtn');
const findNextBtn = document.getElementById('findNextBtn');
const frDoneBtn = document.getElementById('frDoneBtn');
// HUD Actions
const replaceNextBtn = document.getElementById('replaceNextBtn');
const replaceAllBtn = document.getElementById('replaceAllBtn');
// Options Popover
const frOptionsToggleBtn = document.getElementById('frOptionsToggleBtn');
const frOptionsPopover = document.getElementById('frOptionsPopover');
const frScopeSelect = document.getElementById('frScopeSelect');
const useRegexCheckbox = document.getElementById('useRegexBackup');
const caseSensitiveCheckbox = document.getElementById('frCaseSensitiveCheckbox');
const wholeWordCheckbox = document.getElementById('frWholeWordCheckbox');
// Common
const downloadCurrentFrBackupBtn = document.getElementById('downloadCurrentFrBackupBtn');
let frSpinner = null;
// Review Modal
const frReviewModal = document.getElementById('frReviewModal');
const frCloseReviewModalBtn = document.getElementById('frCloseReviewModalBtn');
const frReviewSelectAll = document.getElementById('frReviewSelectAll');
const frReviewSummaryText = document.getElementById('frReviewSummaryText');
const frReviewList = document.getElementById('frReviewList');
const frCancelReviewBtn = document.getElementById('frCancelReviewBtn');
const frConfirmReplaceAllBtn = document.getElementById('frConfirmReplaceAllBtn');


// --- HELPER FUNCTIONS ---
const escapeHtml = (unsafe) => unsafe.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[match]);
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};
const toggleSpinner = (show) => {
    if (frSpinner) frSpinner.style.display = show ? 'block' : 'none';
};

// --- UI UPDATE FUNCTIONS ---
function updateUIVisibility(hasFile) {
    frUploadArea.style.opacity = hasFile ? '0' : '1';
    frUploadArea.style.pointerEvents = hasFile ? 'none' : 'auto';
    
    frHud.style.display = hasFile ? 'block' : 'none';
    setTimeout(() => {
        if(hasFile) frHud.classList.add('translate-y-0');
        else frHud.classList.remove('translate-y-0');
    }, 10); // Small delay to allow CSS transition
    
    frDownloadContainer.style.display = hasFile ? 'block' : 'none';
}

function updateDownloadButtonState() {
    downloadCurrentFrBackupBtn.disabled = !modificationsMade;
}

function toggleReplaceUI(show) {
    const chevronIcon = frReplaceToggleBtn.querySelector('svg');
    const isCurrentlyExpanded = !frReplaceRow.classList.contains('hidden');
    const expand = show ?? !isCurrentlyExpanded;

    frReplaceToggleBtn.setAttribute('aria-expanded', expand);
    if (expand) {
        frReplaceRow.classList.remove('hidden');
        chevronIcon?.classList.add('rotate-90');
    } else {
        frReplaceRow.classList.add('hidden');
        chevronIcon?.classList.remove('rotate-90');
    }
}


// --- CORE LOGIC ---
function loadBackupFile(file, showAppToast) {
    toggleSpinner(true);
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            frData = JSON.parse(event.target.result);
            if (!frData.revisions?.[0]?.scenes) throw new Error("Invalid backup structure.");
            
            modificationsMade = false;
            updateDownloadButtonState();
            populateScopeSelector();
            
            frSnippetPreview.innerHTML = `<p class="max-w-prose text-left text-slate-500 dark:text-slate-400 italic">Start typing in the find bar below...</p>`;
            updateUIVisibility(true);
            showAppToast("Backup loaded successfully.");
            findPatternInput.focus();

        } catch (err) {
            showAppToast(err.message || "Error parsing backup file.", true);
            resetState();
        } finally {
            toggleSpinner(false);
        }
    };
    reader.onerror = () => {
        showAppToast("Error reading file.", true);
        resetState();
        toggleSpinner(false);
    };
    reader.readAsText(file);
}

function populateScopeSelector() {
    frScopeSelect.innerHTML = '';
    const scenes = frData.revisions[0].scenes;
    
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `All Chapters (${scenes.length})`;
    frScopeSelect.appendChild(allOpt);

    scenes.forEach((scene, index) => {
        const opt = document.createElement('option');
        opt.value = index.toString();
        opt.textContent = scene.title || `Chapter ${index + 1}`;
        frScopeSelect.appendChild(opt);
    });
}

function getChapterText(sceneIndex) {
    try {
        const scene = frData.revisions[0].scenes[sceneIndex];
        const sceneContent = JSON.parse(scene.text);
        return sceneContent.blocks
            .filter(block => block.type === 'text' && typeof block.text === 'string')
            .map(block => block.text)
            .join('\n\n'); // Use double newline to better represent paragraph breaks
    } catch {
        return "Error: Could not parse chapter content.";
    }
}

function renderSnippetPreview(match) {
    if (!match) {
        frSnippetPreview.innerHTML = `<p class="max-w-prose text-left text-slate-500 dark:text-slate-400 italic">No match found. Try another search.</p>`;
        return;
    }
    
    let precedingTextLength = 0;
    let fullChapterIndex = -1;
    const scene = frData.revisions[0].scenes[match.sceneIndex];

    try {
        const sceneContent = JSON.parse(scene.text);
        for (let i = 0; i < match.blockIndex; i++) {
            const block = sceneContent.blocks[i];
            if (block.type === 'text' && typeof block.text === 'string') {
                precedingTextLength += block.text.length + 2; // +2 for the '\n\n' joiner
            }
        }
        fullChapterIndex = precedingTextLength + match.matchIndexInBlock;
    } catch {
        frSnippetPreview.innerHTML = `<p class="max-w-prose text-left text-slate-500 dark:text-slate-400 italic">Error rendering preview for this match.</p>`;
        return;
    }

    const chapterText = getChapterText(match.sceneIndex);

    const start = Math.max(0, fullChapterIndex - SNIPPET_CONTEXT_LENGTH);
    const end = Math.min(chapterText.length, fullChapterIndex + match.matchLength + SNIPPET_CONTEXT_LENGTH);

    const prefix = start > 0 ? '... ' : '';
    const suffix = end < chapterText.length ? ' ...' : '';

    const beforeText = escapeHtml(chapterText.substring(start, fullChapterIndex));
    const matchedText = escapeHtml(chapterText.substring(fullChapterIndex, fullChapterIndex + match.matchLength));
    const afterText = escapeHtml(chapterText.substring(fullChapterIndex + match.matchLength, end));

    frSnippetPreview.innerHTML = `<div class="max-w-prose text-left">
        <p>${prefix}${beforeText}<mark class="bg-primary-500 text-white rounded-sm px-1 shadow-md">${matchedText}</mark>${afterText}${suffix}</p>
    </div>`;
}

function performFind() {
    const findPattern = findPatternInput.value;
    if (!findPattern) {
        allMatches = [];
        currentMatchIndex = -1;
        updateMatchCountUI();
        frSnippetPreview.innerHTML = `<p class="max-w-prose text-left text-slate-500 dark:text-slate-400 italic">Start typing to find text...</p>`;
        return;
    }

    const useRegex = useRegexCheckbox.checked;
    const caseSensitive = caseSensitiveCheckbox.checked;
    const wholeWord = wholeWordCheckbox.checked && !useRegex;

    let regex;
    try {
        if (useRegex) {
            regex = new RegExp(findPattern, `g${caseSensitive ? '' : 'i'}`);
        } else {
            const escapedPattern = findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const flags = `g${caseSensitive ? '' : 'i'}`;
            regex = new RegExp(wholeWord ? `\\b${escapedPattern}\\b` : escapedPattern, flags);
        }
    } catch (e) {
        matchCountDisplay.textContent = "Invalid Regex";
        return;
    }

    allMatches = [];
    const scope = frScopeSelect.value;
    const scenes = frData.revisions[0].scenes;
    const indicesToSearch = scope === 'all' ? scenes.map((_, i) => i) : [parseInt(scope, 10)];
    let matchId = 0;

    indicesToSearch.forEach(sceneIndex => {
        const scene = scenes[sceneIndex];
        try {
            const sceneContent = JSON.parse(scene.text);
            sceneContent.blocks.forEach((block, blockIndex) => {
                if (block.type === 'text' && typeof block.text === 'string' && block.text) {
                    let matchResult;
                    while ((matchResult = regex.exec(block.text)) !== null) {
                        allMatches.push({
                            id: matchId++,
                            sceneIndex,
                            blockIndex,
                            matchIndexInBlock: matchResult.index,
                            matchLength: matchResult[0].length,
                            chapterTitle: scene.title,
                            blockText: block.text,
                            matchedText: matchResult[0]
                        });
                        if (matchResult.index === regex.lastIndex) regex.lastIndex++;
                    }
                }
            });
        } catch (e) { console.warn(`Could not parse scene ${sceneIndex} content.`); }
    });

    if (allMatches.length > 0) {
        navigateToMatch(0);
    } else {
        currentMatchIndex = -1;
        updateMatchCountUI();
        renderSnippetPreview(null);
    }
}

function navigateToMatch(index) {
    if (allMatches.length === 0) return;
    if (index < 0 || index >= allMatches.length) return;

    currentMatchIndex = index;
    updateMatchCountUI();
    renderSnippetPreview(allMatches[currentMatchIndex]);
}

function updateMatchCountUI() {
    findNextBtn.disabled = allMatches.length <= 1;
    findPreviousBtn.disabled = allMatches.length <= 1;

    if (allMatches.length > 0) {
        matchCountDisplay.textContent = `${currentMatchIndex + 1} / ${allMatches.length}`;
    } else {
        matchCountDisplay.textContent = findPatternInput.value ? "No results" : "";
    }
}

function performSingleReplace(showAppToast) {
    if (currentMatchIndex === -1 || !allMatches[currentMatchIndex]) {
        showAppToast("No match selected to replace.", true);
        return;
    }

    const match = allMatches[currentMatchIndex];
    const replacementText = replaceTextInput.value;
    
    const scene = frData.revisions[0].scenes[match.sceneIndex];
    const sceneContent = JSON.parse(scene.text);
    const block = sceneContent.blocks[match.blockIndex];

    const newText = block.text.substring(0, match.matchIndexInBlock) +
                    replacementText +
                    block.text.substring(match.matchIndexInBlock + match.matchLength);
    
    block.text = newText;
    scene.text = JSON.stringify(sceneContent);

    modificationsMade = true;
    updateDownloadButtonState();
    
    const oldIndex = currentMatchIndex;
    performFind();
    if(allMatches.length > 0) {
        navigateToMatch(Math.min(oldIndex, allMatches.length - 1));
    }
}

function showReviewModal() {
    if (allMatches.length === 0) return;
    frReviewList.innerHTML = '';
    const replacementText = replaceTextInput.value;

    allMatches.forEach((match, index) => {
        const li = document.createElement('li');
        li.className = 'p-4 border-b border-slate-200 dark:border-slate-700 flex gap-4';

        const before = escapeHtml(match.blockText.substring(0, match.matchIndexInBlock));
        const after = escapeHtml(match.blockText.substring(match.matchIndexInBlock + match.matchLength));
        
        li.innerHTML = `
            <input type="checkbox" id="review-${index}" data-match-index="${index}" class="mt-1.5 accent-primary-600" checked>
            <div class="flex-grow">
                <label for="review-${index}" class="cursor-pointer">
                    <div class="text-xs text-slate-500 dark:text-slate-400 mb-2">In: ${escapeHtml(match.chapterTitle)} (Block ${match.blockIndex + 1})</div>
                    <div class="font-mono text-sm whitespace-pre-wrap break-words leading-relaxed text-slate-800 dark:text-slate-200">
                        ${before}<del class="bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 no-underline rounded-sm px-1 py-0.5">${escapeHtml(match.matchedText)}</del><ins class="bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-300 no-underline rounded-sm px-1 py-0.5">${escapeHtml(replacementText)}</ins>${after}
                    </div>
                </label>
            </div>
        `;
        frReviewList.appendChild(li);
    });

    frReviewSummaryText.textContent = `${allMatches.length} replacement(s) proposed`;
    frReviewSelectAll.checked = true;
    frReviewModal.style.display = 'flex';
}

function confirmReplaceAll(showAppToast) {
    const checkedIndices = Array.from(frReviewList.querySelectorAll('input:checked'))
                                .map(cb => parseInt(cb.dataset.matchIndex, 10));
    
    if (checkedIndices.length === 0) {
        showAppToast("No changes selected to apply.", false);
        frReviewModal.style.display = 'none';
        return;
    }

    toggleSpinner(true);
    
    const changesByBlock = {};
    checkedIndices.forEach(index => {
        const match = allMatches[index];
        const key = `${match.sceneIndex}-${match.blockIndex}`;
        if (!changesByBlock[key]) {
            changesByBlock[key] = [];
        }
        changesByBlock[key].push(match);
    });
    
    const replacementText = replaceTextInput.value;
    
    for (const key in changesByBlock) {
        const [sceneIndex, blockIndex] = key.split('-').map(Number);
        const matchesInBlock = changesByBlock[key].sort((a, b) => b.matchIndexInBlock - a.matchIndexInBlock);
        
        const scene = frData.revisions[0].scenes[sceneIndex];
        const sceneContent = JSON.parse(scene.text);
        let blockText = sceneContent.blocks[blockIndex].text;

        matchesInBlock.forEach(match => {
            blockText = blockText.substring(0, match.matchIndexInBlock) +
                        replacementText +
                        blockText.substring(match.matchIndexInBlock + match.matchLength);
        });

        sceneContent.blocks[blockIndex].text = blockText;
        scene.text = JSON.stringify(sceneContent);
    }

    modificationsMade = true;
    updateDownloadButtonState();
    
    findPatternInput.value = '';
    performFind();
    
    frReviewModal.style.display = 'none';
    showAppToast(`${checkedIndices.length} replacement(s) made.`, false);
    toggleSpinner(false);
    
    downloadCurrentFrBackupBtn.focus();
}

function resetState() {
    frData = null;
    allMatches = [];
    currentMatchIndex = -1;
    modificationsMade = false;
    frSnippetPreview.innerHTML = '<p class="max-w-prose text-left text-slate-500 dark:text-slate-400 italic">Upload a backup file to begin.</p>';
    frBackupFileInput.value = '';
    findPatternInput.value = '';
    replaceTextInput.value = '';
    updateDownloadButtonState();
    updateUIVisibility(false);
    toggleReplaceUI(false);
    frOptionsPopover.style.display = 'none';
}

const debouncedFind = debounce(performFind, 300);

export function initializeFindReplaceBackup(showAppToast, setSpinner) {
    frSpinner = document.getElementById('spinnerFindReplaceBackup');

    frBackupFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            loadBackupFile(e.target.files[0], showAppToast);
        }
    });

    frDoneBtn.addEventListener('click', resetState);

    frReplaceToggleBtn.addEventListener('click', () => toggleReplaceUI());

    frOptionsToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = frOptionsPopover.style.display === 'none';
        frOptionsPopover.style.display = isHidden ? 'block' : 'none';
    });
    
    document.addEventListener('click', (e) => {
        if (frOptionsPopover.style.display === 'block' && !frHud.contains(e.target)) {
            frOptionsPopover.style.display = 'none';
        }
    });


    [findPatternInput, useRegexCheckbox, caseSensitiveCheckbox, wholeWordCheckbox, frScopeSelect].forEach(el => {
        el.addEventListener('input', debouncedFind);
    });
    wholeWordCheckbox.addEventListener('change', () => {
        if (wholeWordCheckbox.checked) useRegexCheckbox.checked = false;
    });
    useRegexCheckbox.addEventListener('change', () => {
        if (useRegexCheckbox.checked) wholeWordCheckbox.checked = false;
    });

    findNextBtn.addEventListener('click', () => navigateToMatch((currentMatchIndex + 1) % allMatches.length));
    findPreviousBtn.addEventListener('click', () => navigateToMatch((currentMatchIndex - 1 + allMatches.length) % allMatches.length));

    replaceNextBtn.addEventListener('click', () => performSingleReplace(showAppToast));
    replaceAllBtn.addEventListener('click', () => {
        performFind(); // Ensure matches are up to date
        if (allMatches.length > 0) {
            showReviewModal();
        } else {
            showAppToast("No matches found to replace.", false);
        }
    });

    downloadCurrentFrBackupBtn.addEventListener('click', async () => {
        if (!frData || !modificationsMade) {
            showAppToast("No modifications to download.", false);
            return;
        }
        toggleSpinner(true);
        try {
            const now = Date.now();
            frData.last_update_date = now;
            frData.last_backup_date = now;
            if (frData.revisions?.[0]) frData.revisions[0].date = now;
            const blob = new Blob([JSON.stringify(frData, null, 2)], { type: 'application/json' });
            const filename = `${frData.title.replace(/[^a-z0-9_\-\s]/gi, '_') || 'modified_backup'}.json`;
            await triggerDownload(blob, filename, 'application/json', showAppToast);
        } catch (err) {
            showAppToast("Error creating download.", true);
        } finally {
            toggleSpinner(false);
        }
    });

    // Review Modal Listeners
    frCloseReviewModalBtn.addEventListener('click', () => frReviewModal.style.display = 'none');
    frCancelReviewBtn.addEventListener('click', () => frReviewModal.style.display = 'none');
    frConfirmReplaceAllBtn.addEventListener('click', () => confirmReplaceAll(showAppToast));
    frReviewSelectAll.addEventListener('change', (e) => {
        frReviewList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked);
    });
    
    // Reset on tool launch
    resetState();
}