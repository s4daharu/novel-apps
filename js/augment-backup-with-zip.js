/**
 * Browser-compatible Augment Backup with ZIP functionality
 */

import { triggerDownload } from './browser-helpers.js';

export function initializeAugmentBackupWithZip(showAppToast, toggleAppSpinner) {
    const baseBackupFileInput = document.getElementById('augmentBaseBackupFile');
    const baseBackupFileNameEl = document.getElementById('augmentBaseBackupFileName');
    const clearBaseBackupFileBtn = document.getElementById('clearAugmentBaseBackupFile');

    const zipFileInput = document.getElementById('augmentZipFile');
    const zipFileNameEl = document.getElementById('augmentZipFileName');
    const clearZipFileBtn = document.getElementById('clearAugmentZipFile');

    const prefixInput = document.getElementById('augmentPrefix');
    const preserveTxtTitlesCheckbox = document.getElementById('augmentPreserveTxtTitles');
    const augmentBtn = document.getElementById('augmentBackupBtn');
    const statusEl = document.getElementById('statusAugmentBackup');

    let selectedBaseFile = null;
    let selectedZipFile = null;

    if (!baseBackupFileInput || !baseBackupFileNameEl || !clearBaseBackupFileBtn ||
        !zipFileInput || !zipFileNameEl || !clearZipFileBtn ||
        !prefixInput || !preserveTxtTitlesCheckbox || !augmentBtn || !statusEl) {
        console.error("Augment Backup with ZIP: One or more UI elements not found. Initialization failed.");
        return;
    }

    function checkEnableButton() {
        augmentBtn.disabled = !(selectedBaseFile && selectedZipFile);
    }

    baseBackupFileInput.addEventListener('change', (e) => {
        selectedBaseFile = e.target.files?.[0] || null;
        if (selectedBaseFile) {
            baseBackupFileNameEl.textContent = `Selected: ${selectedBaseFile.name}`;
            clearBaseBackupFileBtn.style.display = 'inline-block';
        } else {
            baseBackupFileNameEl.textContent = '';
            clearBaseBackupFileBtn.style.display = 'none';
        }
        statusEl.style.display = 'none';
        checkEnableButton();
    });

    clearBaseBackupFileBtn.addEventListener('click', () => {
        baseBackupFileInput.value = '';
        selectedBaseFile = null;
        baseBackupFileNameEl.textContent = '';
        clearBaseBackupFileBtn.style.display = 'none';
        statusEl.style.display = 'none';
        checkEnableButton();
    });

    zipFileInput.addEventListener('change', (e) => {
        selectedZipFile = e.target.files?.[0] || null;
        if (selectedZipFile) {
            zipFileNameEl.textContent = `Selected: ${selectedZipFile.name}`;
            clearZipFileBtn.style.display = 'inline-block';
        } else {
            zipFileNameEl.textContent = '';
            clearZipFileBtn.style.display = 'none';
        }
        statusEl.style.display = 'none';
        checkEnableButton();
    });

    clearZipFileBtn.addEventListener('click', () => {
        zipFileInput.value = '';
        selectedZipFile = null;
        zipFileNameEl.textContent = '';
        clearZipFileBtn.style.display = 'none';
        statusEl.style.display = 'none';
        checkEnableButton();
    });

    augmentBtn.addEventListener('click', async () => {
        statusEl.style.display = 'none';

        if (!selectedBaseFile) {
            showAppToast('Please select a base backup file.', true);
            statusEl.textContent = 'Error: Base backup file is required.';
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
            baseBackupFileInput.focus();
            return;
        }
        if (!selectedZipFile) {
            showAppToast('Please select a ZIP file.', true);
            statusEl.textContent = 'Error: ZIP file is required.';
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
            zipFileInput.focus();
            return;
        }

        toggleAppSpinner(true);

        const prefix = prefixInput.value.trim();
        const preserveTitles = preserveTxtTitlesCheckbox.checked;

        try {
            const baseFileText = await selectedBaseFile.text();
            let backupData;
            try {
                backupData = JSON.parse(baseFileText);
            } catch (jsonErr) {
                throw new Error('Base backup file is not valid JSON.');
            }

            if (!backupData.revisions || backupData.revisions.length === 0 ||
                !backupData.revisions[0].scenes || !backupData.revisions[0].sections) {
                throw new Error('Base backup file has an invalid or incomplete structure.');
            }
            const currentRevision = backupData.revisions[0];

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
                statusEl.textContent = 'Info: No .txt files found in ZIP. Backup not augmented.';
                statusEl.className = 'status success';
                statusEl.style.display = 'block';
                toggleAppSpinner(false);
                return;
            }

            let maxExistingRank = 0;
            currentRevision.scenes.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            currentRevision.sections.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });

            let newChapterIndex = 0;

            for (const chapterFile of chapterFiles) {
                const newRank = maxExistingRank + 1 + newChapterIndex;
                const sceneCode = `scene${newRank}`;
                const sectionCode = `section${newRank}`;
                let chapterTitle;
                const txtFilename = chapterFile.name.replace(/\.txt$/i, '');

                if (preserveTitles) {
                    if (prefix) {
                        if (txtFilename.toLowerCase().startsWith(prefix.toLowerCase())) {
                            chapterTitle = txtFilename;
                        } else {
                            chapterTitle = `${prefix}${txtFilename}`;
                        }
                    } else {
                        chapterTitle = txtFilename;
                    }
                } else {
                    chapterTitle = prefix ? `${prefix}${newRank}` : `Chapter ${newRank}`;
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

                currentRevision.scenes.push({
                    code: sceneCode, title: chapterTitle, text: sceneText,
                    ranking: newRank, status: '1'
                });
                currentRevision.sections.push({
                    code: sectionCode, title: chapterTitle, synopsis: '',
                    ranking: newRank, section_scenes: [{ code: sceneCode, ranking: 1 }]
                });
                newChapterIndex++;
            }

            const now = Date.now();
            backupData.last_update_date = now;
            backupData.last_backup_date = now;
            currentRevision.date = now;

            let totalWordCount = 0;
            currentRevision.scenes.forEach(scene => {
                try {
                    const sceneContent = JSON.parse(scene.text);
                    sceneContent.blocks.forEach(block => {
                        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                            totalWordCount += block.text.trim().split(/\s+/).length;
                        }
                    });
                } catch (e) { console.warn("Word count parse error for scene:", scene.title, e); }
            });

            if (currentRevision.book_progresses && currentRevision.book_progresses.length > 0) {
                const lastProgress = currentRevision.book_progresses[currentRevision.book_progresses.length - 1];
                const today = new Date();
                if (lastProgress.year === today.getFullYear() && lastProgress.month === today.getMonth() + 1 && lastProgress.day === today.getDate()) {
                    lastProgress.word_count = totalWordCount;
                } else {
                     currentRevision.book_progresses.push({
                        year: today.getFullYear(),
                        month: today.getMonth() + 1,
                        day: today.getDate(),
                        word_count: totalWordCount
                    });
                }
            } else {
                if (!currentRevision.book_progresses) currentRevision.book_progresses = [];
                currentRevision.book_progresses.push({
                    year: new Date().getFullYear(),
                    month: new Date().getMonth() + 1,
                    day: new Date().getDate(),
                    word_count: totalWordCount
                });
            }

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = backupData.title.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'augmented_backup'}.json`;

            await triggerDownload(blob, filename, 'application/json', showAppToast);

            statusEl.textContent = `Backup augmented with ${chapterFiles.length} chapter(s) from ZIP. Download started.`;
            statusEl.className = 'status success';
            statusEl.style.display = 'block';
            showAppToast(`Backup augmented successfully with ${chapterFiles.length} chapters.`);

        } catch (err) {
            console.error("Augment Backup with ZIP Error:", err);
            statusEl.textContent = `Error: ${err.message || 'Could not augment backup.'}`;
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
            showAppToast(`Error: ${err.message || 'Could not augment backup.'}`, true);
        } finally {
            toggleAppSpinner(false);
        }
    });
}
