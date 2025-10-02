/**
 * Browser-compatible Merge Backup functionality
 */

import { triggerDownload } from './browser-helpers.js';
import { updateStatus } from './tool-helpers.js';
import { calculateWordCount } from './backup-helpers.js';

let selectedBackupFiles = []; // Array of { id, file, title, cover, data }
let selectedCoverData = null;
let draggedItemId = null;


async function processMergeBackupFiles(backupDataArray, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, coverData, showAppToast) {
    let combinedScenes = [];
    let combinedSections = [];
    const allStatuses = new Map();

    for (const data of backupDataArray) {
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
                console.warn(`Skipping a file in merge: No valid revision found.`);
                showAppToast(`Skipped a file (no revision data).`, true);
            }
        } catch (e) {
            console.warn(`Skipping a file in merge due to error:`, e);
            showAppToast(`Skipped a file during merge (error).`, true);
        }
    }

    const finalStatuses = Array.from(allStatuses.values())
        .sort((a, b) => (a.ranking || Infinity) - (b.ranking || Infinity))
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

    return {
        version: 4,
        code: Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'),
        title: mergedTitle,
        description: mergedDesc,
        cover: coverData,
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
}

export function initializeMergeBackup(showAppToast, toggleAppSpinner) {
    const mergeBtn = document.getElementById('mergeBackupBtn');
    const filesInput = document.getElementById('mergeBackupFiles');
    const fileListEl = document.getElementById('mergeBackupFileList');
    const clearFilesBtn = document.getElementById('clearMergeBackupFiles');
    const mergedTitleInput = document.getElementById('mergeProjectTitle');
    const mergedDescInput = document.getElementById('mergeDescription');
    const chapterPrefixInput = document.getElementById('mergePrefix');
    const preserveTitlesCheckbox = document.getElementById('mergePreserveTitles');
    const statusEl = document.getElementById('statusMergeBackup');
    const coverSelectionArea = document.getElementById('mergeCoverSelectionArea');
    const coverGridEl = document.getElementById('mergeCoverGrid');

    if (!mergeBtn || !filesInput || !fileListEl || !clearFilesBtn ||
        !mergedTitleInput || !mergedDescInput || !chapterPrefixInput || !preserveTitlesCheckbox || !statusEl ||
        !coverSelectionArea || !coverGridEl) {
        console.error("Merge Backup: One or more UI elements not found. Initialization failed.");
        return;
    }

    function renderFileList() {
        fileListEl.innerHTML = '';
        if (selectedBackupFiles.length === 0) {
            fileListEl.innerHTML = '<li class="p-3 text-center text-sm text-slate-500 dark:text-slate-400">No files selected.</li>';
            return;
        }
        selectedBackupFiles.forEach(item => {
            const li = document.createElement('li');
            li.draggable = true;
            li.dataset.id = item.id;
            li.className = 'flex items-center p-2.5 border-b border-slate-200 dark:border-slate-700 cursor-grab user-select-none transition-all duration-200 rounded-md mb-0.5 last:border-b-0 hover:bg-slate-200/50 dark:hover:bg-slate-700/50';
            li.innerHTML = `<span class="text-slate-800 dark:text-slate-200 p-1.5 text-sm">${item.title}</span>`;
            fileListEl.appendChild(li);
        });
    }

    function renderCoverSelection() {
        coverGridEl.innerHTML = '';
        const covers = selectedBackupFiles.filter(item => item.cover);

        if (covers.length === 0) {
            coverSelectionArea.classList.add('hidden');
            return;
        }
        
        coverSelectionArea.classList.remove('hidden');

        // "No Cover" option
        const noCoverEl = document.createElement('div');
        noCoverEl.className = 'w-full aspect-[2/3] bg-slate-200 dark:bg-slate-800 rounded-md flex items-center justify-center text-center text-xs p-2 text-slate-600 dark:text-slate-300 cursor-pointer transition-all duration-200';
        noCoverEl.textContent = 'No Cover';
        noCoverEl.dataset.coverId = 'none';
        coverGridEl.appendChild(noCoverEl);

        // Cover thumbnails
        covers.forEach(item => {
            const coverEl = document.createElement('div');
            coverEl.className = 'w-full aspect-[2/3] bg-cover bg-center rounded-md cursor-pointer transition-all duration-200';
            coverEl.style.backgroundImage = `url(data:image/jpeg;base64,${item.cover})`;
            coverEl.dataset.coverId = item.id;
            coverGridEl.appendChild(coverEl);
        });

        updateCoverSelectionUI();
    }

    function updateCoverSelectionUI() {
        coverGridEl.querySelectorAll('[data-cover-id]').forEach(el => {
            const isSelected = (selectedCoverData && el.dataset.coverId === selectedBackupFiles.find(f => f.cover === selectedCoverData)?.id) || (!selectedCoverData && el.dataset.coverId === 'none');
            el.classList.toggle('ring-4', isSelected);
            el.classList.toggle('ring-primary-500', isSelected);
        });
    }

    async function handleFileSelection(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        toggleAppSpinner(true);
        statusEl.classList.add('hidden');

        const filePromises = Array.from(files).map(async (file, index) => {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                return {
                    id: `backup-${Date.now()}-${index}`,
                    file: file,
                    title: data.title || file.name,
                    cover: data.cover || null,
                    data: data
                };
            } catch (e) {
                showAppToast(`Could not parse ${file.name}. It may not be a valid backup file.`, true);
                return null;
            }
        });

        selectedBackupFiles = (await Promise.all(filePromises)).filter(Boolean);

        if (selectedBackupFiles.length > 0) {
            clearFilesBtn.classList.remove('hidden');
            mergeBtn.disabled = false;
            // Set default selected cover
            selectedCoverData = selectedBackupFiles.find(f => f.cover)?.cover || null;
        }

        renderFileList();
        renderCoverSelection();
        toggleAppSpinner(false);
    }
    
    function clearFileSelection() {
        filesInput.value = '';
        selectedBackupFiles = [];
        selectedCoverData = null;
        renderFileList();
        coverSelectionArea.classList.add('hidden');
        clearFilesBtn.classList.add('hidden');
        mergeBtn.disabled = true;
        statusEl.classList.add('hidden');
    }

    filesInput.addEventListener('change', handleFileSelection);
    clearFilesBtn.addEventListener('click', clearFileSelection);

    fileListEl.addEventListener('dragstart', (e) => {
        if (e.target.matches('li')) {
            draggedItemId = e.target.dataset.id;
            e.target.classList.add('opacity-50');
        }
    });

    fileListEl.addEventListener('dragend', (e) => {
        if (e.target.matches('li')) {
            e.target.classList.remove('opacity-50');
            draggedItemId = null;
        }
    });

    fileListEl.addEventListener('dragover', e => e.preventDefault());

    fileListEl.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedItemId) return;
        const targetLi = e.target.closest('li');
        if (!targetLi || targetLi.dataset.id === draggedItemId) return;

        const draggedIndex = selectedBackupFiles.findIndex(item => item.id === draggedItemId);
        let targetIndex = Array.from(fileListEl.children).indexOf(targetLi);

        const [draggedItem] = selectedBackupFiles.splice(draggedIndex, 1);
        selectedBackupFiles.splice(targetIndex, 0, draggedItem);
        
        renderFileList();
    });

    coverGridEl.addEventListener('click', (e) => {
        const targetCover = e.target.closest('[data-cover-id]');
        if (!targetCover) return;
        const coverId = targetCover.dataset.coverId;
        if (coverId === 'none') {
            selectedCoverData = null;
        } else {
            const selectedFile = selectedBackupFiles.find(item => item.id === coverId);
            selectedCoverData = selectedFile ? selectedFile.cover : null;
        }
        updateCoverSelectionUI();
    });

    mergeBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        const mergedTitle = mergedTitleInput.value.trim();
        const mergedDesc = mergedDescInput.value.trim();
        const chapterPrefix = chapterPrefixInput.value.trim();
        const preserveOriginalTitles = preserveTitlesCheckbox.checked;

        if (selectedBackupFiles.length === 0) {
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

        toggleAppSpinner(true);

        try {
            const orderedBackupData = selectedBackupFiles.map(item => item.data);
            const mergedData = await processMergeBackupFiles(
                orderedBackupData, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, selectedCoverData, showAppToast
            );

            if (mergedData.revisions[0].scenes.length === 0) {
                showAppToast('No valid chapters found in the selected files to merge.', true);
                updateStatus(statusEl, 'Error: No valid chapters to merge from selected files.', 'error');
            } else {
                const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
                const filenameBase = mergedTitle.replace(/[^a-z0-9_\\-\\s]/gi, '_').replace(/\\s+/g, '_') || 'merged_backup';
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