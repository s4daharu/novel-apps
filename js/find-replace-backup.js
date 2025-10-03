/**
 * Browser-compatible Find & Replace Backup functionality (HUD Overhaul)
 */
import { triggerDownload } from './browser-helpers.js';

// --- STATE ---
let frData = null; // The loaded backup file content (as a JS object)
let loadedFileName = ''; // Name of the loaded file
let allMatches = []; // Array of all found matches across the selected scope
let currentMatchIndex = -1; // Index of the currently highlighted match in `allMatches`
let modificationsMade = false; // Flag to enable the download button
const CONTEXT_LENGTH = 100; // Characters of context before/after match

// --- DOM ELEMENTS (DECLARED AT MODULE LEVEL FOR WIDER ACCESS) ---
let frContainer, frUploadArea, frBackupFileInput,
    frHeader, frFileName, downloadCurrentFrBackupBtn, frCloseToolBtn,
    frMainContent, frSingleResultPreview, frHelperText,
    frHud, findPatternInput, replaceTextInput,
    matchCountDisplay, findPreviousBtn, findNextBtn,
    replaceNextBtn, replaceAllBtn,
    useRegexCheckbox, caseSensitiveCheckbox, wholeWordCheckbox,
    frSpinner, frReviewModal, frCloseReviewModalBtn,
    frReviewSelectAll, frReviewSummaryText, frReviewList, frCancelReviewBtn,
    frConfirmReplaceAllBtn;

// --- HELPER FUNCTIONS ---
const escapeHtml = (unsafe) => unsafe.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[match]);

// --- INITIALIZATION ---
export function initializeFindReplaceBackup(showAppToast, toggleAppSpinnerFunc) {
    // --- DOM ELEMENT ASSIGNMENT ---
    frContainer = document.getElementById('findReplaceBackupApp');
    if (!frContainer) {
        console.error("Find & Replace tool root element not found. Initialization failed.");
        return;
    }
    frUploadArea = document.getElementById('frUploadArea');
    frBackupFileInput = document.getElementById('frBackupFile');
    
    frHeader = document.getElementById('frHeader');
    frFileName = document.getElementById('frFileName');
    downloadCurrentFrBackupBtn = document.getElementById('downloadCurrentFrBackupBtn');
    frCloseToolBtn = document.getElementById('frCloseToolBtn');

    frMainContent = document.getElementById('frMainContent');
    frSingleResultPreview = document.getElementById('frSingleResultPreview');
    frHelperText = document.getElementById('frHelperText');
    
    frHud = document.getElementById('frHud');
    findPatternInput = document.getElementById('findPattern');
    replaceTextInput = document.getElementById('replaceText');
    matchCountDisplay = document.getElementById('frMatchCountDisplay');
    findPreviousBtn = document.getElementById('findPreviousBtn');
    findNextBtn = document.getElementById('findNextBtn');
    replaceNextBtn = document.getElementById('replaceNextBtn');
    replaceAllBtn = document.getElementById('replaceAllBtn');
    useRegexCheckbox = document.getElementById('useRegexBackup');
    caseSensitiveCheckbox = document.getElementById('frCaseSensitiveCheckbox');
    wholeWordCheckbox = document.getElementById('frWholeWordCheckbox');
    frSpinner = document.getElementById('spinnerFindReplaceBackup');
    
    frReviewModal = document.getElementById('frReviewModal');
    frCloseReviewModalBtn = document.getElementById('frCloseReviewModalBtn');
    frReviewSelectAll = document.getElementById('frReviewSelectAll');
    frReviewSummaryText = document.getElementById('frReviewSummaryText');
    frReviewList = document.getElementById('frReviewList');
    frCancelReviewBtn = document.getElementById('frCancelReviewBtn');
    frConfirmReplaceAllBtn = document.getElementById('frConfirmReplaceAllBtn');

    // Moved into initializer for closure
    async function handleFileLoad(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        resetToolState();
        toggleAppSpinnerFunc(true);
        loadedFileName = file.name;

        try {
            const fileText = await file.text();
            frData = JSON.parse(fileText);

            if (!frData.revisions?.[0]?.scenes) {
                throw new Error('Invalid backup file structure.');
            }
            
            frFileName.textContent = loadedFileName;
            
            frUploadArea.classList.add('opacity-0', 'pointer-events-none');
            frHeader.classList.remove('hidden');
            frMainContent.classList.remove('hidden');
            frHud.classList.remove('hidden');

            findPatternInput.focus();

        } catch (err) {
            showAppToast(`Error loading file: ${err.message}`, true);
            frBackupFileInput.value = ''; // Clear input
            resetToolState();
        } finally {
            toggleAppSpinnerFunc(false);
        }
    }

    // Bind all event listeners
    frBackupFileInput.addEventListener('change', handleFileLoad);
    frCloseToolBtn.addEventListener('click', closeFindReplace);
    downloadCurrentFrBackupBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(frData, null, 2)], { type: 'application/json' });
        triggerDownload(blob, loadedFileName, 'application/json', showAppToast);
    });

    findPatternInput.addEventListener('input', debounce(performSearch, 300));
    findNextBtn.addEventListener('click', () => navigateMatches(1));
    findPreviousBtn.addEventListener('click', () => navigateMatches(-1));
    
    replaceNextBtn.addEventListener('click', replaceNext);
    replaceAllBtn.addEventListener('click', reviewReplaceAll);
    frConfirmReplaceAllBtn.addEventListener('click', confirmReplaceAll);
    
    // Options listeners
    [useRegexCheckbox, caseSensitiveCheckbox, wholeWordCheckbox].forEach(el => {
        el.addEventListener('change', () => performSearch());
    });
    
    // Review Modal listeners
    frCloseReviewModalBtn.addEventListener('click', closeReviewModal);
    frCancelReviewBtn.addEventListener('click', closeReviewModal);
    frReviewSelectAll.addEventListener('change', () => {
        frReviewList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = frReviewSelectAll.checked;
        });
    });
}

// --- CORE LOGIC ---

function resetToolState() {
    frData = null;
    loadedFileName = '';
    allMatches = [];
    currentMatchIndex = -1;
    modificationsMade = false;
    
    frUploadArea.classList.remove('opacity-0', 'pointer-events-none');
    frHeader.classList.add('hidden');
    frMainContent.classList.add('hidden');
    frHud.classList.add('hidden');
    
    findPatternInput.value = '';
    replaceTextInput.value = '';
    matchCountDisplay.textContent = 'No results';
    frSingleResultPreview.innerHTML = '';
    frSingleResultPreview.classList.add('hidden');
    frHelperText.classList.remove('hidden');
    
    // Reset buttons
    findPreviousBtn.disabled = true;
    findNextBtn.disabled = true;
    replaceNextBtn.disabled = true;
    replaceAllBtn.disabled = true;
    downloadCurrentFrBackupBtn.disabled = true;
}

function closeFindReplace() {
    resetToolState();
    frBackupFileInput.value = '';
    // This will trigger the main app router to show the dashboard
    window.location.hash = '#dashboard'; 
}


// --- SEARCH LOGIC ---

function getSearchOptions() {
    return {
        useRegex: useRegexCheckbox.checked,
        caseSensitive: caseSensitiveCheckbox.checked,
        wholeWord: wholeWordCheckbox.checked,
    };
}

function performSearch() {
    const pattern = findPatternInput.value;
    const options = getSearchOptions();
    
    allMatches = [];
    currentMatchIndex = -1;
    frSingleResultPreview.innerHTML = '';

    if (!pattern || !frData) {
        updateMatchDisplay();
        frSingleResultPreview.classList.add('hidden');
        frHelperText.classList.remove('hidden');
        frHelperText.textContent = 'Enter a search term to begin.';
        return;
    }

    let regex;
    try {
        const flags = options.caseSensitive ? 'g' : 'gi';
        let finalPattern = options.useRegex ? pattern : pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        if (options.wholeWord) {
            finalPattern = `\\b${finalPattern}\\b`;
        }
        regex = new RegExp(finalPattern, flags);
    } catch (e) {
        matchCountDisplay.textContent = 'Invalid Regex';
        return;
    }

    const scenes = frData.revisions[0].scenes;
    scenes.forEach(scene => {
        const plainText = getScenePlainText(scene);
        let match;
        while ((match = regex.exec(plainText)) !== null) {
            allMatches.push({
                sceneCode: scene.code,
                sceneTitle: scene.title,
                index: match.index,
                length: match[0].length,
                text: match[0]
            });
        }
    });
    
    updateMatchDisplay();

    if (allMatches.length > 0) {
        navigateMatches(0);
    } else {
        frSingleResultPreview.classList.add('hidden');
        frHelperText.classList.remove('hidden');
        frHelperText.textContent = 'No results found.';
    }
}

function updateMatchDisplay() {
    const count = allMatches.length;
    if (count === 0) {
        matchCountDisplay.textContent = findPatternInput.value ? 'No results' : '';
    } else {
        const current = currentMatchIndex + 1;
        matchCountDisplay.textContent = `${current} of ${count}`;
    }
    
    findNextBtn.disabled = count === 0 || currentMatchIndex >= count - 1;
    findPreviousBtn.disabled = count === 0 || currentMatchIndex <= 0;
    replaceAllBtn.disabled = count === 0;
    replaceNextBtn.disabled = count === 0;
}

function navigateMatches(direction) {
    if (allMatches.length === 0) return;
    const newIndex = (direction === 0) ? 0 : currentMatchIndex + direction; // direction 0 is for first match
    if (newIndex < 0 || newIndex >= allMatches.length) return;
    
    currentMatchIndex = newIndex;
    displayCurrentMatch();
    updateMatchDisplay();
}

function displayCurrentMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= allMatches.length) return;

    frSingleResultPreview.classList.remove('hidden');
    frHelperText.classList.add('hidden');

    const match = allMatches[currentMatchIndex];
    const scene = frData.revisions[0].scenes.find(s => s.code === match.sceneCode);
    const plainText = getScenePlainText(scene);

    const contextStart = Math.max(0, match.index - CONTEXT_LENGTH);
    const contextEnd = Math.min(plainText.length, match.index + match.length + CONTEXT_LENGTH);
    const preContext = escapeHtml(plainText.substring(contextStart, match.index));
    const matchText = `<mark class="bg-primary-500/30 px-1 rounded">${escapeHtml(match.text)}</mark>`;
    const postContext = escapeHtml(plainText.substring(match.index + match.length, contextEnd));
    const contextSnippet = (contextStart > 0 ? '...' : '') + preContext + matchText + postContext + (contextEnd < plainText.length ? '...' : '');

    frSingleResultPreview.innerHTML = `
        <div class="font-semibold text-slate-800 dark:text-slate-200 truncate mb-2">${escapeHtml(match.sceneTitle)}</div>
        <div class="text-slate-600 dark:text-slate-400 leading-relaxed break-words">${contextSnippet}</div>
    `;
}


// --- REPLACE LOGIC ---

function replaceNext() {
    if (currentMatchIndex < 0 || currentMatchIndex >= allMatches.length) return;
    
    const match = allMatches[currentMatchIndex];
    const replacementText = replaceTextInput.value;
    
    replaceInScene(match.sceneCode, match.index, match.length, replacementText);

    // After replacement, the indices of subsequent matches are shifted.
    // The simplest, most reliable way to handle this is to perform the search again.
    performSearch();
    
    // We can try to be smart and find the "next" logical match, but it's tricky.
    // For now, let's just go to the first match in the new results.
    if (allMatches.length > 0) {
        navigateMatches(0);
    }
}


function reviewReplaceAll() {
    if (allMatches.length === 0) return;
    
    frReviewSummaryText.textContent = `${allMatches.length} replacements proposed`;
    frReviewList.innerHTML = '';
    frReviewSelectAll.checked = true;

    const scenes = frData.revisions[0].scenes;

    allMatches.forEach((match, index) => {
        const scene = scenes.find(s => s.code === match.sceneCode);
        if (!scene) return;
        const plainText = getScenePlainText(scene);

        const li = document.createElement('li');
        li.className = 'p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0 text-sm';
        
        const contextStart = Math.max(0, match.index - 30);
        const contextEnd = Math.min(plainText.length, match.index + match.length + 30);
        const preContext = escapeHtml(plainText.substring(contextStart, match.index));
        const matchText = `<span class="bg-red-500/20 px-1 rounded"><del>${escapeHtml(match.text)}</del></span>`;
        const postContext = escapeHtml(plainText.substring(match.index + match.length, contextEnd));

        li.innerHTML = `
            <div class="flex items-start gap-3">
                <input type="checkbox" id="review-item-${index}" data-match-index="${index}" class="mt-1 w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600" checked>
                <label for="review-item-${index}" class="flex-1 cursor-pointer">
                    <div class="font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(scene.title)}</div>
                    <div class="text-slate-600 dark:text-slate-400 mt-1">
                        ...${preContext}${matchText}${postContext}...
                    </div>
                </label>
            </div>
        `;
        frReviewList.appendChild(li);
    });

    frReviewModal.classList.remove('hidden');
}

function confirmReplaceAll() {
    const checkedItems = frReviewList.querySelectorAll('input[type="checkbox"]:checked');
    const replacementText = replaceTextInput.value;
    
    // Get matches to replace and sort them by scene and then in reverse index order
    // to avoid shifting indices within the same scene during replacement.
    const matchesToReplace = Array.from(checkedItems)
        .map(cb => allMatches[parseInt(cb.dataset.matchIndex)])
        .sort((a, b) => {
            if (a.sceneCode < b.sceneCode) return -1;
            if (a.sceneCode > b.sceneCode) return 1;
            return b.index - a.index; // Reverse order for indices
        });

    let currentSceneCode = null;
    let sceneText = '';
    const scenes = frData.revisions[0].scenes;

    matchesToReplace.forEach(match => {
        if (match.sceneCode !== currentSceneCode) {
            // If we have processed a scene, save it before moving to the next.
            if (currentSceneCode) {
                const sceneToUpdate = scenes.find(s => s.code === currentSceneCode);
                if (sceneToUpdate) {
                    const newBlocks = sceneText.split('\n').map(line => ({ type: 'text', align: 'left', text: line }));
                    sceneToUpdate.text = JSON.stringify({ blocks: newBlocks });
                }
            }
            // Load new scene
            currentSceneCode = match.sceneCode;
            const scene = scenes.find(s => s.code === currentSceneCode);
            sceneText = scene ? getScenePlainText(scene) : '';
        }

        // Perform replacement on the current scene's text
        sceneText = sceneText.substring(0, match.index) + replacementText + sceneText.substring(match.index + match.length);
    });
    
    // Save the last processed scene
    if (currentSceneCode) {
        const sceneToUpdate = scenes.find(s => s.code === currentSceneCode);
        if (sceneToUpdate) {
            const newBlocks = sceneText.split('\n').map(line => ({ type: 'text', align: 'left', text: line }));
            sceneToUpdate.text = JSON.stringify({ blocks: newBlocks });
        }
    }
    
    modificationsMade = true;
    downloadCurrentFrBackupBtn.disabled = false;

    closeReviewModal();
    performSearch(); // Refresh the view with new results
}


function replaceInScene(sceneCode, index, length, replacement) {
    const scene = frData.revisions[0].scenes.find(s => s.code === sceneCode);
    if (!scene) return;

    try {
        let plainText = getScenePlainText(scene);
        plainText = plainText.substring(0, index) + replacement + plainText.substring(index + length);
        
        // This is a simplification. A more robust solution would map the plainText
        // indices back to the block structure. For now, we replace the whole content.
        const newBlocks = plainText.split('\n').map(line => ({ type: 'text', align: 'left', text: line }));
        
        scene.text = JSON.stringify({ blocks: newBlocks });
        
        modificationsMade = true;
        downloadCurrentFrBackupBtn.disabled = false;
    } catch (e) {
        console.error(`Failed to replace content in scene ${sceneCode}`, e);
    }
}


// --- UI & VIEW LOGIC ---

function getScenePlainText(scene) {
    try {
        const content = JSON.parse(scene.text);
        // Join with \n to preserve paragraph breaks for regex.
        return content.blocks.map(b => (b.text || '')).join('\n');
    } catch {
        return '';
    }
}

function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function closeReviewModal() {
    frReviewModal.classList.add('hidden');
}