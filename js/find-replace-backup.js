/**
 * Browser-compatible Find & Replace Backup functionality
 */

import { triggerDownload } from './browser-helpers.js';

// State Variables
let frData = null;
let frAllMatches = [];
let frCurrentMatchIndex = -1;
let frLastFindPattern = '';
let frLastUseRegex = false;
let frLastCaseSensitive = false;
let frLastWholeWord = false;

// Helper function for escaping HTML
function escapeHtml(unsafe) {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;'); // or &#39;
}


// UI Update Functions
function updateMatchDisplay(currentMatchDisplay, matchSceneTitleEl, matchBlockIndexEl, matchCountDisplayEl) {
    if (!currentMatchDisplay || !matchSceneTitleEl || !matchBlockIndexEl || !matchCountDisplayEl) return;

    if (frCurrentMatchIndex !== -1 && frAllMatches[frCurrentMatchIndex]) {
        const match = frAllMatches[frCurrentMatchIndex];

        matchSceneTitleEl.textContent = escapeHtml(match.chapterTitle);
        matchBlockIndexEl.textContent = match.blockIndex.toString();
        matchCountDisplayEl.textContent = `Match ${frCurrentMatchIndex + 1} of ${frAllMatches.length}`;

        const blockText = match.blockText;
        const matchStart = match.matchIndexInBlock;
        const matchEnd = matchStart + match.matchLength;

        const before = escapeHtml(blockText.substring(0, matchStart));
        const highlighted = `<span class="fr-match-highlight">${escapeHtml(blockText.substring(matchStart, matchEnd))}</span>`;
        const after = escapeHtml(blockText.substring(matchEnd));

        currentMatchDisplay.innerHTML = (before + highlighted + after).replace(/\n/g, '<br>');

    } else {
        matchSceneTitleEl.textContent = 'N/A';
        matchBlockIndexEl.textContent = 'N/A';
        if (frAllMatches.length > 0 && frCurrentMatchIndex === -1) {
             matchCountDisplayEl.textContent = `${frAllMatches.length} matches found`;
        } else if (frLastFindPattern) {
             matchCountDisplayEl.textContent = `0 matches found for "${escapeHtml(frLastFindPattern)}"`;
        } else {
             matchCountDisplayEl.textContent = '0 matches';
        }
        currentMatchDisplay.innerHTML = frLastFindPattern ? 'No match found for the current criteria.' : 'No match found yet.';
    }
}

// Core Find Logic
function performInitialFind(findPatternValue, useRegexValue, caseSensitiveValue, wholeWordValue, showAppToast) {
    if (!frData || !frData.revisions || !frData.revisions[0] || !frData.revisions[0].scenes) {
        showAppToast("Backup data is not loaded or invalid.", true);
        return;
    }
    if (!findPatternValue && !useRegexValue) {
        showAppToast("Please enter a find pattern.", true);
        frAllMatches = [];
        frCurrentMatchIndex = -1;
        return;
    }

    frAllMatches = [];
    frCurrentMatchIndex = -1;
    frLastFindPattern = findPatternValue;
    frLastUseRegex = useRegexValue;
    frLastCaseSensitive = caseSensitiveValue;
    frLastWholeWord = wholeWordValue;

    const scenes = frData.revisions[0].scenes;
    let regex = null;

    if (useRegexValue) {
        try {
            regex = new RegExp(findPatternValue, `g${caseSensitiveValue ? '' : 'i'}`);
        } catch (err) {
            showAppToast(`Invalid Regular Expression: ${err.message}`, true);
            return;
        }
    } else {
        if (wholeWordValue) {
            const escapedPattern = findPatternValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            try {
                regex = new RegExp(`\\b${escapedPattern}\\b`, `g${caseSensitiveValue ? '' : 'i'}`);
            } catch (err) {
                showAppToast(`Error creating whole word regex: ${err.message}`, true);
                return;
            }
        }
    }

    scenes.forEach((scene, sceneIdx) => {
        if (!scene || typeof scene.text !== 'string') return;
        try {
            const sceneContent = JSON.parse(scene.text);
            if (!sceneContent.blocks || !Array.isArray(sceneContent.blocks)) return;

            sceneContent.blocks.forEach((block, blockIdx) => {
                if (block.type !== 'text' || typeof block.text !== 'string' || !block.text) return;

                const blockText = block.text;
                let matchResult;

                if (regex) {
                    while ((matchResult = regex.exec(blockText)) !== null) {
                        frAllMatches.push({
                            sceneIndex: sceneIdx,
                            blockIndex: blockIdx,
                            matchIndexInBlock: matchResult.index,
                            matchLength: matchResult[0].length,
                            chapterTitle: scene.title,
                            blockText: blockText,
                            matchedText: matchResult[0]
                        });
                        if (regex.lastIndex === matchResult.index && matchResult[0].length === 0) {
                            regex.lastIndex++;
                        }
                    }
                } else {
                    let searchFromIndex = 0;
                    let foundIndex;
                    const patternToSearch = caseSensitiveValue ? findPatternValue : findPatternValue.toLowerCase();
                    const textToSearchIn = caseSensitiveValue ? blockText : blockText.toLowerCase();

                    while ((foundIndex = textToSearchIn.indexOf(patternToSearch, searchFromIndex)) !== -1) {
                         if (findPatternValue.length === 0 && foundIndex === searchFromIndex) {
                            frAllMatches.push({
                                sceneIndex: sceneIdx,
                                blockIndex: blockIdx,
                                matchIndexInBlock: foundIndex,
                                matchLength: 0,
                                chapterTitle: scene.title,
                                blockText: blockText,
                                matchedText: ""
                            });
                             searchFromIndex = foundIndex + 1;
                             if (searchFromIndex > blockText.length) break;
                             continue;
                        }
                        if(findPatternValue.length === 0) {
                            searchFromIndex++;
                            if (searchFromIndex > blockText.length) break;
                            continue;
                        }

                        frAllMatches.push({
                            sceneIndex: sceneIdx,
                            blockIndex: blockIdx,
                            matchIndexInBlock: foundIndex,
                            matchLength: findPatternValue.length,
                            chapterTitle: scene.title,
                            blockText: blockText,
                            matchedText: blockText.substring(foundIndex, foundIndex + findPatternValue.length)
                        });
                        searchFromIndex = foundIndex + findPatternValue.length;
                    }
                }
            });
        } catch (e) {
            console.warn(`Skipping scene "${scene.title || 'Untitled'}" due to invalid JSON during find:`, e);
        }
    });

    if (frAllMatches.length > 0) {
        showAppToast(`${frAllMatches.length} match(es) found.`);
    } else {
        showAppToast(`No matches found for "${escapeHtml(findPatternValue)}".`);
    }
}

export function initializeFindReplaceBackup(showAppToast, toggleAppSpinner) {
    const frBackupFileInput = document.getElementById('frBackupFile');
    const frBackupFileNameEl = document.getElementById('frBackupFileName');
    const clearFrBackupFileBtn = document.getElementById('clearFrBackupFile');

    const findPatternInput = document.getElementById('findPattern');
    const useRegexCheckbox = document.getElementById('useRegexBackup');
    const caseSensitiveCheckbox = document.getElementById('frCaseSensitiveCheckbox');
    const wholeWordCheckbox = document.getElementById('frWholeWordCheckbox');

    const replaceTextInput = document.getElementById('replaceText');

    const findNextBtn = document.getElementById('findNextBtn');
    const findPreviousBtn = document.getElementById('findPreviousBtn');
    const replaceNextBtn = document.getElementById('replaceNextBtn');
    const replaceAllBtn = document.getElementById('replaceAllBtn');
    const downloadCurrentFrBackupBtn = document.getElementById('downloadCurrentFrBackupBtn');

    const currentMatchDisplay = document.getElementById('currentMatchDisplay');
    const matchSceneTitleEl = document.getElementById('frMatchSceneTitle');
    const matchBlockIndexEl = document.getElementById('frMatchBlockIndex');
    const matchCountDisplayEl = document.getElementById('frMatchCountDisplay');

    const statusEl = document.getElementById('statusFindReplaceBackup');

    if (!frBackupFileInput || !frBackupFileNameEl || !clearFrBackupFileBtn ||
        !findPatternInput || !useRegexCheckbox || !caseSensitiveCheckbox || !wholeWordCheckbox ||
        !replaceTextInput ||
        !findNextBtn || !findPreviousBtn || !replaceNextBtn || !replaceAllBtn || !downloadCurrentFrBackupBtn ||
        !currentMatchDisplay || !matchSceneTitleEl || !matchBlockIndexEl || !matchCountDisplayEl || !statusEl) {
        console.error("Find & Replace Backup: One or more UI elements not found. Initialization failed.");
        return;
    }

    function resetFrState(fullReset = true) {
        if (fullReset) {
            frData = null;
            frLastFindPattern = '';
        }
        frAllMatches = [];
        frCurrentMatchIndex = -1;
        updateMatchDisplay(currentMatchDisplay, matchSceneTitleEl, matchBlockIndexEl, matchCountDisplayEl);
        if(statusEl) statusEl.style.display = 'none';
        if (downloadCurrentFrBackupBtn) downloadCurrentFrBackupBtn.disabled = !frData;
    }

    frBackupFileInput.addEventListener('change', (e) => {
        const target = e.target;
        resetFrState(true);

        if (!target.files || !target.files.length) {
            frBackupFileNameEl.textContent = '';
            if(clearFrBackupFileBtn) clearFrBackupFileBtn.style.display = 'none';
            return;
        }

        frBackupFileNameEl.textContent = `Selected: ${target.files[0].name}`;
        if(clearFrBackupFileBtn) clearFrBackupFileBtn.style.display = 'inline-block';

        toggleAppSpinner(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                frData = JSON.parse(event.target?.result);
                if (!frData.revisions || !frData.revisions[0] || !Array.isArray(frData.revisions[0].scenes)) {
                    throw new Error("Invalid backup structure (missing scenes array).");
                }
                showAppToast("Backup file loaded.");
                if (downloadCurrentFrBackupBtn) downloadCurrentFrBackupBtn.disabled = false;
            } catch (err) {
                showAppToast(err.message || "Error loading backup.", true);
                if(statusEl) {
                    statusEl.textContent = `Error: ${err.message || "Could not load backup."}`;
                    statusEl.className = 'status error';
                    statusEl.style.display = 'block';
                }
                resetFrState(true);
                frBackupFileNameEl.textContent = '';
                if(clearFrBackupFileBtn) clearFrBackupFileBtn.style.display = 'none';
                frBackupFileInput.value = '';
            } finally {
                toggleAppSpinner(false);
            }
        };
        reader.onerror = () => {
            showAppToast("Error reading backup file.", true);
            if(statusEl) {
                statusEl.textContent = 'Error: Could not read backup file.';
                statusEl.className = 'status error';
                statusEl.style.display = 'block';
            }
            resetFrState(true);
            frBackupFileNameEl.textContent = '';
            if(clearFrBackupFileBtn) clearFrBackupFileBtn.style.display = 'none';
            frBackupFileInput.value = '';
            toggleAppSpinner(false);
        };
        reader.readAsText(target.files[0]);
    });

    clearFrBackupFileBtn.addEventListener('click', () => {
        frBackupFileInput.value = '';
        frBackupFileNameEl.textContent = '';
        clearFrBackupFileBtn.style.display = 'none';
        resetFrState(true);
    });

    useRegexCheckbox.addEventListener('change', () => {
        wholeWordCheckbox.disabled = useRegexCheckbox.checked;
        if (useRegexCheckbox.checked) {
            wholeWordCheckbox.checked = false;
        }
        resetFrState(false);
    });
    caseSensitiveCheckbox.addEventListener('change', () => resetFrState(false));
    wholeWordCheckbox.addEventListener('change', () => resetFrState(false));
    findPatternInput.addEventListener('input', () => resetFrState(false));

    function handleFind(direction) {
        if(statusEl) statusEl.style.display = 'none';
        if (!frData) {
            showAppToast('Upload a backup file first.', true); return;
        }

        const pattern = findPatternInput.value;
        const useRegex = useRegexCheckbox.checked;
        const caseSensitive = caseSensitiveCheckbox.checked;
        const wholeWord = wholeWordCheckbox.checked && !useRegex;

        if (pattern !== frLastFindPattern || useRegex !== frLastUseRegex || caseSensitive !== frLastCaseSensitive || wholeWord !== frLastWholeWord || frAllMatches.length === 0 && pattern) {
            performInitialFind(pattern, useRegex, caseSensitive, wholeWord, showAppToast);
        }

        if (frAllMatches.length === 0) {
            updateMatchDisplay(currentMatchDisplay, matchSceneTitleEl, matchBlockIndexEl, matchCountDisplayEl);
            return;
        }

        if (direction === 'next') {
            if (frCurrentMatchIndex < frAllMatches.length - 1) {
                frCurrentMatchIndex++;
            } else {
                showAppToast('Reached end of document. Looping to start.', false);
                frCurrentMatchIndex = 0;
            }
        } else {
            if (frCurrentMatchIndex > 0) {
                frCurrentMatchIndex--;
            } else {
                 showAppToast('Reached beginning of document. Looping to end.', false);
                 frCurrentMatchIndex = frAllMatches.length - 1;
            }
        }
        updateMatchDisplay(currentMatchDisplay, matchSceneTitleEl, matchBlockIndexEl, matchCountDisplayEl);
    }

    findNextBtn.addEventListener('click', () => handleFind('next'));
    findPreviousBtn.addEventListener('click', () => handleFind('previous'));

    replaceNextBtn.addEventListener('click', () => {
        if(statusEl) statusEl.style.display = 'none';

        if (!frData || frCurrentMatchIndex === -1 || !frAllMatches[frCurrentMatchIndex]) {
            showAppToast('No current match to replace. Use "Find Next" first.', true); return;
        }

        try {
            const currentMatch = frAllMatches[frCurrentMatchIndex];
            const replacementText = replaceTextInput.value;
            const scene = frData.revisions[0].scenes[currentMatch.sceneIndex];
            const parsedSceneContent = JSON.parse(scene.text);
            const targetBlock = parsedSceneContent.blocks[currentMatch.blockIndex];

            if (targetBlock.type !== 'text' || typeof targetBlock.text !== 'string') {
                showAppToast('Cannot replace in non-text block.', true);
                return;
            }

            const originalBlockText = targetBlock.text;
            const textBeforeMatch = originalBlockText.substring(0, currentMatch.matchIndexInBlock);
            const textAfterMatch = originalBlockText.substring(currentMatch.matchIndexInBlock + currentMatch.matchLength);

            targetBlock.text = textBeforeMatch + replacementText + textAfterMatch;
            scene.text = JSON.stringify(parsedSceneContent);

            showAppToast('Match replaced.', false);

            const oldMatchGlobalIndex = frCurrentMatchIndex;
            performInitialFind(findPatternInput.value, useRegexCheckbox.checked, caseSensitiveCheckbox.checked, wholeWordCheckbox.checked && !useRegexCheckbox.checked, showAppToast);

            if (frAllMatches.length > 0) {
                frCurrentMatchIndex = Math.min(oldMatchGlobalIndex, frAllMatches.length - 1);
                if (frCurrentMatchIndex < 0 && frAllMatches.length > 0) frCurrentMatchIndex = 0;
            } else {
                frCurrentMatchIndex = -1;
            }
            updateMatchDisplay(currentMatchDisplay, matchSceneTitleEl, matchBlockIndexEl, matchCountDisplayEl);

        } catch (err) {
            showAppToast(err.message || 'Error replacing text.', true);
            console.error("Replace Next Error:", err);
        }
    });

    replaceAllBtn.addEventListener('click', async () => {
        if(statusEl) statusEl.style.display = 'none';
        if (!frData) {
            showAppToast('Upload a backup file first.', true); return;
        }

        const findPattern = findPatternInput.value;
        const replacementText = replaceTextInput.value;
        const useRegex = useRegexCheckbox.checked;
        const caseSensitive = caseSensitiveCheckbox.checked;
        const wholeWord = wholeWordCheckbox.checked && !useRegex;

        if (!findPattern && !useRegex) {
            showAppToast('Enter a find pattern.', true); return;
        }
        if (!findPattern && useRegex && findPattern.length === 0 && replacementText.length === 0 ) {
             showAppToast('Replacing empty regex match with empty string can be risky. Aborting.', true); return;
        }

        toggleAppSpinner(true);
        try {
            const rev = frData.revisions[0];
            let totalReplacementsMade = 0;
            let regex = null;

            if (useRegex) {
                regex = new RegExp(findPattern, `g${caseSensitive ? '' : 'i'}`);
            } else if (wholeWord) {
                const escapedPattern = findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(`\\b${escapedPattern}\\b`, `g${caseSensitive ? '' : 'i'}`);
            }

            rev.scenes.forEach(scene => {
                try {
                    const sceneContent = JSON.parse(scene.text);
                    sceneContent.blocks.forEach(block => {
                        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
                            const originalText = block.text;
                            let newText = originalText;

                            if (regex) {
                                newText = originalText.replace(regex, (match) => {
                                    totalReplacementsMade++;
                                    return replacementText;
                                });
                            } else {
                                const patternToSearch = caseSensitive ? findPattern : findPattern.toLowerCase();
                                const textToSearchIn = caseSensitive ? originalText : originalText.toLowerCase();
                                let result = "";
                                let lastIndex = 0;
                                let foundIndex;

                                if (patternToSearch.length === 0) {
                                     if(replacementText.length > 0) {
                                        for(let k=0; k < originalText.length; k++) {
                                            result += replacementText + originalText[k];
                                            totalReplacementsMade++;
                                        }
                                        result += replacementText;
                                        totalReplacementsMade++;
                                        newText = result;
                                     } else {
                                        newText = originalText;
                                     }
                                } else {
                                    while ((foundIndex = textToSearchIn.indexOf(patternToSearch, lastIndex)) !== -1) {
                                        result += originalText.substring(lastIndex, foundIndex) + replacementText;
                                        lastIndex = foundIndex + findPattern.length;
                                        totalReplacementsMade++;
                                    }
                                    result += originalText.substring(lastIndex);
                                    newText = result;
                                }
                            }
                             block.text = newText;
                        }
                    });
                    scene.text = JSON.stringify(sceneContent);
                } catch (e) {
                    console.warn(`Error processing scene "${scene.title}" during Replace All:`, e);
                }
            });

            const now = Date.now();
            frData.last_update_date = now;
            frData.last_backup_date = now;
            if(rev) rev.date = now;

            const blob = new Blob([JSON.stringify(frData, null, 2)], { type: 'application/json' });
            const filename = `${frData.title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'replaced_backup'}.json`;
            await triggerDownload(blob, filename, 'application/json', showAppToast);

            showAppToast(`Replace All complete. ${totalReplacementsMade} replacement(s) made. Download started.`);

            resetFrState(false);

        } catch (err) {
            showAppToast(err.message || 'Error during Replace All.', true);
            console.error("Replace All Error:", err);
        } finally {
            toggleAppSpinner(false);
        }
    });

    downloadCurrentFrBackupBtn.addEventListener('click', async () => {
        if (statusEl) statusEl.style.display = 'none';

        if (!frData) {
            showAppToast('No backup file loaded to download.', true);
            return;
        }
        toggleAppSpinner(true);
        try {
            const now = Date.now();
            frData.last_update_date = now;
            frData.last_backup_date = now;
            if (frData.revisions && frData.revisions[0]) {
                frData.revisions[0].date = now;
            }

            const blob = new Blob([JSON.stringify(frData, null, 2)], { type: 'application/json' });
            const filename = `${frData.title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'current_backup'}_current.json`;
            await triggerDownload(blob, filename, 'application/json', showAppToast);

            showAppToast(`Current backup download started: ${filename}`);
             if (statusEl) {
                statusEl.textContent = `Current backup download started: ${filename}`;
                statusEl.className = 'status success';
                statusEl.style.display = 'block';
            }

        } catch (err) {
            showAppToast(err.message || 'Error downloading current backup.', true);
            if (statusEl) {
                statusEl.textContent = `Error: ${err.message || 'Could not download current backup.'}`;
                statusEl.className = 'status error';
                statusEl.style.display = 'block';
            }
            console.error("Download Current Backup Error:", err);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
