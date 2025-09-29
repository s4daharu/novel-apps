/**
 * Browser-compatible Find & Replace Backup functionality (Overhauled UI)
 */
import { triggerDownload } from './browser-helpers.js';

// --- STATE ---
let frData = null; // The loaded backup file content (as a JS object)
let allMatches = []; // Array of all found matches across the selected scope
let currentMatchIndex = -1; // Index of the currently highlighted match in `allMatches`
let currentChapterInPreview = -1; // Scene index of the chapter currently shown in the preview pane
let modificationsMade = false; // Flag to enable the download button

// --- DOM ELEMENTS ---
// Main containers
const frUploadArea = document.getElementById('frUploadArea');
const frActionContainer = document.getElementById('frActionContainer');
const frDownloadContainer = document.getElementById('frDownloadContainer');
const frLivePreview = document.getElementById('frLivePreview');
// Upload
const frBackupFileInput = document.getElementById('frBackupFile');
// Bottom Sheet Controls
const frStartBtn = document.getElementById('frStartBtn');
const frBottomSheet = document.getElementById('frBottomSheet');
const frCloseSheetBtn = document.getElementById('frCloseSheetBtn');
const findPatternInput = document.getElementById('findPattern');
const replaceTextInput = document.getElementById('replaceText');
const frScopeSelect = document.getElementById('frScopeSelect');
const useRegexCheckbox = document.getElementById('useRegexBackup');
const caseSensitiveCheckbox = document.getElementById('frCaseSensitiveCheckbox');
const wholeWordCheckbox = document.getElementById('frWholeWordCheckbox');
const matchCountDisplay = document.getElementById('frMatchCountDisplay');
const findPreviousBtn = document.getElementById('findPreviousBtn');
const findNextBtn = document.getElementById('findNextBtn');
const replaceNextBtn = document.getElementById('replaceNextBtn');
const replaceAllBtn = document.getElementById('replaceAllBtn');
const downloadCurrentFrBackupBtn = document.getElementById('downloadCurrentFrBackupBtn');
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

// --- UI UPDATE FUNCTIONS ---
function updateUIVisibility(hasFile) {
    frUploadArea.style.opacity = hasFile ? '0' : '1';
    frUploadArea.style.pointerEvents = hasFile ? 'none' : 'auto';
    frActionContainer.style.display = hasFile ? 'block' : 'none';
    frDownloadContainer.style.display = hasFile ? 'block' : 'none';
}

function toggleBottomSheet(open) {
    frBottomSheet.classList.toggle('open', open);
}

function updateDownloadButtonState() {
    downloadCurrentFrBackupBtn.disabled = !modificationsMade;
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
            renderLivePreview(0, true); // Render the first chapter
            updateUIVisibility(true);
            showAppToast("Backup loaded successfully.");
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
    
    // Add 'All Chapters' option
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `All Chapters (${scenes.length})`;
    frScopeSelect.appendChild(allOpt);

    // Add individual chapter options
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
            .join('\n');
    } catch {
        return "Error: Could not parse chapter content.";
    }
}

function renderLivePreview(sceneIndex, forceRerender = false) {
    if (currentChapterInPreview === sceneIndex && !forceRerender) return;

    currentChapterInPreview = sceneIndex;
    const chapterText = getChapterText(sceneIndex);
    
    let renderedHtml = escapeHtml(chapterText).replace(/\n/g, '<br>');

    // Highlight matches for the current chapter
    const chapterMatches = allMatches.filter(m => m.sceneIndex === sceneIndex);
    if (chapterMatches.length > 0) {
        const parts = [];
        let lastIndex = 0;
        // Sort matches by their position to correctly segment the text
        chapterMatches.sort((a, b) => a.matchIndexInBlock - b.matchIndexInBlock);
        
        chapterMatches.forEach(match => {
             // Use original block text for highlighting
            const matchInBlockText = match.blockText.substring(match.matchIndexInBlock, match.matchIndexInBlock + match.matchLength);

            // Find match start in the full chapter text
            const fullChapterIndex = chapterText.indexOf(match.blockText) + match.matchIndexInBlock;

            parts.push(escapeHtml(chapterText.substring(lastIndex, fullChapterIndex)));
            
            const isCurrent = allMatches[currentMatchIndex] === match;
            parts.push(`<mark class="${isCurrent ? 'current' : ''}" data-match-id="${match.id}">${escapeHtml(matchInBlockText)}</mark>`);
            
            lastIndex = fullChapterIndex + match.matchLength;
        });
        parts.push(escapeHtml(chapterText.substring(lastIndex)));
        renderedHtml = parts.join('').replace(/\n/g, '<br>');
    }

    frLivePreview.innerHTML = `<p>${renderedHtml}</p>`;
    
    // After rendering, scroll to the current match if it's in this chapter
    const currentMatch = allMatches[currentMatchIndex];
    if (currentMatch && currentMatch.sceneIndex === sceneIndex) {
        scrollToCurrentMatch();
    }
}


function performFind() {
    const findPattern = findPatternInput.value;
    if (!findPattern) {
        allMatches = [];
        currentMatchIndex = -1;
        updateMatchCountUI();
        renderLivePreview(currentChapterInPreview, true); // Re-render to remove highlights
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
                            blockText: block.text, // Store original block text
                            matchedText: matchResult[0]
                        });
                        // Prevent infinite loops with zero-length matches
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
        renderLivePreview(currentChapterInPreview, true); // Re-render to remove highlights
    }
}

function navigateToMatch(index) {
    if (index < 0 || index >= allMatches.length) return;

    currentMatchIndex = index;
    const match = allMatches[index];
    
    updateMatchCountUI();
    renderLivePreview(match.sceneIndex, true);
}

function scrollToCurrentMatch() {
    const currentMark = frLivePreview.querySelector('mark.current');
    if (currentMark) {
        currentMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function updateMatchCountUI() {
    if (allMatches.length > 0) {
        matchCountDisplay.textContent = `${currentMatchIndex + 1} of ${allMatches.length}`;
    } else {
        matchCountDisplay.textContent = findPatternInput.value ? "No matches" : "";
    }
}

function performSingleReplace(showAppToast) {
    if (currentMatchIndex === -1) {
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

    // Re-run find and navigate to the same logical position
    const oldIndex = currentMatchIndex;
    performFind();
    if(allMatches.length > 0) {
        navigateToMatch(Math.min(oldIndex, allMatches.length - 1));
    }
}

function showReviewModal() {
    if (allMatches.length === 0) {
        return;
    }
    frReviewList.innerHTML = '';
    const replacementText = replaceTextInput.value;

    allMatches.forEach((match, index) => {
        const li = document.createElement('li');
        li.className = 'fr-review-item';

        const before = escapeHtml(match.blockText.substring(0, match.matchIndexInBlock));
        const after = escapeHtml(match.blockText.substring(match.matchIndexInBlock + match.matchLength));
        
        li.innerHTML = `
            <input type="checkbox" id="review-${index}" data-match-index="${index}" checked>
            <div class="fr-review-item-content">
                <label for="review-${index}">
                    <div class="fr-review-item-meta">In: ${escapeHtml(match.chapterTitle)} (Block ${match.blockIndex + 1})</div>
                    <div class="fr-review-diff">
                        ${before}<del>${escapeHtml(match.matchedText)}</del><ins>${escapeHtml(replacementText)}</ins>${after}
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
    
    // Group changes by scene and block to avoid parsing JSON multiple times
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
        const matchesInBlock = changesByBlock[key].sort((a, b) => b.matchIndexInBlock - a.matchIndexInBlock); // Replace from end to start
        
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
    
    // Reset search
    allMatches = [];
    currentMatchIndex = -1;
    updateMatchCountUI();
    renderLivePreview(currentChapterInPreview, true);
    
    frReviewModal.style.display = 'none';
    showAppToast(`${checkedIndices.length} replacement(s) made.`, false);
    toggleSpinner(false);
    
    // Suggest downloading
    downloadCurrentFrBackupBtn.focus();
}

function resetState() {
    frData = null;
    allMatches = [];
    currentMatchIndex = -1;
    currentChapterInPreview = -1;
    modificationsMade = false;
    frLivePreview.innerHTML = '<p class="fr-preview-placeholder">Upload a backup file to begin.</p>';
    frBackupFileInput.value = '';
    findPatternInput.value = '';
    replaceTextInput.value = '';
    updateDownloadButtonState();
    updateUIVisibility(false);
    toggleBottomSheet(false);
}

const debouncedFind = debounce(performFind, 300);
let frSpinner = null;
const toggleSpinner = (show) => {
    if (frSpinner) frSpinner.style.display = show ? 'block' : 'none';
}


export function initializeFindReplaceBackup(showAppToast, setSpinner) {
    // --- EVENT LISTENERS ---
    frSpinner = document.getElementById('spinnerFindReplaceBackup');

    frBackupFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            loadBackupFile(e.target.files[0], showAppToast);
        }
    });

    frStartBtn.addEventListener('click', () => toggleBottomSheet(true));
    frCloseSheetBtn.addEventListener('click', () => toggleBottomSheet(false));

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
    
    // Reset on tool launch (if it's re-initialized)
    resetState();
}
