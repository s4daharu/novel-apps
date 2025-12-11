import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip } from '../utils/helpers';
import { calculateWordCount, parseTextToBlocks } from '../utils/backupHelpers';
import { Status, BackupData } from '../utils/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { PlusCircle, FilePlus, Download } from 'lucide-react';

export const AugmentBackupWithZip: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [baseFile, setBaseFile] = useState<File | null>(null);
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [prefix, setPrefix] = useState('');
    const [startNumber, setStartNumber] = useState(1);
    const [minStartNumber, setMinStartNumber] = useState(1);
    const [preserveTitles, setPreserveTitles] = useState(false);
    const [status, setStatus] = useState<Status | null>(null);

    const handleBaseFileSelected = async (files: FileList) => {
        const file = files[0];
        setBaseFile(file);
        setStatus(null);
        if (!file) {
            setStartNumber(1);
            setMinStartNumber(1);
            return;
        }

        showSpinner();
        try {
            const baseFileText = await file.text();
            const backupData: BackupData = JSON.parse(baseFileText);
            if (!backupData.revisions?.[0]?.scenes) {
                throw new Error('Invalid backup file structure.');
            }
            const currentRevision = backupData.revisions[0];
            let maxExistingRank = 0;
            currentRevision.scenes.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            currentRevision.sections.forEach(s => { if (s.ranking > maxExistingRank) maxExistingRank = s.ranking; });
            const nextAvailableRank = maxExistingRank + 1;
            setStartNumber(nextAvailableRank);
            setMinStartNumber(nextAvailableRank);
        } catch (err: any) {
            showToast(`Error reading base backup: ${err.message}`, true);
            // In a real app, we'd need a way to imperatively clear the FileInput component
        } finally {
            hideSpinner();
        }
    };

    const handleAugmentBackup = async () => {
        setStatus(null);
        if (!baseFile) {
            showToast('Please select a base backup file.', true);
            setStatus({ message: 'Error: Base backup file is required.', type: 'error' });
            return;
        }
        if (!zipFile) {
            showToast('Please select a ZIP file.', true);
            setStatus({ message: 'Error: ZIP file is required.', type: 'error' });
            return;
        }

        showSpinner();

        try {
            const baseFileText = await baseFile.text();
            let backupData: BackupData;
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

            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(zipFile);
            const chapterFilePromises = zip.file(/.txt$/i).map((file: any) =>
                file.async('string').then((text: string) => ({ name: file.name, text }))
            );

            const chapterFiles = (await Promise.all(chapterFilePromises))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (chapterFiles.length === 0) {
                showToast('No .txt files found in the ZIP archive. No changes made.', false);
                setStatus({ message: 'Info: No .txt files found in ZIP. Backup not augmented.', type: 'info' });
                hideSpinner();
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

            if (triggerDownload(blob, filename)) {
                setStatus({ message: `Backup augmented with ${chapterFiles.length} chapter(s). Download started.`, type: 'success' });
                showToast(`Backup augmented successfully with ${chapterFiles.length} chapters.`);
            } else {
                throw new Error("Failed to trigger download.");
            }

        } catch (err: any) {
            console.error("Augment Backup with ZIP Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    return (
        <div id="augmentBackupWithZipApp" className="max-w-4xl mx-auto space-y-6 animate-fade-in p-4 md:p-8">
            <PageHeader
                title="Augment Backup with ZIP"
                description="Seamlessly add new chapters from a ZIP archive to an existing backup file."
            />

            <Card>
                <CardHeader>
                    <CardTitle>File Selection</CardTitle>
                    <CardDescription>Upload your base backup and the ZIP file containing new chapters.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <FileInput
                                inputId="augmentBaseBackupFile"
                                label="Base Backup File (.json/.nov)"
                                accept=".json,.txt,.nov"
                                onFileSelected={handleBaseFileSelected}
                                onFileCleared={() => {
                                    setBaseFile(null);
                                    setStartNumber(1);
                                    setMinStartNumber(1);
                                }}
                            />
                        </div>
                        <div className="space-y-2">
                            <FileInput
                                inputId="augmentZipFile"
                                label="ZIP with .txt Chapters"
                                accept=".zip"
                                onFileSelected={(files) => setZipFile(files[0])}
                                onFileCleared={() => setZipFile(null)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <PlusCircle className="h-5 w-5 text-primary" />
                        Chapter Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="augmentPrefix">Prefix for New Chapters</Label>
                            <Input
                                id="augmentPrefix"
                                value={prefix}
                                onChange={e => setPrefix(e.target.value)}
                                placeholder="e.g., New Section - "
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="augmentStartNumber">Start Number</Label>
                            <Input
                                type="number"
                                id="augmentStartNumber"
                                value={startNumber}
                                onChange={e => setStartNumber(parseInt(e.target.value, 10))}
                                min={minStartNumber}
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/20">
                        <input
                            type="checkbox"
                            id="augmentPreserveTxtTitles"
                            checked={preserveTitles}
                            onChange={e => setPreserveTitles(e.target.checked)}
                            className="rounded border-input text-primary focus:ring-primary"
                        />
                        <Label htmlFor="augmentPreserveTxtTitles" className="font-normal cursor-pointer select-none">
                            Use original .txt filenames as chapter titles
                        </Label>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-center">
                <Button
                    onClick={handleAugmentBackup}
                    disabled={!baseFile || !zipFile}
                    size="lg"
                    className="w-full md:w-auto min-w-[200px]"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Augment and Download
                </Button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};