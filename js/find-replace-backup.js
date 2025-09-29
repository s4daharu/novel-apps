/**
 * Browser-compatible Find & Replace Backup functionality (HUD Overhaul)
 */
import { triggerDownload } from './browser-helpers.js';

// --- STATE ---
let frData = null; // The loaded backup file content (as a JS object)
let loadedFileName = ''; // Name of the loaded file
let allMatches = []; // Array of all found matches across the selected scope
let currentMatchIndex = -1; // Index of the currently highlighted match in `allMatches`
let currentlyDisplayedSceneCode = null; // To avoid re-rendering the same content
let modificationsMade = false; // Flag to enable the download button

// --- DOM ELEMENTS (DECLARED AT MODULE LEVEL FOR WIDER ACCESS) ---
let frContainer, frUploadArea, frBackupFileInput,
    frHeader, frFileName, downloadCurrentFrBackupBtn, frCloseToolBtn,
    frMainContent, frChapterList, frContentPreviewContainer, frContentPreview,
    frHud, findPatternInput, replaceTextInput, frReplaceToggleBtn, frReplaceRow,
    matchCountDisplay, findPreviousBtn, findNextBtn,
    replaceNextBtn, replaceAllBtn, frOptionsToggleBtn, frOptionsPopover, frScopeSelect,
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
    frChapterList = document.getElementById('frChapterList');
    frContentPreviewContainer = document.getElementById('frContentPreviewContainer');
    frContentPreview = document.getElementById('frContentPreview');
    
    frHud = document.getElementById('frHud');
    findPatternInput = document.getElementById('findPattern');
    replaceTextInput = document.getElementById('replaceText');
    frReplaceToggleBtn = document.getElementById('frReplaceToggleBtn');
    frReplaceRow = document.getElementById('frReplaceRow');
    matchCountDisplay = document.getElementById('frMatchCountDisplay');
    findPreviousBtn = document.getElementById('findPreviousBtn');
    findNextBtn = document.getElementById('findNextBtn');
    replaceNextBtn = document.getElementById('replaceNextBtn');
    replaceAllBtn = document.getElementById('replaceAllBtn');
    frOptionsToggleBtn = document.getElementById('frOptionsToggleBtn');
    frOptionsPopover = document.getElementById('frOptionsPopover');
    frScopeSelect = document.getElementById('frScopeSelect');
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
            populateScopeSelector();
            populateChapterList();
            
            frUploadArea.classList.add('opacity-0', 'pointer-events-none');
            frHeader.classList.remove('hidden');
            frMainContent.classList.remove('hidden');
            frHud.classList.remove('hidden');

            frReplaceToggleBtn.disabled = false;
            frOptionsToggleBtn.disabled = false;
            findPatternInput.focus();

            // Load first chapter content by default
            const firstSceneCode = frData.revisions[0].scenes[0]?.code;
            if (firstSceneCode) {
                loadSceneContent(firstSceneCode);
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
    frCloseToolBtn.addEventListener('click', closeFindReplace);
    downloadCurrentFrBackupBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(frData, null, 2)], { type: 'application/json' });
        triggerDownload(blob, loadedFileName, 'application/json', showAppToast);
    });

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
}

// --- CORE LOGIC ---

function resetToolState() {
    frData = null;
    loadedFileName = '';
    allMatches = [];
    currentMatchIndex = -1;
    currentlyDisplayedSceneCode = null;
    modificationsMade = false;
    
    frUploadArea.classList.remove('opacity-0', 'pointer-events-none');
    frHeader.classList.add('hidden');
    frMainContent.classList.add('hidden');
    frHud.classList.add('hidden');
    
    findPatternInput.value = '';
    replaceTextInput.value = '';
    matchCountDisplay.textContent = 'No results';
    frContentPreview.innerHTML = '<p class="text-slate-500 dark:text-slate-400 italic">Select a chapter to view its content.</p>';
    frChapterList.innerHTML = '';
    
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
    // This will trigger the main app router to show the dashboard
    window.location.hash = '#dashboard'; 
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
        populateChapterList(); // Update counts (to zero)
        if(currentlyDisplayedSceneCode) loadSceneContent(currentlyDisplayedSceneCode); // Re-render content without highlights
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
        const plainText = getScenePlainText(scene);
        let match;
        while ((match = regex.exec(plainText)) !== null) {
            allMatches.push({
                sceneCode: scene.code,
                index: match.index,
                length: match[0].length,
                text: match[0]
            });
        }
    });
    
    populateChapterList();
    updateMatchDisplay();

    if (allMatches.length > 0) {
        navigateMatches(0); // Go to the first match
    } else {
        if(currentlyDisplayedSceneCode) loadSceneContent(currentlyDisplayedSceneCode); // Re-render content without highlights
        else frContentPreview.innerHTML = '<p class="text-slate-500 dark:text-slate-400">No results found.</p>';
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
    const newIndex = currentMatchIndex + direction;
    if (newIndex < 0 || newIndex >= allMatches.length) return;
    
    currentMatchIndex = newIndex;
    displayCurrentMatch();
    updateMatchDisplay();
}

function displayCurrentMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= allMatches.length) return;

    const match = allMatches[currentMatchIndex];
    if (match.sceneCode !== currentlyDisplayedSceneCode) {
        loadSceneContent(match.sceneCode, currentMatchIndex);
    } else {
        // Just update highlights and scroll
        frContentPreview.querySelectorAll('mark').forEach(m => m.classList.remove('bg-yellow-400', 'dark:bg-yellow-600'));
        const currentMark = frContentPreview.querySelector(`mark[data-match-index="${currentMatchIndex}"]`);
        if (currentMark) {
            currentMark.classList.add('bg-yellow-400', 'dark:bg-yellow-600');
            currentMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Update active chapter in list
    frChapterList.querySelectorAll('li').forEach(li => {
        li.classList.toggle('bg-primary-100', li.dataset.sceneCode === match.sceneCode);
        li.classList.toggle('dark:bg-primary-900/50', li.dataset.sceneCode === match.sceneCode);
    });
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

    const searchFromIndex = match.index + replacementText.length;
    performSearch(); // Re-calculates allMatches
    
    const newIndex = allMatches.findIndex(m => m.sceneCode === match.sceneCode && m.index >= searchFromIndex);
    
    if (newIndex !== -1) {
        currentMatchIndex = newIndex;
        displayCurrentMatch();
        updateMatchDisplay();
    } else {
        const nextSceneMatchIndex = allMatches.findIndex(m => m.sceneCode > match.sceneCode);
        if (nextSceneMatchIndex !== -1) {
            currentMatchIndex = nextSceneMatchIndex;
            displayCurrentMatch();
            updateMatchDisplay();
        } else {
            // No more matches, just update display
            updateMatchDisplay();
        }
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
    performSearch();
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

function populateScopeSelector() {
    frScopeSelect.innerHTML = '<option value="all">All Chapters</option>';
    frData.revisions[0].scenes.forEach(scene => {
        const option = document.createElement('option');
        option.value = scene.code;
        option.textContent = scene.title;
        frScopeSelect.appendChild(option);
    });
}

function populateChapterList() {
    frChapterList.innerHTML = '';
    const scenes = frData.revisions[0].scenes;
    scenes.forEach(scene => {
        const matchesInScene = allMatches.filter(m => m.sceneCode === scene.code);
        const li = document.createElement('li');
        li.dataset.sceneCode = scene.code;
        li.className = 'p-2 cursor-pointer rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/50 flex justify-between items-center';
        li.innerHTML = `
            <span class="truncate pr-2">${escapeHtml(scene.title)}</span>
            ${matchesInScene.length > 0 ? `<span class="flex-shrink-0 bg-primary-500/20 text-primary-700 dark:text-primary-300 text-xs font-medium px-2 py-0.5 rounded-full">${matchesInScene.length}</span>` : ''}
        `;
        li.addEventListener('click', () => {
            const firstMatchInSceneIndex = allMatches.findIndex(m => m.sceneCode === scene.code);
            if (firstMatchInSceneIndex !== -1) {
                currentMatchIndex = firstMatchInSceneIndex;
                displayCurrentMatch();
                updateMatchDisplay();
            } else {
                loadSceneContent(scene.code);
            }
        });
        frChapterList.appendChild(li);
    });
}

function loadSceneContent(sceneCode, highlightMatchIndex = -1) {
    currentlyDisplayedSceneCode = sceneCode;
    const scene = frData.revisions[0].scenes.find(s => s.code === sceneCode);
    if (!scene) {
        frContentPreview.innerHTML = '<p class="text-red-500">Error: Chapter not found.</p>';
        return;
    }
    
    let plainText = getScenePlainText(scene);
    let htmlContent = '';
    let lastIndex = 0;

    const matchesInScene = allMatches
        .map((match, index) => ({ ...match, originalIndex: index }))
        .filter(m => m.sceneCode === sceneCode)
        .sort((a,b) => a.index - b.index);

    if (matchesInScene.length > 0) {
        matchesInScene.forEach(match => {
            htmlContent += escapeHtml(plainText.substring(lastIndex, match.index));
            const isCurrent = match.originalIndex === highlightMatchIndex;
            htmlContent += `<mark class="${isCurrent ? 'bg-yellow-400 dark:bg-yellow-600' : 'bg-primary-500/30'} rounded px-1" data-match-index="${match.originalIndex}">${escapeHtml(match.text)}</mark>`;
            lastIndex = match.index + match.length;
        });
    }

    htmlContent += escapeHtml(plainText.substring(lastIndex));
    frContentPreview.innerHTML = htmlContent.replace(/\n/g, '<br>');

    // Update active chapter in list
    frChapterList.querySelectorAll('li').forEach(li => {
        li.classList.toggle('bg-primary-100', li.dataset.sceneCode === sceneCode);
        li.classList.toggle('dark:bg-primary-900/50', li.dataset.sceneCode === sceneCode);
    });

    if (highlightMatchIndex !== -1) {
        const mark = frContentPreview.querySelector(`mark[data-match-index="${highlightMatchIndex}"]`);
        if (mark) {
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        frContentPreviewContainer.scrollTop = 0;
    }
}


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

function toggleOptionsPopover() {
    frOptionsPopover.classList.toggle('hidden');
}

function closeReviewModal() {
    frReviewModal.classList.add('hidden');
}