/**
 * Browser-compatible Create Backup from ZIP functionality
 */

import { triggerDownload } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { parseTextToBlocks, calculateWordCount, createNewBackupStructure } from './backup-helpers.js';

export function initializeCreateBackupFromZip(showAppToast, toggleAppSpinner) {
    const zipFileInput = document.getElementById('zipBackupFile');
    const zipFileNameEl = document.getElementById('zipBackupFileName');
    const clearZipFileBtn = document.getElementById('clearZipBackupFile');
    const projectTitleInput = document.getElementById('zipProjectTitle');
    const descriptionInput = document.getElementById('zipDescription');
    const uniqueCodeInput = document.getElementById('zipUniqueCode');
    const chapterPatternInput = document.getElementById('zipChapterPattern');
    const startNumberInput = document.getElementById('zipStartNumber');
    const extraChaptersInput = document.getElementById('zipExtraChapters');
    const createBtn = document.getElementById('createFromZipBtn');
    const statusMessageEl = document.getElementById('statusMessageCreateBackupFromZip');

    if (!zipFileInput || !zipFileNameEl || !clearZipFileBtn || !projectTitleInput || !descriptionInput || !uniqueCodeInput ||
        !chapterPatternInput || !startNumberInput || !extraChaptersInput || !createBtn || !statusMessageEl) {
        console.error("Create Backup from ZIP: One or more UI elements not found. Initialization failed.");
        return;
    }

    setupFileInput({
        inputEl: zipFileInput,
        fileNameEl: zipFileNameEl,
        clearBtnEl: clearZipFileBtn,
        onFileSelected: () => statusMessageEl.classList.add('hidden'),
        onFileCleared: () => statusMessageEl.classList.add('hidden'),
        onButtonUpdate: (hasFile) => { createBtn.disabled = !hasFile; }
    });

    createBtn.addEventListener('click', async () => {
        statusMessageEl.classList.add('hidden');

        const file = zipFileInput.files?.[0];
        if (!file) {
            showAppToast('Please upload a ZIP file.', true);
            updateStatus(statusMessageEl, 'Error: Please upload a ZIP file.', 'error');
            zipFileInput.focus();
            return;
        }

        const projectTitle = projectTitleInput.value.trim();
        if (!projectTitle) {
            showAppToast('Project Title is required.', true);
            updateStatus(statusMessageEl, 'Error: Project Title is required.', 'error');
            projectTitleInput.focus();
            return;
        }

        const effectiveStartNumber = parseInt(startNumberInput.value, 10);
        if (isNaN(effectiveStartNumber) || effectiveStartNumber < 1) {
            showAppToast('Start Number must be 1 or greater.', true);
            updateStatus(statusMessageEl, 'Error: Start Number must be 1 or greater.', 'error');
            startNumberInput.focus();
            return;
        }

        const numExtraChapters = parseInt(extraChaptersInput.value, 10);
        if (isNaN(numExtraChapters) || numExtraChapters < 0) {
            showAppToast('Extra Empty Chapters must be 0 or greater.', true);
            updateStatus(statusMessageEl, 'Error: Extra Chapters must be 0 or greater.', 'error');
            extraChaptersInput.focus();
            return;
        }

        toggleAppSpinner(true);
        
        const description = descriptionInput.value.trim();
        const uniqueCodeProvided = uniqueCodeInput.value.trim();
        const chapterPatternValue = chapterPatternInput.value.trim();

        try {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(file);
            const scenes = [];
            const sections = [];
            let currentProcessingIndex = 0;

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

            for (const chapterFile of chapterFiles) {
                const currentRank = effectiveStartNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const chapterTitle = chapterPatternValue
                    ? `${chapterPatternValue}${currentRank}`
                    : chapterFile.name.replace(/\.txt$/i, '');
                
                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));

                scenes.push({
                    code: sceneCode, title: chapterTitle, text: sceneText,
                    ranking: currentRank, status: '1'
                });
                sections.push({
                    code: sectionCode, title: chapterTitle, synopsis: '',
                    ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }]
                });
                currentProcessingIndex++;
            }

            if (numExtraChapters > 0) {
                for (let i = 0; i < numExtraChapters; i++) {
                    const currentRank = effectiveStartNumber + currentProcessingIndex;
                    const sceneCode = `scene${currentRank}`;
                    const sectionCode = `section${currentRank}`;
                    const chapterTitle = chapterPatternValue ? `${chapterPatternValue}${currentRank}` : `Chapter ${currentRank}`;
                    const emptySceneContent = { blocks: [{ type: 'text', align: 'left', text: '' }] };

                    scenes.push({
                        code: sceneCode, title: chapterTitle,
                        text: JSON.stringify(emptySceneContent),
                        ranking: currentRank, status: '1'
                    });
                    sections.push({
                        code: sectionCode, title: chapterTitle, synopsis: '',
                        ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }]
                    });
                    currentProcessingIndex++;
                }
            }

            if (scenes.length === 0) {
                 showAppToast('No .txt files found in ZIP and no extra chapters requested. Backup not created.', true);
                 updateStatus(statusMessageEl, 'Error: No chapters to include in backup.', 'error');
                 toggleAppSpinner(false);
                 return;
            }

            const backupData = createNewBackupStructure(projectTitle, description, uniqueCodeProvided);
            backupData.revisions[0].scenes = scenes;
            backupData.revisions[0].sections = sections;
            backupData.revisions[0].book_progresses[0].word_count = calculateWordCount(scenes);

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = projectTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'backup_from_zip'}.json`;

            await triggerDownload(blob, filename, 'application/json', showAppToast);

            updateStatus(statusMessageEl, `Backup file created with ${scenes.length} chapter(s). Download started.`, 'success');
            showAppToast(`Backup file created with ${scenes.length} chapter(s).`);

        } catch (err) {
            console.error("Create Backup from ZIP Error:", err);
            updateStatus(statusMessageEl, `Error: ${err.message}`, 'error');
            showAppToast(`Error: ${err.message}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
