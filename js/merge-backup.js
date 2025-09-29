/**
 * Browser-compatible Merge Backup functionality
 */

import { triggerDownload } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { calculateWordCount } from './backup-helpers.js';

async function processMergeBackupFiles(files, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, showAppToast) {
    let combinedScenes = [];
    let combinedSections = [];
    const allStatuses = new Map();

    for (const file of files) {
        try {
            const fileText = await file.text();
            const data = JSON.parse(fileText);
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
                 console.warn(`Skipping file ${file.name} in merge: No valid revision found.`);
                 showAppToast(`Skipped ${file.name} (no revision data).`, true);
            }
        } catch (e) {
            console.warn(`Skipping file ${file.name} in merge due to parse error:`, e);
            showAppToast(`Skipped ${file.name} during merge (invalid JSON format).`, true);
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

    return {
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
}

export function initializeMergeBackup(showAppToast, toggleAppSpinner) {
    const mergeBtn = document.getElementById('mergeBackupBtn');
    const filesInput = document.getElementById('mergeBackupFiles');
    const fileNamesEl = document.getElementById('mergeBackupFileNames');
    const clearFilesBtn = document.getElementById('clearMergeBackupFiles');
    const mergedTitleInput = document.getElementById('mergeProjectTitle');
    const mergedDescInput = document.getElementById('mergeDescription');
    const chapterPrefixInput = document.getElementById('mergePrefix');
    const preserveTitlesCheckbox = document.getElementById('mergePreserveTitles');
    const statusEl = document.getElementById('statusMergeBackup');

    if (!mergeBtn || !filesInput || !fileNamesEl || !clearFilesBtn ||
        !mergedTitleInput || !mergedDescInput || !chapterPrefixInput || !preserveTitlesCheckbox || !statusEl) {
        console.error("Merge Backup: One or more UI elements not found. Initialization failed.");
        return;
    }
    
    setupFileInput({
        inputEl: filesInput,
        fileNameEl: fileNamesEl,
        clearBtnEl: clearFilesBtn,
        onFileSelected: () => statusEl.classList.add('hidden'),
        onFileCleared: () => statusEl.classList.add('hidden'),
    });


    mergeBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        const files = filesInput.files ? Array.from(filesInput.files) : [];
        const mergedTitle = mergedTitleInput.value.trim();
        const mergedDesc = mergedDescInput.value.trim();
        const chapterPrefix = chapterPrefixInput.value.trim();
        const preserveOriginalTitles = preserveTitlesCheckbox.checked;

        if (!files.length) {
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
            const mergedData = await processMergeBackupFiles(
                files, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, showAppToast
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