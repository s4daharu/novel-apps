/**
 * Browser-compatible Find & Replace Backup functionality (HUD Overhaul)
 */
import { triggerDownload } from './browser-helpers.js';

// --- STATE ---
let frData = null; // The loaded backup file content (as a JS object)
let allMatches = []; // Array of all found matches across the selected scope
let currentMatchIndex = -1; // Index of the currently highlighted match in `allMatches`
let modificationsMade = false; // Flag to enable the download button

// --- DOM ELEMENTS (DECLARED AT MODULE LEVEL FOR WIDER ACCESS) ---
let frContainer, frUploadArea, frDownloadContainer, frSnippetPreview, frBackupFileInput,
    frHud, findPatternInput, replaceTextInput, frReplaceToggleBtn, frReplaceRow,
    matchCountDisplay, findPreviousBtn, findNextBtn, frDoneBtn, replaceNextBtn,
    replaceAllBtn, frOptionsToggleBtn, frOptionsPopover, frScopeSelect,
    useRegexCheckbox, caseSensitiveCheckbox, wholeWordCheckbox,
    downloadCurrentFrBackupBtn, frSpinner, frReviewModal, frCloseReviewModalBtn,
    frReviewSelectAll, frReviewSummaryText, frReviewList, frCancelReviewBtn,
    frConfirmReplaceAllBtn, frChapterListPanel, frChapterList;

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
    frDownloadContainer = document.getElementById('frDownloadContainer');
    frSnippetPreview = document.getElementById('frSnippetPreview');
    frBackupFileInput = document.getElementById('frBackupFile');
    frHud = document.getElementById('frHud');
    findPatternInput = document.getElementById('findPattern');
    replaceTextInput = document.getElementById('replaceText');
    frReplaceToggleBtn = document.getElementById('frReplaceToggleBtn');
    frReplaceRow = document.getElementById('frReplaceRow');
    matchCountDisplay = document.getElementById('frMatchCountDisplay');
    findPreviousBtn = document.getElementById('findPreviousBtn');
    findNextBtn = document.getElementById('findNextBtn');
    frDoneBtn = document.getElementById('frDoneBtn');
    replaceNextBtn = document.getElementById('replaceNextBtn');
    replaceAllBtn = document.getElementById('replaceAllBtn');
    frOptionsToggleBtn = document.getElementById('frOptionsToggleBtn');
    frOptionsPopover = document.getElementById('frOptionsPopover');
    frScopeSelect = document.getElementById('frScopeSelect');
    useRegexCheckbox = document.getElementById('useRegexBackup');
    caseSensitiveCheckbox = document.getElementById('frCaseSensitiveCheckbox');
    wholeWordCheckbox = document.getElementById('frWholeWordCheckbox');
    downloadCurrentFrBackupBtn = document.getElementById('downloadCurrentFrBackupBtn');
    frSpinner = document.getElementById('spinnerFindReplaceBackup');
    frReviewModal = document.getElementById('frReviewModal');
    frCloseReviewModalBtn = document.getElementById('frCloseReviewModalBtn');
    frReviewSelectAll = document.getElementById('frReviewSelectAll');
    frReviewSummaryText = document.getElementById('frReviewSummaryText');
    frReviewList = document.getElementById('frReviewList');
    frCancelReviewBtn = document.getElementById('frCancelReviewBtn');
    frConfirmReplaceAllBtn = document.getElementById('frConfirmReplaceAllBtn');
    frChapterListPanel = document.getElementById('frChapterListPanel');
    frChapterList = document.getElementById('frChapterList');

    // Moved into initializer for closure
    async function handleFileLoad(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        resetToolState();
        toggleAppSpinnerFunc(true);

        try {
            const fileText = await file.text();
            frData = JSON.parse(fileText);

            if (!frData.revisions?.[0]?.scenes) {
                throw new Error('Invalid backup file structure.');
            }

            populateScopeSelector();
            populateChapterList();
            
            frUploadArea.classList.add('opacity-0', 'pointer-events-none');
            frHud.classList.remove('hidden');
            frDownloadContainer.classList.remove('hidden');

            frReplaceToggleBtn.disabled = false;
            frOptionsToggleBtn.disabled = false;
            findPatternInput.focus();

            // Display first chapter's content
            if (frData.revisions[0].scenes.length > 0) {
                displayChapterContent(frData.revisions[0].scenes[0].code);
            }

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
    frDoneBtn.addEventListener('click', closeFindReplace);

    findPatternInput.addEventListener('input', debounce(performSearch, 300));
    findNextBtn.addEventListener('click', () => navigateMatches(1));
    findPreviousBtn.addEventListener('click', () => navigateMatches(-1));
    
    frReplaceToggleBtn.addEventListener('click', toggleReplaceUI);
    replaceNextBtn.addEventListener('click', replaceNext);
    replaceAllBtn.addEventListener('click', reviewReplaceAll);
    frConfirmReplaceAllBtn.addEventListener('click', confirmReplaceAll);
    
    // Options listeners
    frOptionsToggleBtn.addEventListener('click', toggleOptionsPopover);
    document.addEventListener('click', (e) => {
        if (frOptionsPopover && !frOptionsPopover.classList.contains('hidden') && 
            !frOptionsPopover.contains(e.target) && !frOptionsToggleBtn.contains(e.target)) {
            frOptionsPopover.classList.add('hidden');
        }
    });

    [frScopeSelect, useRegexCheckbox, caseSensitiveCheckbox, wholeWordCheckbox].forEach(el => {
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

    frChapterList.addEventListener('click', (e) => {
        const targetButton = e.target.closest('button[data-scene-code]');
        if (targetButton) {
            displayChapterContent(targetButton.dataset.sceneCode);
        }
    });
}

// --- CORE LOGIC ---

function resetToolState() {
    frData = null;
    allMatches = [];
    currentMatchIndex = -1;
    modificationsMade = false;
    
    frUploadArea.classList.remove('opacity-0', 'pointer-events-none');
    frHud.classList.add('hidden');
    frDownloadContainer.classList.add('hidden');
    
    findPatternInput.value = '';
    replaceTextInput.value = '';
    matchCountDisplay.textContent = 'No results';
    frSnippetPreview.innerHTML = '<p class="text-slate-500 dark:text-slate-400 italic">Upload a backup file to begin.</p>';
    frChapterList.innerHTML = '<li class="p-2 text-sm text-slate-500 italic">Upload a backup file to see chapters.</li>';

    // Reset buttons
    findPreviousBtn.disabled = true;
    findNextBtn.disabled = true;
    replaceNextBtn.disabled = true;
    replaceAllBtn.disabled = true;
    downloadCurrentFrBackupBtn.disabled = true;
    frReplaceToggleBtn.disabled = true;
    frOptionsToggleBtn.disabled = true;
}

function closeFindReplace() {
    resetToolState();
    frBackupFileInput.value = '';
}


// --- SEARCH LOGIC ---

function getSearchOptions() {
    return {
        scope: frScopeSelect.value,
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

    if (!pattern || !frData) {
        updateMatchDisplay();
        // Re-display current chapter without highlights
        const activeChapterBtn = frChapterList.querySelector('button.bg-primary-500\/10');
        if (activeChapterBtn) {
            displayChapterContent(activeChapterBtn.dataset.sceneCode);
        }
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
    const scopeScene = scenes.find(s => s.code === options.scope);

    const scenesToSearch = options.scope === 'all' ? scenes : (scopeScene ? [scopeScene] : []);

    scenesToSearch.forEach(scene => {
        try {
            const content = JSON.parse(scene.text);
            const plainText = content.blocks.map(b => b.text || '').join('\n');
            
            let match;
            while ((match = regex.exec(plainText)) !== null) {
                allMatches.push({
                    sceneCode: scene.code,
                    index: match.index,
                    length: match[0].length,
                    text: match[0]
                });
            }
        } catch (e) {
            console.warn(`Could not parse scene content for ${scene.code}`, e);
        }
    });
    
    updateMatchDisplay();
    if (allMatches.length > 0) {
        navigateMatches(0); // Go to the first match
    } else {
        frSnippetPreview.innerHTML = '<p class="text-slate-500 dark:text-slate-400">No results found.</p>';
    }
}

function updateMatchDisplay() {
    const count = allMatches.length;
    if (count === 0) {
        matchCountDisplay.textContent = 'No results';
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

    if (currentMatchIndex === -1 && direction === 0) {
        currentMatchIndex = 0;
    } else {
        currentMatchIndex += direction;
    }

    if (currentMatchIndex < 0) currentMatchIndex = 0;
    if (currentMatchIndex >= allMatches.length) currentMatchIndex = allMatches.length - 1;

    displayCurrentMatch();
    updateMatchDisplay();
}

function displayCurrentMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= allMatches.length) {
        if(frData) {
            const firstScene = frData.revisions[0].scenes[0];
            if(firstScene) displayChapterContent(firstScene.code);
        }
        return;
    };
    const match = allMatches[currentMatchIndex];
    displayChapterContent(match.sceneCode, match);
}


// --- REPLACE LOGIC ---

function toggleReplaceUI() {
    const isExpanded = frReplaceToggleBtn.getAttribute('aria-expanded') === 'true';
    frReplaceToggleBtn.setAttribute('aria-expanded', !isExpanded);
    frReplaceRow.classList.toggle('hidden');
    frReplaceToggleBtn.querySelector('svg').classList.toggle('rotate-90');
}

function replaceNext() {
    if (currentMatchIndex < 0 || currentMatchIndex >= allMatches.length) return;
    
    const match = allMatches[currentMatchIndex];
    const replacementText = replaceTextInput.value;
    
    replaceInScene(match.sceneCode, match.index, match.length, replacementText);

    // After replacement, the text has changed, so we must re-run the search.
    // We want to land on the match right after the one we just replaced.
    const searchFromIndex = match.index + replacementText.length;
    
    performSearch(); // Re-calculates allMatches
    
    // Find the new index of the next match
    const newIndex = allMatches.findIndex(m => m.sceneCode === match.sceneCode && m.index >= searchFromIndex);
    
    if (newIndex !== -1) {
        currentMatchIndex = newIndex - 1; // prepare for navigateMatches(1)
        navigateMatches(1);
    } else {
        // No more matches in this scene, find next match in any scene
        const nextSceneMatchIndex = allMatches.findIndex(m => m.sceneCode > match.sceneCode);
        if (nextSceneMatchIndex !== -1) {
            currentMatchIndex = nextSceneMatchIndex - 1;
            navigateMatches(1);
        } else {
            // No more matches at all
            displayCurrentMatch(); // Refresh view
            updateMatchDisplay();
        }
    }
}

function reviewReplaceAll() {
    if (allMatches.length === 0) return;
    
    frReviewSummaryText.textContent = `${allMatches.length} replacements proposed`;
    frReviewList.innerHTML = ''; // Clear previous
    frReviewSelectAll.checked = true;

    const scenes = frData.revisions[0].scenes;

    allMatches.forEach((match, index) => {
        const scene = scenes.find(s => s.code === match.sceneCode);
        const li = document.createElement('li');
        li.className = 'p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0 text-sm';
        
        const contextStart = Math.max(0, match.index - 30);
        const contextEnd = Math.min(getScenePlainText(scene).length, match.index + match.length + 30);
        const context = getScenePlainText(scene).substring(contextStart, contextEnd);

        li.innerHTML = `
            <div class="flex items-start gap-3">
                <input type="checkbox" id="review-item-${index}" data-match-index="${index}" class="mt-1 w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600" checked>
                <label for="review-item-${index}" class="flex-1">
                    <div class="font-semibold text-slate-800 dark:text-slate-200">${escapeHtml(scene.title)}</div>
                    <div class="text-slate-600 dark:text-slate-400 mt-1">
                        ...${escapeHtml(context).replace(escapeHtml(match.text), `<span class="bg-red-500/20 px-1 rounded"><del>${escapeHtml(match.text)}</del></span>`)}...
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
    
    // Process replacements from last to first to avoid index shifting issues
    const matchesToReplace = Array.from(checkedItems)
        .map(cb => allMatches[parseInt(cb.dataset.matchIndex)])
        .sort((a, b) => {
            if (a.sceneCode !== b.sceneCode) return b.sceneCode.localeCompare(a.sceneCode);
            return b.index - a.index;
        });

    matchesToReplace.forEach(match => {
        replaceInScene(match.sceneCode, match.index, match.length, replacementText);
    });

    closeReviewModal();
    performSearch(); // Refresh search results
}

function replaceInScene(sceneCode, index, length, replacement) {
    const scene = frData.revisions[0].scenes.find(s => s.code === sceneCode);
    if (!scene) return;

    try {
        const content = JSON.parse(scene.text);
        const plainText = content.blocks.map(b => b.text || '').join('\n');
        
        const newPlainText = plainText.substring(0, index) + replacement + plainText.substring(index + length);

        // This is a simplification. A more robust solution would map the plainText
        // indices back to the block structure. For now, we replace the whole content.
        const newBlocks = newPlainText.split('\n').map(line => ({ type: 'text', align: 'left', text: line }));
        
        scene.text = JSON.stringify({ blocks: newBlocks });
        
        modificationsMade = true;
        downloadCurrentFrBackupBtn.disabled = false;
    } catch (e) {
        console.error(`Failed to replace content in scene ${sceneCode}`, e);
    }
}

// --- UI AND DISPLAY ---

function displayChapterContent(sceneCode, matchToHighlight = null) {
    const scene = frData.revisions[0].scenes.find(s => s.code === sceneCode);
    if (!scene) return;

    // Update active chapter in the list
    frChapterList.querySelectorAll('button').forEach(btn => {
        if (btn.dataset.sceneCode === sceneCode) {
            btn.classList.add('bg-primary-500/10', 'text-primary-600', 'dark:text-primary-300');
        } else {
            btn.classList.remove('bg-primary-500/10', 'text-primary-600', 'dark:text-primary-300');
        }
    });

    const plainText = getScenePlainText(scene);
    let contentHtml;
    
    if (matchToHighlight) {
        const { index, length } = matchToHighlight;
        const pre = escapeHtml(plainText.substring(0, index));
        const matchText = escapeHtml(plainText.substring(index, index + length));
        const post = escapeHtml(plainText.substring(index + length));
        contentHtml = `${pre}<mark id="current-match" class="bg-primary-500/30 rounded px-1">${matchText}</mark>${post}`;
    } else {
        contentHtml = escapeHtml(plainText);
    }
    
    frSnippetPreview.innerHTML = `<pre class="whitespace-pre-wrap break-words">${contentHtml}</pre>`;

    if (matchToHighlight) {
        const mark = document.getElementById('current-match');
        if (mark) {
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function populateChapterList() {
    if (!frData || !frChapterList) return;
    const scenes = frData.revisions[0].scenes;
    frChapterList.innerHTML = '';
    scenes.forEach(scene => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.dataset.sceneCode = scene.code;
        button.textContent = scene.title;
        button.className = 'w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700/50';
        li.appendChild(button);
        frChapterList.appendChild(li);
    });
}

// --- UTILITY ---
function debounce(func, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function populateScopeSelector() {
    frScopeSelect.innerHTML = '<option value="all">All Chapters</option>';
    frData.revisions[0].scenes.forEach(scene => {
        const option = document.createElement('option');
        option.value = scene.code;
        option.textContent = scene.title;
        frScopeSelect.appendChild(option);
    });
}

function getScenePlainText(scene) {
    if (!scene || !scene.text) return '';
    try {
        const content = JSON.parse(scene.text);
        return content.blocks.map(b => b.text || '').join('\n');
    } catch {
        return '';
    }
}

function toggleOptionsPopover() {
    frOptionsPopover.classList.toggle('hidden');
}

function closeReviewModal() {
    frReviewModal.classList.add('hidden');
}