import React, { useState, useRef, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload } from '../utils/helpers';
import { calculateWordCount } from '../utils/backupHelpers';
import { Status, BackupData, BackupScene, BackupSection } from '../utils/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { cn } from '../utils/cn';
import {
    ArrowUp, ArrowDown, GripVertical, Merge, FileText, Image as ImageIcon,
    Check
} from 'lucide-react';

export const MergeBackup: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    type BackupFileItem = { id: string; file: File; title: string; cover: string | null; data: BackupData; };
    const [files, setFiles] = useState<BackupFileItem[]>([]);
    const [mergedTitle, setMergedTitle] = useState('');
    const [mergedDesc, setMergedDesc] = useState('');
    const [chapterPrefix, setChapterPrefix] = useState('');
    const [preserveTitles, setPreserveTitles] = useState(false);
    const [selectedCover, setSelectedCover] = useState<string | null>(null);
    const [status, setStatus] = useState<Status | null>(null);
    const draggedItemIndex = useRef<number | null>(null);
    const draggedOverItemIndex = useRef<number | null>(null);

    const handleFileSelected = async (fileList: FileList) => {
        showSpinner();
        setStatus(null);
        const filePromises = Array.from(fileList).map(async (file, index) => {
            try {
                const text = await file.text();
                const data = JSON.parse(text) as BackupData;
                if (!data.revisions || !data.title) throw new Error('Invalid backup file format.');
                return {
                    id: `backup-${Date.now()}-${index}`,
                    file: file,
                    title: data.title || file.name,
                    cover: data.cover || null,
                    data: data
                };
            } catch (e: any) {
                showToast(`Could not parse ${file.name}: ${e.message}`, true);
                return null;
            }
        });
        const loadedFiles = (await Promise.all(filePromises)).filter((f): f is BackupFileItem => f !== null);
        setFiles(loadedFiles);
        if (loadedFiles.length > 0) {
            const firstCover = loadedFiles.find(f => f.cover)?.cover || null;
            setSelectedCover(firstCover);
            // Auto-fill title if empty
            if (!mergedTitle && loadedFiles[0].title) {
                setMergedTitle(`${loadedFiles[0].title} (Merged)`);
            }
        }
        hideSpinner();
    };

    const handleMerge = async () => {
        setStatus(null);
        if (files.length === 0) return showToast('Select at least one backup file to merge.', true);
        if (!mergedTitle) return showToast('Merged Project Title is required.', true);

        showSpinner();
        try {
            let combinedScenes: BackupScene[] = [];
            let combinedSections: BackupSection[] = [];
            const allStatuses = new Map<string, any>();

            files.forEach(fileItem => {
                const rev = fileItem.data.revisions?.[0];
                if (rev) {
                    if (rev.scenes) {
                        if (preserveTitles) rev.scenes.forEach(s => s.originalTitle = s.title);
                        combinedScenes.push(...rev.scenes);
                    }
                    if (rev.sections) {
                        if (preserveTitles) rev.sections.forEach(s => s.originalTitle = s.title);
                        combinedSections.push(...rev.sections);
                    }
                    if (rev.statuses) rev.statuses.forEach(status => !allStatuses.has(status.code) && allStatuses.set(status.code, status));
                }
            });

            const finalStatuses = Array.from(allStatuses.values()).sort((a, b) => (a.ranking || Infinity) - (b.ranking || Infinity)).map((s, i) => ({ ...s, ranking: i + 1 }));
            if (finalStatuses.length === 0) finalStatuses.push({ code: '1', title: 'Todo', color: -2697255, ranking: 1 });

            combinedScenes.forEach((s, i) => {
                const n = i + 1;
                s.code = `scene${n}`;
                s.title = (preserveTitles && s.originalTitle) ? (chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle) : (chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`);
                s.ranking = n;
                delete s.originalTitle;
            });
            combinedSections.forEach((s, i) => {
                const n = i + 1;
                s.code = `section${n}`;
                s.title = (preserveTitles && s.originalTitle) ? (chapterPrefix ? `${chapterPrefix}${s.originalTitle}` : s.originalTitle) : (chapterPrefix ? `${chapterPrefix}${n}` : `Chapter ${n}`);
                s.ranking = n;
                delete s.originalTitle;
                s.section_scenes = [{ code: `scene${n}`, ranking: 1 }];
            });

            const now = Date.now();
            const mergedData: BackupData = {
                version: 4,
                code: Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0'),
                title: mergedTitle,
                description: mergedDesc,
                cover: selectedCover,
                show_table_of_contents: true,
                apply_automatic_indentation: false,
                last_update_date: now,
                last_backup_date: now,
                revisions: [{
                    number: 1, date: now,
                    book_progresses: [{ year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate(), word_count: calculateWordCount(combinedScenes) }],
                    statuses: finalStatuses,
                    scenes: combinedScenes,
                    sections: combinedSections
                }]
            };

            const blob = new Blob([JSON.stringify(mergedData, null, 2)], { type: 'application/json' });
            const filenameBase = mergedTitle.replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_') || 'merged_backup';
            triggerDownload(blob, `${filenameBase}.json`);
            setStatus({ message: `Backup files merged into "${mergedTitle}". Download started.`, type: 'success' });
        } catch (e: any) {
            setStatus({ message: `Error: ${e.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    const handleDragSort = () => {
        if (draggedItemIndex.current === null || draggedOverItemIndex.current === null) return;
        const items = [...files];
        const draggedItemContent = items.splice(draggedItemIndex.current, 1)[0];
        items.splice(draggedOverItemIndex.current, 0, draggedItemContent);
        draggedItemIndex.current = null;
        draggedOverItemIndex.current = null;
        setFiles(items);
    };

    const handleMove = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === files.length - 1)) {
            return;
        }
        const newFiles = [...files];
        const item = newFiles.splice(index, 1)[0];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        newFiles.splice(newIndex, 0, item);
        setFiles(newFiles);
    };

    const covers = useMemo(() => files.map(f => f.cover).filter((c): c is string => c !== null), [files]);

    return (
        <div id="mergeBackupApp" className="max-w-4xl mx-auto space-y-6 animate-fade-in p-4 md:p-8">
            <PageHeader
                title="Merge Backup Files"
                description="Combine multiple novel backup files into a single project."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Source Backups</CardTitle>
                    <CardDescription>Upload .json, .txt, or .nov files to merge.</CardDescription>
                </CardHeader>
                <CardContent>
                    <FileInput inputId="mergeBackupFiles" label="Upload Backup Files" accept=".json,.txt,.nov" multiple onFileSelected={handleFileSelected} onFileCleared={() => setFiles([])} />
                </CardContent>
            </Card>

            {files.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-6">
                        <Card className="h-full flex flex-col">
                            <CardHeader>
                                <CardTitle>Merge Order</CardTitle>
                                <CardDescription>Drag or use arrows to rearrange.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                <ul className="list-none space-y-2 max-h-[400px] overflow-y-auto pr-1">
                                    {files.map((file, index) => (
                                        <li
                                            key={file.id}
                                            draggable
                                            onDragStart={() => (draggedItemIndex.current = index)}
                                            onDragEnter={() => (draggedOverItemIndex.current = index)}
                                            onDragEnd={handleDragSort}
                                            onDragOver={e => e.preventDefault()}
                                            className="flex items-center gap-3 p-3 bg-muted/40 border rounded-lg hover:border-primary/50 transition-colors group"
                                        >
                                            <div className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                                                <GripVertical className="h-5 w-5" />
                                            </div>
                                            <div className="flex-grow min-w-0">
                                                <div className="font-medium text-sm truncate">{file.title}</div>
                                                <div className="text-xs text-muted-foreground truncate">{file.file.name}</div>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMove(index, 'up')} disabled={index === 0}>
                                                    <ArrowUp className="h-3 w-3" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMove(index, 'down')} disabled={index === files.length - 1}>
                                                    <ArrowDown className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Merged Project Info</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="mergeProjectTitle">Project Title</Label>
                                    <Input
                                        id="mergeProjectTitle"
                                        value={mergedTitle}
                                        onChange={e => setMergedTitle(e.target.value)}
                                        placeholder="e.g. My Anthology"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mergeDescription">Description</Label>
                                    <textarea
                                        id="mergeDescription"
                                        value={mergedDesc}
                                        onChange={e => setMergedDesc(e.target.value)}
                                        placeholder="Enter description..."
                                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Configuration</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="mergePrefix">Chapter Prefix (Optional)</Label>
                                    <Input
                                        id="mergePrefix"
                                        value={chapterPrefix}
                                        onChange={e => setChapterPrefix(e.target.value)}
                                        placeholder="e.g., Part I - "
                                    />
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-lg bg-muted/20">
                                    <input
                                        type="checkbox"
                                        id="mergePreserveTitles"
                                        checked={preserveTitles}
                                        onChange={e => setPreserveTitles(e.target.checked)}
                                        className="rounded border-input text-primary focus:ring-primary"
                                    />
                                    <Label htmlFor="mergePreserveTitles" className="font-normal cursor-pointer select-none">
                                        Preserve Original Chapter Titles
                                    </Label>
                                </div>
                            </CardContent>
                        </Card>

                        {covers.length > 0 && (
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <ImageIcon className="h-4 w-4" /> Cover Image
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-4 gap-2">
                                        <div
                                            onClick={() => setSelectedCover(null)}
                                            className={cn(
                                                "aspect-[2/3] rounded-md border-2 flex items-center justify-center text-xs text-center cursor-pointer p-1 transition-all",
                                                !selectedCover ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-muted text-muted-foreground hover:bg-muted/80"
                                            )}
                                        >
                                            No Cover
                                        </div>
                                        {covers.map((cover, i) => (
                                            <div
                                                key={i}
                                                onClick={() => setSelectedCover(cover)}
                                                className={cn(
                                                    "aspect-[2/3] rounded-md border-2 bg-cover bg-center cursor-pointer transition-all",
                                                    selectedCover === cover ? "border-primary ring-2 ring-primary/20" : "border-transparent opacity-70 hover:opacity-100"
                                                )}
                                                style={{ backgroundImage: `url(data:image/jpeg;base64,${cover})` }}
                                            />
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            )}

            <div className="flex justify-center pt-6">
                <Button
                    onClick={handleMerge}
                    disabled={files.length === 0}
                    size="lg"
                    className="w-full md:w-auto min-w-[200px]"
                >
                    <Merge className="mr-2 h-4 w-4" />
                    Merge and Download
                </Button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};