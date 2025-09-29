/**
 * Browser-compatible Merge Backup functionality
 */

import { triggerDownload } from './browser-helpers.js';

async function processMergeBackupFiles(files, mergedTitle, mergedDesc, chapterPrefix, preserveOriginalTitles, showAppToast) {
    let combinedScenes = [];
    let combinedSections = [];
    const allStatuses = [];
    const seenStatusCodes = new Set();

    for (const file of files) {
        try {
            const fileText = await file.text();
            const data = JSON.parse(fileText);
            const rev = data.revisions && data.revisions[0];
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

                if (rev.statuses && rev.statuses.length > 0) {
                    rev.statuses.forEach(status => {
                        if (!seenStatusCodes.has(status.code)) {
                            allStatuses.push(status);
                            seenStatusCodes.add(status.code);
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

    const finalStatuses = allStatuses.sort((a,b) => {
        return (a.ranking || Infinity) - (b.ranking || Infinity);
    }).map((status, index) => ({
        ...status,
        ranking: index + 1
    }));

    if (finalStatuses.length === 0) {
        finalStatuses.push({ code: '1', title: 'Todo', color: -2697255, ranking: 1 });
    }

    combinedScenes.forEach((s, i) => {
        const n = i + 1;
        s.code = 'scene' + n;
        if (preserveOriginalTitles && s.originalTitle) {
            s.title = chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle;
        } else {
            s.title = chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`;
        }
        s.ranking = n;
        delete s.originalTitle;
    });

    combinedSections.forEach((s, i) => {
        const n = i + 1;
        s.code = 'section' + n;
         if (preserveOriginalTitles && s.originalTitle) {
            s.title = chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle;
        } else {
            s.title = chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`;
        }
        s.ranking = n;
        delete s.originalTitle;

        s.section_scenes = [{ code: 'scene' + n, ranking: 1 }];
    });

    const now = Date.now();
    let totalWordCount = 0;
    combinedScenes.forEach(scene => {
        try {
            const sceneContent = JSON.parse(scene.text);
            sceneContent.blocks.forEach(block => {
                if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                    totalWordCount += block.text.trim().split(/\s+/).length;
                }
            });
        } catch (e) { console.warn("Word count error in merged scene:", e); }
    });

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

    filesInput.addEventListener('change', () => {
        if (filesInput.files && filesInput.files.length > 0) {
            let fileListHtml = '<ul style="margin: 0; padding-left: 15px; font-size: 0.9em;">';
            for (let i = 0; i < filesInput.files.length; i++) {
                fileListHtml += `<li>${filesInput.files[i].name}</li>`;
            }
            fileListHtml += '</ul>';
            fileNamesEl.innerHTML = fileListHtml;
            if(clearFilesBtn) clearFilesBtn.style.display = 'inline-block';
        } else {
            fileNamesEl.textContent = 'No files selected.';
            if(clearFilesBtn) clearFilesBtn.style.display = 'none';
        }
        statusEl.style.display = 'none';
    });

    clearFilesBtn.addEventListener('click', () => {
        filesInput.value = '';
        fileNamesEl.textContent = 'No files selected.';
        clearFilesBtn.style.display = 'none';
        statusEl.style.display = 'none';
    });

    mergeBtn.addEventListener('click', async () => {
        statusEl.style.display = 'none';
        const files = filesInput.files ? Array.from(filesInput.files) : [];
        const mergedTitle = mergedTitleInput.value.trim();
        const mergedDesc = mergedDescInput.value.trim();
        const chapterPrefix = chapterPrefixInput.value.trim();
        const preserveOriginalTitles = preserveTitlesCheckbox.checked;

        if (!files.length) {
            showAppToast('Select at least one backup file to merge.', true);
            statusEl.textContent = 'Error: Select at least one backup file.';
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
            filesInput.focus();
            return;
        }
        if (!mergedTitle) {
            showAppToast('Merged Project Title is required.', true);
            statusEl.textContent = 'Error: Merged Project Title is required.';
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
            mergedTitleInput.focus();
            return;
        }

        toggleAppSpinner(true);

        try {
            const mergedData = await processMergeBackupFiles(
                files,
                mergedTitle,
                mergedDesc,
                chapterPrefix,
                preserveOriginalTitles,
                showAppToast
            );

            if (mergedData.revisions[0].scenes.length === 0) {
                showAppToast('No valid chapters found in the selected files to merge.', true);
                if (statusEl) {
                    statusEl.textContent = 'Error: No valid chapters to merge from selected files.';
                    statusEl.className = 'status error';
                    statusEl.style.display = 'block';
                }
            } else {
                const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
                const filenameBase = mergedTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'merged_backup';
                const filename = `${filenameBase}.json`;
                await triggerDownload(blob, filename, 'application/json', showAppToast);

                statusEl.textContent = `Backup files merged into "${mergedTitle}". Download started.`;
                statusEl.className = 'status success';
                statusEl.style.display = 'block';
                showAppToast('Backup files merged successfully.');
            }

        } catch (err) {
            if (!(statusEl.textContent && statusEl.textContent.includes('No valid chapters'))) {
                showAppToast(err.message || 'Error merging backup files.', true);
                statusEl.textContent = `Error: ${err.message || 'Could not merge backups.'}`;
                statusEl.className = 'status error';
                statusEl.style.display = 'block';
            }
            console.error("Merge Backup Error:", err);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
