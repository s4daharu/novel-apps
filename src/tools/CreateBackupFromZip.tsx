import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip } from '../utils/helpers';
import { calculateWordCount, createNewBackupStructure, parseTextToBlocks } from '../utils/backupHelpers';
import { Status, BackupScene, BackupSection } from '../utils/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Save, FileArchive } from 'lucide-react';

export const CreateBackupFromZip: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [projectTitle, setProjectTitle] = useState('');
    const [description, setDescription] = useState('');
    const [uniqueCode, setUniqueCode] = useState('');
    const [chapterPattern, setChapterPattern] = useState('Chapter ');
    const [startNumber, setStartNumber] = useState(1);
    const [extraChapters, setExtraChapters] = useState(0);
    const [status, setStatus] = useState<Status | null>(null);

    const handleCreateBackup = async () => {
        if (!zipFile) {
            showToast('Please upload a ZIP file.', true);
            setStatus({ message: 'Error: Please upload a ZIP file.', type: 'error' });
            return;
        }
        if (!projectTitle) {
            showToast('Project Title is required.', true);
            setStatus({ message: 'Error: Project Title is required.', type: 'error' });
            return;
        }

        showSpinner();
        setStatus(null);

        try {
            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(zipFile);
            const scenes: BackupScene[] = [];
            const sections: BackupSection[] = [];
            let currentProcessingIndex = 0;

            const chapterFilePromises = zip.file(/.txt$/i).map((file: any) =>
                file.async('string').then((text: string) => ({ name: file.name, text }))
            );

            const chapterFiles = (await Promise.all(chapterFilePromises))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            for (const chapterFile of chapterFiles) {
                const currentRank = startNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const title = chapterPattern ? `${chapterPattern}${currentRank}` : chapterFile.name.replace(/\.txt$/i, '');
                const sceneText = JSON.stringify(parseTextToBlocks(chapterFile.text));
                scenes.push({ code: sceneCode, title, text: sceneText, ranking: currentRank, status: '1' });
                sections.push({ code: sectionCode, title, synopsis: '', ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
                currentProcessingIndex++;
            }

            for (let i = 0; i < extraChapters; i++) {
                const currentRank = startNumber + currentProcessingIndex;
                const sceneCode = `scene${currentRank}`;
                const sectionCode = `section${currentRank}`;
                const title = chapterPattern ? `${chapterPattern}${currentRank}` : `Chapter ${currentRank}`;
                const emptySceneContent = { blocks: [{ type: 'text', align: 'left', text: '' }] };
                scenes.push({ code: sceneCode, title, text: JSON.stringify(emptySceneContent), ranking: currentRank, status: '1' });
                sections.push({ code: sectionCode, title, synopsis: '', ranking: currentRank, section_scenes: [{ code: sceneCode, ranking: 1 }] });
                currentProcessingIndex++;
            }

            if (scenes.length === 0) {
                throw new Error('No .txt files found in ZIP and no extra chapters requested.');
            }

            const backupData = createNewBackupStructure(projectTitle, description, uniqueCode);
            backupData.revisions[0].scenes = scenes;
            backupData.revisions[0].sections = sections;
            backupData.revisions[0].book_progresses[0].word_count = calculateWordCount(scenes);

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const safeFileNameBase = projectTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_');
            const filename = `${safeFileNameBase || 'backup_from_zip'}.json`;

            if (triggerDownload(blob, filename)) {
                setStatus({ message: `Backup file created with ${scenes.length} chapter(s). Download started.`, type: 'success' });
                showToast(`Backup file created with ${scenes.length} chapter(s).`);
            } else {
                throw new Error("Failed to trigger download.");
            }

        } catch (err: any) {
            console.error("Create Backup from ZIP Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    return (
        <div id="createBackupFromZipApp" className="max-w-4xl mx-auto space-y-6 animate-fade-in p-4 md:p-8">
            <PageHeader
                title="Create Backup from ZIP"
                description="Initialize a new novel backup project from an existing ZIP archive of text chapters."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Source Files</CardTitle>
                </CardHeader>
                <CardContent>
                    <FileInput
                        inputId="zipBackupFile"
                        label="Upload ZIP File"
                        accept=".zip"
                        onFileSelected={(files) => setZipFile(files[0])}
                        onFileCleared={() => setZipFile(null)}
                    />
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Project Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="zipProjectTitle">Project Title</Label>
                            <Input
                                id="zipProjectTitle"
                                value={projectTitle}
                                onChange={e => setProjectTitle(e.target.value)}
                                placeholder="My Novel Project"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zipUniqueCode">Unique Code (Optional)</Label>
                            <Input
                                id="zipUniqueCode"
                                value={uniqueCode}
                                onChange={e => setUniqueCode(e.target.value)}
                                placeholder="Auto-generated if blank"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zipDescription">Description</Label>
                            <Input
                                id="zipDescription"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Short description of the novel"
                            />
                        </div>
                    </CardContent>
                </Card>

                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Structure</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="zipChapterPattern">Chapter Prefix Pattern</Label>
                            <Input
                                id="zipChapterPattern"
                                value={chapterPattern}
                                onChange={e => setChapterPattern(e.target.value)}
                                placeholder="e.g., Chapter"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zipStartNumber">Start Numbering At</Label>
                            <Input
                                type="number"
                                id="zipStartNumber"
                                value={startNumber}
                                onChange={e => setStartNumber(parseInt(e.target.value, 10))}
                                min="1"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="zipExtraChapters">Append Empty Chapters</Label>
                            <Input
                                type="number"
                                id="zipExtraChapters"
                                value={extraChapters}
                                onChange={e => setExtraChapters(parseInt(e.target.value, 10))}
                                min="0"
                            />
                            <p className="text-xs text-muted-foreground">Add placeholders for future writing.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-center pt-4">
                <Button
                    onClick={handleCreateBackup}
                    disabled={!zipFile || !projectTitle}
                    size="lg"
                    className="w-full md:w-auto min-w-[200px]"
                >
                    <Save className="mr-2 h-4 w-4" />
                    Create Backup
                </Button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};