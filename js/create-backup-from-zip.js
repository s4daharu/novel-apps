/**
 * Browser-compatible Create Backup from ZIP functionality
 */

import { triggerDownload } from './browser-helpers.js';

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
    const tooltipTrigger = document.querySelector('#createBackupFromZipApp .tooltip-trigger');

    if (!zipFileInput || !zipFileNameEl || !clearZipFileBtn || !projectTitleInput || !descriptionInput || !uniqueCodeInput ||
        !chapterPatternInput || !startNumberInput || !extraChaptersInput || !createBtn || !statusMessageEl || !tooltipTrigger) {
        console.error("Create Backup from ZIP: One or more UI elements not found. Initialization failed.");
        return;
    }

    tooltipTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        tooltipTrigger.classList.toggle('active');
    });
    document.addEventListener('click', (e) => {
        if (tooltipTrigger.classList.contains('active') && !tooltipTrigger.contains(e.target)) {
            tooltipTrigger.classList.remove('active');
        }
    });

    zipFileInput.addEventListener('change', () => {
        createBtn.disabled = !(zipFileInput.files && zipFileInput.files.length > 0);
        if(statusMessageEl) statusMessageEl.classList.add('hidden');
        if (zipFileInput.files && zipFileInput.files.length > 0) {
            zipFileNameEl.textContent = `Selected: ${zipFileInput.files[0].name}`;
            if(clearZipFileBtn) clearZipFileBtn.classList.remove('hidden');
        } else {
            zipFileNameEl.textContent = '';
            if(clearZipFileBtn) clearZipFileBtn.classList.add('hidden');
        }
    });

    clearZipFileBtn.addEventListener('click', () => {
        zipFileInput.value = '';
        zipFileNameEl.textContent = '';
        clearZipFileBtn.classList.add('hidden');
        createBtn.disabled = true;
        if(statusMessageEl) statusMessageEl.classList.add('hidden');
    });

    createBtn.addEventListener('click', async () => {
        if(statusMessageEl) statusMessageEl.classList.add('hidden');

        if (!zipFileInput.files || zipFileInput.files.length === 0) {
            showAppToast('Please upload a ZIP file.', true);
            if(statusMessageEl) {
                statusMessageEl.textContent = 'Error: Please upload a ZIP file.';
                statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusMessageEl.classList.remove('hidden');
            }
            zipFileInput.focus();
            return;
        }

        const projectTitle = projectTitleInput.value.trim();
        if (!projectTitle) {
            showAppToast('Project Title is required.', true);
            if(statusMessageEl) {
                statusMessageEl.textContent = 'Error: Project Title is required.';
                statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusMessageEl.classList.remove('hidden');
            }
            projectTitleInput.focus();
            return;
        }

        const effectiveStartNumber = parseInt(startNumberInput.value, 10);
        if (isNaN(effectiveStartNumber) || effectiveStartNumber < 1) {
            showAppToast('Start Number must be 1 or greater.', true);
             if(statusMessageEl) {
                statusMessageEl.textContent = 'Error: Start Number must be 1 or greater.';
                statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusMessageEl.classList.remove('hidden');
            }
            startNumberInput.focus();
            return;
        }

        const numExtraChapters = parseInt(extraChaptersInput.value, 10);
        if (isNaN(numExtraChapters) || numExtraChapters < 0) {
            showAppToast('Extra Empty Chapters must be 0 or greater.', true);
            if(statusMessageEl) {
                statusMessageEl.textContent = 'Error: Extra Chapters must be 0 or greater.';
                statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusMessageEl.classList.remove('hidden');
            }
            extraChaptersInput.focus();
            return;
        }

        toggleAppSpinner(true);
        const file = zipFileInput.files[0];
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
                let chapterTitle;

                if (chapterPatternValue) {
                    chapterTitle = `${chapterPatternValue}${currentRank}`;
                } else {
                    chapterTitle = chapterFile.name.replace(/\.txt$/i, '');
                }

                const rawChapterText = chapterFile.text;
                const normalizedText = rawChapterText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                const contentSegments = normalizedText.split(/\n{2,}/)
                                                .map(s => s.trim())
                                                .filter(s => s !== '');
                const blocks = [];
                for (let i = 0; i < contentSegments.length; i++) {
                    blocks.push({ type: 'text', align: 'left', text: contentSegments[i] });
                    if (i < contentSegments.length - 1 || contentSegments.length === 0) {
                       blocks.push({ type: 'text', align: 'left' });
                    }
                }
                 if (contentSegments.length === 0) {
                    if (rawChapterText.trim() === '' && rawChapterText.length > 0) {
                        blocks.push({ type: 'text', align: 'left' });
                    } else if (rawChapterText.trim() === '') {
                        blocks.push({ type: 'text', align: 'left', text: '' });
                    }
                }
                if (blocks.length === 0) {
                    blocks.push({ type: 'text', align: 'left', text: '' });
                }
                const sceneText = JSON.stringify({ blocks });

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
                    let chapterTitle;

                    if (chapterPatternValue) {
                        chapterTitle = `${chapterPatternValue}${currentRank}`;
                    } else {
                        chapterTitle = `Chapter ${currentRank}`;
                    }

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
                 if(statusMessageEl) {
                    statusMessageEl.textContent = 'Error: No chapters to include in backup.';
                    statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                    statusMessageEl.classList.remove('hidden');
                 }
                 toggleAppSpinner(false);
                 return;
            }

            const uniqueCode = uniqueCodeProvided || Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
            const now = Date.now();
            let totalWordCount = 0;
            scenes.forEach(scene => {
                try {
                    const sceneContent = JSON.parse(scene.text);
                    sceneContent.blocks.forEach(block => {
                        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                            totalWordCount += block.text.trim().split(/\s+/).length;
                        }
                    });
                } catch (e) { console.warn("Word count parse error:", e); }
            });

            const backupData = {
                version: 4, code: uniqueCode, title: projectTitle, description: description,
                show_table_of_contents: true,
                apply_automatic_indentation: false,
                last_update_date: now, last_backup_date: now,
                revisions: [{
                    number: 1, date: now,
                    book_progresses: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate(), word_count: totalWordCount }],
                    statuses: [{ code: '1', title: 'Todo', color: -2697255, ranking: 1 }],
                    scenes, sections
                }]
            };

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = projectTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'backup_from_zip'}.json`;

            await triggerDownload(blob, filename, 'application/json', showAppToast);

            if (statusMessageEl) {
                statusMessageEl.textContent = `Backup file created with ${scenes.length} chapter(s). Download started.`;
                statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-green-50 dark:bg-green-600/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400';
                statusMessageEl.classList.remove('hidden');
            }
            showAppToast(`Backup file created with ${scenes.length} chapter(s).`);

        } catch (err) {
            console.error("Create Backup from ZIP Error:", err);
            if (statusMessageEl) {
                statusMessageEl.textContent = `Error: ${err.message}`;
                statusMessageEl.className = 'rounded-xl p-4 mt-5 text-center text-sm bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400';
                statusMessageEl.classList.remove('hidden');
            }
            showAppToast(`Error: ${err.message}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}