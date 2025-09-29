/**
 * Browser-compatible Augment Backup with ZIP functionality
 */

import { triggerDownload } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { parseTextToBlocks, calculateWordCount } from './backup-helpers.js';

export function initializeAugmentBackupWithZip(showAppToast, toggleAppSpinner) {
    const baseBackupFileInput = document.getElementById('augmentBaseBackupFile');
    const baseBackupFileNameEl = document.getElementById('augmentBaseBackupFileName');
    const clearBaseBackupFileBtn = document.getElementById('clearAugmentBaseBackupFile');

    const zipFileInput = document.getElementById('augmentZipFile');
    const zipFileNameEl = document.getElementById('augmentZipFileName');
    const clearZipFileBtn = document.getElementById('clearAugmentZipFile');

    const prefixInput = document.getElementById('augmentPrefix');
    const startNumberInput = document.getElementById('augmentStartNumber');
    const preserveTxtTitlesCheckbox = document.getElementById('augmentPreserveTxtTitles');
    const augmentBtn = document.getElementById('augmentBackupBtn');
    const statusEl = document.getElementById('statusAugmentBackup');

    let selectedBaseFile = null;
    let selectedZipFile = null;

    if (!baseBackupFileInput || !baseBackupFileNameEl || !clearBaseBackupFileBtn ||
        !zipFileInput || !zipFileNameEl || !clearZipFileBtn ||
        !prefixInput || !startNumberInput || !preserveTxtTitlesCheckbox || !augmentBtn || !statusEl) {
        console.error("Augment Backup with ZIP: One or more UI elements not found. Initialization failed.");
        return;
    }

    function checkEnableButton() {
        augmentBtn.disabled = !(selectedBaseFile && selectedZipFile);
    }

    setupFileInput({
        inputEl: baseBackupFileInput,
        fileNameEl: baseBackupFileNameEl,
        clearBtnEl: clearBaseBackupFileBtn,
        async onFileSelected(files) {
            selectedBaseFile = files[0];
            statusEl.classList.add('hidden');
            try {
                const baseFileText = await selectedBaseFile.text();
                const backupData = JSON.parse(baseFileText);
                if (!backupData.revisions?.[0]?.scenes) {
                    throw new Error('Invalid backup file structure.');
                }
                const currentRevision = backupData.revisions[0];
                let maxExistingRank = 0;
                currentRevision.scenes.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
                currentRevision.sections.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
                const nextAvailableRank = maxExistingRank + 1;
                startNumberInput.value = nextAvailableRank;
                startNumberInput.min = nextAvailableRank;
            } catch (err) {
                showAppToast(`Error reading base backup: ${err.message}`, true);
                baseBackupFileInput.value = ''; // Trigger change event to clear
                baseBackupFileInput.dispatchEvent(new Event('change'));
            }
            checkEnableButton();
        },
        onFileCleared() {
            selectedBaseFile = null;
            startNumberInput.value = 1;
            startNumberInput.min = 1;
            statusEl.classList.add('hidden');
            checkEnableButton();
        }
    });

    setupFileInput({
        inputEl: zipFileInput,
        fileNameEl: zipFileNameEl,
        clearBtnEl: clearZipFileBtn,
        onFileSelected(files) {
            selectedZipFile = files[0];
            statusEl.classList.add('hidden');
            checkEnableButton();
        },
        onFileCleared() {
            selectedZipFile = null;
            statusEl.classList.add('hidden');
            checkEnableButton();
        }
    });

    augmentBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');

        if (!selectedBaseFile) {
            showAppToast('Please select a base backup file.', true);
            updateStatus(statusEl, 'Error: Base backup file is required.', 'error');
            baseBackupFileInput.focus();
            return;
        }
        if (!selectedZipFile) {
            showAppToast('Please select a ZIP file.', true);
            updateStatus(statusEl, 'Error: ZIP file is required.', 'error');
            zipFileInput.focus();
            return;
        }

        toggleAppSpinner(true);

        const prefix = prefixInput.value.trim();
        const preserveTitles = preserveTxtTitlesCheckbox.checked;
        const startNumber = parseInt(startNumberInput.value, 10);

        try {
            const baseFileText = await selectedBaseFile.text();
            let backupData;
            try {
                backupData = JSON.parse(baseFileText);
            } catch (jsonErr) {
                throw new Error('Base backup file is not valid JSON.');
            }

            if (!backupData.revisions?.[0]?.scenes || !backupData.revisions?.[0]?.sections) {
                throw new Error('Base backup file has an invalid or incomplete structure.');
            }
            const currentRevision = backupData.revisions[0];
            
            let maxExistingRank = 0;
            currentRevision.scenes.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            currentRevision.sections.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });

            if (isNaN(startNumber) || startNumber < maxExistingRank + 1) {
                throw new Error(`Start Number must be ${maxExistingRank + 1} or greater to avoid chapter conflicts.`);
            }

            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(selectedZipFile);
            const chapterFilePromises = [];
            zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && zipEntry.name.toLowerCase().endsWith('.txt')) {
                    chapterFilePromises.push(
                        zipEntry.async('string').then((text) => ({ name: zipEntry.name, text }))
                    );
                }
            });
            const chapterFiles = await Promise.all(chapterFilePromises);
            chapterFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (chapterFiles.length === 0) {
                showAppToast('No .txt files found in the ZIP archive. No changes made.', false);
                updateStatus(statusEl, 'Info: No .txt files found in ZIP. Backup not augmented.', 'info');
                toggleAppSpinner(false);
                return;
            }

            chapterFiles.forEach((chapterFile, index) => {
                const newRank = startNumber + index;
                const sceneCode = `scene${newRank}`;
                const sectionCode = `section${newRank}`;
                const txtFilename = chapterFile.name.replace(/\.txt$/i, '');
                let chapterTitle;

                if (preserveTitles) {
                    chapterTitle = (prefix && !txtFilename.toLowerCase().startsWith(prefix.toLowerCase()))
                        ? `${prefix}${txtFilename}`
                        : txtFilename;
                } else {
                    chapterTitle = prefix ? `${prefix}${newRank}` : `Chapter ${newRank}`;
                }
                
                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));

                currentRevision.scenes.push({
                    code: sceneCode, title: chapterTitle, text: sceneText,
                    ranking: newRank, status: '1'
                });
                currentRevision.sections.push({
                    code: sectionCode, title: chapterTitle, synopsis: '',
                    ranking: newRank, section_scenes: [{ code: sceneCode, ranking: 1 }]
                });
            });

            const now = Date.now();
            backupData.last_update_date = now;
            backupData.last_backup_date = now;
            currentRevision.date = now;

            const totalWordCount = calculateWordCount(currentRevision.scenes);

            if (!currentRevision.book_progresses) currentRevision.book_progresses = [];
            const today = new Date();
            const lastProgress = currentRevision.book_progresses[currentRevision.book_progresses.length - 1];

            if (lastProgress && lastProgress.year === today.getFullYear() && lastProgress.month === today.getMonth() + 1 && lastProgress.day === today.getDate()) {
                lastProgress.word_count = totalWordCount;
            } else {
                 currentRevision.book_progresses.push({
                    year: today.getFullYear(),
                    month: today.getMonth() + 1,
                    day: today.getDate(),
                    word_count: totalWordCount
                });
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = backupData.title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'augmented_backup'}.json`;

            await triggerDownload(blob, filename, 'application/json', showAppToast);

            updateStatus(statusEl, `Backup augmented with ${chapterFiles.length} chapter(s). Download started.`, 'success');
            showAppToast(`Backup augmented successfully with ${chapterFiles.length} chapters.`);

        } catch (err) {
            console.error("Augment Backup with ZIP Error:", err);
            updateStatus(statusEl, `Error: ${err.message || 'Could not augment backup.'}`, 'error');
            showAppToast(`Error: ${err.message || 'Could not augment backup.'}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
