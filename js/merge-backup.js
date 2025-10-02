/**
 * Browser-compatible Merge Backup functionality with reordering and cover selection.
 */

import { triggerDownload } from './browser-helpers.js';
import { updateStatus } from './tool-helpers.js';
import { calculateWordCount } from './backup-helpers.js';
import { escapeHTML } from './ui-helpers.js';

async function processMergeBackupFiles(backups, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, selectedCover, showAppToast) {
    let combinedScenes = [];
    let combinedSections = [];
    const allStatuses = new Map();

    for (const data of backups) {
        try {
            const rev = data.revisions?.[0];
            if (rev) {
                if (rev.scenes) {
                    if (preserveOriginalTitles) {
                        rev.scenes.forEach(s => (s.originalTitle = s.title));
                    }
                    combinedScenes = combinedScenes.concat(rev.scenes);
                }
                if (rev.sections) {
                     if (preserveOriginalTitles) {
                        rev.sections.forEach(s => (s.originalTitle = s.title));
                    }
                    combinedSections = combinedSections.concat(rev.sections);
                }
                if (rev.statuses) {
                    rev.statuses.forEach(status => {
                        if (!allStatuses.has(status.code)) {
                            allStatuses.set(status.code, status);
                        }
                    });
                }
            } else {
                 console.warn(`Skipping backup '${data.title || 'untitled'}' in merge: No valid revision found.`);
                 showAppToast(`Skipped a backup (no revision data).`, true);
            }
        } catch (e) {
            console.warn(`Skipping a backup in merge due to processing error:`, e);
            showAppToast(`Skipped a backup during merge (invalid data).`, true);
        }
    }

    const finalStatuses = Array.from(allStatuses.values())
        .sort((a,b) => (a.ranking || Infinity) - (b.ranking || Infinity))
        .map((status, index) => ({ ...status, ranking: index + 1 }));

    if (finalStatuses.length === 0) {
        finalStatuses.push({ code: '1', title: 'Todo', color: -2697255, ranking: 1 });
    }

    combinedScenes.forEach((s, i) => {
        const n = i + 1;
        s.code = `scene${n}`;
        s.title = (preserveOriginalTitles && s.originalTitle)
            ? (chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle)
            : (chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`);
        s.ranking = n;
        delete s.originalTitle;
    });

    combinedSections.forEach((s, i) => {
        const n = i + 1;
        s.code = `section${n}`;
        s.title = (preserveOriginalTitles && s.originalTitle)
            ? (chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle)
            : (chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`);
        s.ranking = n;
        delete s.originalTitle;
        s.section_scenes = [{ code: `scene${n}`, ranking: 1 }];
    });

    const now = Date.now();
    const totalWordCount = calculateWordCount(combinedScenes);

    const mergedData = {
        version: 4,
        code: Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'),
        title: mergedTitle,
        description: mergedDesc,
        show_table_of_contents: true,
        apply_automatic_indentation: false,
        last_update_date: now,
        last_backup_date: now,
        revisions: [{
            number: 1, date: now,
            book_progresses: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate(), word_count: totalWordCount }],
            statuses: finalStatuses,
            scenes: combinedScenes,
            sections: combinedSections
        }]
    };

    if (selectedCover) {
        mergedData.coverImage = selectedCover;
    }

    return mergedData;
}

export function initializeMergeBackup(showAppToast, toggleAppSpinner) {
    const mergeBtn = document.getElementById('mergeBackupBtn');
    const filesInput = document.getElementById('mergeBackupFiles');
    const fileListContainer = document.getElementById('mergeBackupFilelistContainer');
    const fileListUl = document.getElementById('mergeBackupFileList');
    const clearFilesBtn = document.getElementById('clearMergeBackupFiles');
    const initialFileNamesArea = document.getElementById('mergeBackupFileNamesArea');
    const mergedTitleInput = document.getElementById('mergeProjectTitle');
    const mergedDescInput = document.getElementById('mergeDescription');
    const chapterPrefixInput = document.getElementById('mergePrefix');
    const preserveTitlesCheckbox = document.getElementById('mergePreserveTitles');
    const statusEl = document.getElementById('statusMergeBackup');
    const coverSelectionArea = document.getElementById('coverSelectionArea');
    const coverOptionsContainer = document.getElementById('coverOptionsContainer');

    let backupFiles = [];
    let draggedItem = null;

    if (!mergeBtn || !filesInput || !fileListContainer || !fileListUl || !clearFilesBtn ||
        !initialFileNamesArea || !mergedTitleInput || !mergedDescInput || !chapterPrefixInput || 
        !preserveTitlesCheckbox || !statusEl || !coverSelectionArea || !coverOptionsContainer) {
        console.error("Merge Backup: One or more UI elements not found. Initialization failed.");
        return;
    }

    const resetState = () => {
        backupFiles = [];
        filesInput.value = '';
        fileListContainer.classList.add('hidden');
        initialFileNamesArea.classList.remove('hidden');
        initialFileNamesArea.querySelector('#mergeBackupFileNames').textContent = 'No files selected.';
        coverSelectionArea.classList.add('hidden');
        fileListUl.innerHTML = '';
        coverOptionsContainer.innerHTML = '';
        statusEl.classList.add('hidden');
    };

    const renderFileList = () => {
        fileListUl.innerHTML = '';
        backupFiles.forEach((fileInfo, index) => {
            const li = document.createElement('li');
            li.className = 'flex items-center p-2 border-b border-slate-200 dark:border-slate-700 last:border-b-0 cursor-grab bg-white dark:bg-slate-700/50';
            li.draggable = true;
            li.dataset.index = index;
            li.innerHTML = `<span class="text-2xl text-slate-400 mr-2" aria-hidden="true">⠿</span><span class="flex-grow text-sm truncate">${escapeHTML(fileInfo.name)}</span>`;
            fileListUl.appendChild(li);
        });
    };

    const renderCoverSelection = () => {
        coverOptionsContainer.innerHTML = '';
        const covers = backupFiles.filter(f => f.coverDataUrl);
        
        if (covers.length === 0) {
            coverSelectionArea.classList.add('hidden');
            return;
        }
        
        // No Cover option
        coverOptionsContainer.innerHTML += `
            <label class="relative cursor-pointer">
                <input type="radio" name="cover-select" value="none" class="sr-only" checked>
                <div class="h-full min-h-[120px] flex items-center justify-center bg-slate-200 dark:bg-slate-700 rounded-md border-2 border-transparent peer-checked:border-primary-500 peer-checked:ring-2 peer-checked:ring-primary-500">
                    <span class="text-slate-500 dark:text-slate-400 text-sm text-center">No Cover</span>
                </div>
            </label>
        `;

        covers.forEach((fileInfo, index) => {
            const coverHtml = `
                <label class="relative cursor-pointer group">
                    <input type="radio" name="cover-select" value="${index}" class="sr-only">
                    <img src="${fileInfo.coverDataUrl}" alt="Cover from ${escapeHTML(fileInfo.name)}" class="w-full h-full object-cover rounded-md border-2 border-transparent group-hover:opacity-80 peer-checked:border-primary-500 peer-checked:ring-2 peer-checked:ring-primary-500">
                    <div class="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center p-1 truncate rounded-b-md">${escapeHTML(fileInfo.name)}</div>
                </label>
            `;
            coverOptionsContainer.innerHTML += coverHtml;
        });

        coverSelectionArea.classList.remove('hidden');
    };

    const handleFileSelection = async (event) => {
        resetState();
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        toggleAppSpinner(true);
        const filePromises = files.map(file => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                let fileInfo = { name: file.name, jsonData: null, cover: null, coverDataUrl: null };
                try {
                    const data = JSON.parse(reader.result);
                    fileInfo.jsonData = data;
                    if (data.coverImage && data.coverImage.data && data.coverImage.mimeType) {
                        fileInfo.cover = data.coverImage;
                        fileInfo.coverDataUrl = `data:${data.coverImage.mimeType};base64,${data.coverImage.data}`;
                    }
                } catch (e) {
                    console.warn(`Could not parse ${file.name} as JSON.`);
                    showAppToast(`Could not read ${file.name}. It might not be a valid backup file.`, true);
                }
                resolve(fileInfo);
            };
            reader.onerror = () => {
                resolve({ name: file.name, jsonData: null, cover: null, coverDataUrl: null });
                showAppToast(`Error reading file ${file.name}.`, true);
            }
            reader.readAsText(file);
        }));

        backupFiles = (await Promise.all(filePromises)).filter(f => f.jsonData !== null);
        
        if (backupFiles.length > 0) {
            initialFileNamesArea.classList.add('hidden');
            fileListContainer.classList.remove('hidden');
            renderFileList();
            renderCoverSelection();
        } else {
            initialFileNamesArea.querySelector('#mergeBackupFileNames').textContent = 'No valid backup files were selected.';
        }
        toggleAppSpinner(false);
    };

    filesInput.addEventListener('change', handleFileSelection);
    clearFilesBtn.addEventListener('click', resetState);

    // Drag and Drop Logic
    fileListUl.addEventListener('dragstart', (e) => {
        if (e.target.tagName === 'LI') {
            draggedItem = e.target;
            setTimeout(() => e.target.classList.add('opacity-50'), 0);
        }
    });
    fileListUl.addEventListener('dragend', (e) => {
        if (draggedItem) {
            draggedItem.classList.remove('opacity-50');
            draggedItem = null;

            const newOrder = Array.from(fileListUl.children).map(li => backupFiles[li.dataset.index]);
            backupFiles = newOrder;
            // Re-render to update indexes
            renderFileList();
        }
    });
    fileListUl.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = [...fileListUl.querySelectorAll('li:not(.opacity-50)')].reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return (offset < 0 && offset > closest.offset) ? { offset, element: child } : closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        
        if (draggedItem) {
            if (afterElement == null) fileListUl.appendChild(draggedItem);
            else fileListUl.insertBefore(draggedItem, afterElement);
        }
    });

    mergeBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        const backupsToMerge = backupFiles.map(f => f.jsonData);
        const mergedTitle = mergedTitleInput.value.trim();
        const mergedDesc = mergedDescInput.value.trim();
        const chapterPrefix = chapterPrefixInput.value.trim();
        const preserveOriginalTitles = preserveTitlesCheckbox.checked;

        if (backupsToMerge.length === 0) {
            showAppToast('Select at least one backup file to merge.', true);
            updateStatus(statusEl, 'Error: Select at least one backup file.', 'error');
            filesInput.focus();
            return;
        }
        if (!mergedTitle) {
            showAppToast('Merged Project Title is required.', true);
            updateStatus(statusEl, 'Error: Merged Project Title is required.', 'error');
            mergedTitleInput.focus();
            return;
        }

        const selectedCoverRadio = document.querySelector('input[name="cover-select"]:checked');
        let selectedCover = null;
        if (selectedCoverRadio && selectedCoverRadio.value !== 'none') {
            const coverIndex = parseInt(selectedCoverRadio.value, 10);
            const coverFile = backupFiles.filter(f => f.cover)[coverIndex];
            if(coverFile) {
                selectedCover = coverFile.cover;
            }
        }

        toggleAppSpinner(true);
        try {
            const mergedData = await processMergeBackupFiles(
                backupsToMerge, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, selectedCover, showAppToast
            );
            if (mergedData.revisions[0].scenes.length === 0) {
                showAppToast('No valid chapters found in the selected files to merge.', true);
                updateStatus(statusEl, 'Error: No valid chapters to merge from selected files.', 'error');
            } else {
                const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
                const filenameBase = mergedTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'merged_backup';
                const filename = `${filenameBase}.json`;
                await triggerDownload(blob, filename, 'application/json', showAppToast);
                updateStatus(statusEl, `Backup files merged into "${mergedTitle}". Download started.`, 'success');
                showAppToast('Backup files merged successfully.');
            }
        } catch (err) {
            showAppToast(err.message || 'Error merging backup files.', true);
            updateStatus(statusEl, `Error: ${err.message || 'Could not merge backups.'}`, 'error');
            console.error("Merge Backup Error:", err);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
