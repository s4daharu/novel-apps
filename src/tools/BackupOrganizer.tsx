import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { getJSZip, triggerDownload, pMap } from '../utils/helpers';
import { Status, BackupData, BackupOrganizerFileInfo } from '../utils/types';
import { calculateWordCount } from '../utils/backupHelpers';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Select } from '../components/ui/Select';
import { Label } from '../components/ui/Label';
import { Checkbox } from '../components/ui/Checkbox';
import {
    Search, Filter, ChevronDown, ChevronRight, Download, FileText,
    FolderOpen, X, Clock, HardDrive, Type, Archive, Info
} from 'lucide-react';
import { cn } from '../utils/cn';

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatDate = (date: Date) => {
    if (date.getTime() === 0) return 'No Date Found';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

const getSeriesNameFromTitle = (title: string): string => {
    if (!title) return 'Untitled Series';

    const chapterRangePattern = /(C|Ch|Chapter)?\s?\d+[-_]\d+/i;
    const simpleChapterPattern = /(C|Ch|Chapter)\s?\d+/i;

    let cleanedTitle = title
        .replace(new RegExp(`^${chapterRangePattern.source}[-_]?\\s*`), '')
        .replace(new RegExp(`\\s*[-_]?${chapterRangePattern.source}(\\s*_END)?$`), '')
        .replace(new RegExp(`\\s*${simpleChapterPattern.source}$`), '')
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleanedTitle) {
        return title;
    }

    return cleanedTitle;
};


const FilePanel = ({ title, files, selectedFiles, onSelection, onSeriesSelection, onPreview, onDownload, collapsedSeries, setCollapsedSeries, newestFileTimestamp, fileSort }: {
    title: string;
    files: BackupOrganizerFileInfo[];
    selectedFiles: Set<BackupOrganizerFileInfo>;
    onSelection: (file: BackupOrganizerFileInfo, isSelected: boolean) => void;
    onSeriesSelection: (files: BackupOrganizerFileInfo[], isSelected: boolean) => void;
    onPreview: (file: BackupOrganizerFileInfo) => void;
    onDownload: (file: BackupOrganizerFileInfo) => void;
    collapsedSeries: Set<string>;
    setCollapsedSeries: React.Dispatch<React.SetStateAction<Set<string>>>;
    newestFileTimestamp: number;
    fileSort: string;
}) => {
    const isCollapsed = collapsedSeries.has(title);
    const visibleFiles = files;
    const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every((f) => selectedFiles.has(f));
    const someVisibleSelected = visibleFiles.some((f) => selectedFiles.has(f));

    return (
        <Card className="overflow-hidden transition-all duration-200">
            <div
                onClick={() => setCollapsedSeries((p: Set<string>) => { const s = new Set(p); isCollapsed ? s.delete(title) : s.add(title); return s; })}
                className={cn(
                    "p-4 flex items-center gap-3 cursor-pointer select-none hover:bg-muted/50 transition-colors",
                    isCollapsed ? "bg-muted/30" : "bg-card border-b"
                )}
            >
                <div onClick={e => e.stopPropagation()}>
                    <Checkbox
                        checked={allVisibleSelected}
                        // Indeterminate state handling would go here if supported by component props directly or via ref
                        onCheckedChange={(checked) => onSeriesSelection(visibleFiles, checked === true)}
                    />
                </div>

                <h2 className="font-semibold text-lg flex-grow flex items-center gap-2">
                    {title}
                    <Badge variant="secondary" className="text-xs">{files.length}</Badge>
                </h2>
                {isCollapsed ? <ChevronRight className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
            </div>

            {!isCollapsed && (
                <div className="divide-y divide-border">
                    {files.map((file: BackupOrganizerFileInfo) => (
                        <div key={file.fullPath} className="flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors group">
                            <div className="mt-1">
                                <Checkbox
                                    checked={selectedFiles.has(file)}
                                    onCheckedChange={(checked) => onSelection(file, checked === true)}
                                />
                            </div>
                            <div className="flex-grow min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span onClick={() => onPreview(file)} className="break-words cursor-pointer hover:text-primary font-medium transition-colors" title={file.originalName}>
                                        {file.originalName}
                                    </span>
                                    {file.timestamp === newestFileTimestamp && file.fileType === 'nov' && (
                                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-5 bg-green-600 hover:bg-green-700">Latest</Badge>
                                    )}
                                </div>
                                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-1 gap-x-3 text-xs text-muted-foreground mt-1">
                                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDate(file.dateObject)}</span>
                                    <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {formatBytes(file.size)}</span>
                                    {file.wordCount != null && (
                                        <span className="flex items-center gap-1"><Type className="h-3 w-3" /> {file.wordCount.toLocaleString()} words</span>
                                    )}
                                    <span className="flex items-center gap-1 truncate max-w-[200px]" title={file.folderPath}><FolderOpen className="h-3 w-3" /> {file.folderPath}</span>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDownload(file)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                title={`Download ${file.originalName}`}
                            >
                                <Download className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

const FilterModal = ({ isOpen, onClose, allFolders, filters, setFilters }: {
    isOpen: boolean;
    onClose: () => void;
    allFolders: string[];
    filters: { folderFilter: string; fileSort: string; seriesSort: string; };
    setFilters: (key: string, value: string) => void;
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-2xl animate-scale-in">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle>Filters & Sort</CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-4">
                    {allFolders.length > 1 && (
                        <div className="space-y-2">
                            <Label htmlFor="modalFolderFilter">Filter by Folder</Label>
                            <Select
                                id="modalFolderFilter"
                                value={filters.folderFilter}
                                onChange={e => setFilters('folderFilter', e.target.value)}
                            >
                                <option value="all">All Folders</option>
                                {allFolders.map(f => <option key={f} value={f}>{f || '/'}</option>)}
                            </Select>
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="modalFileSort">Sort Files By</Label>
                        <Select
                            id="modalFileSort"
                            value={filters.fileSort}
                            onChange={e => setFilters('fileSort', e.target.value)}
                        >
                            <option value="date-desc">Date (Newest First)</option>
                            <option value="date-asc">Date (Oldest First)</option>
                            <option value="name-asc">Name (A-Z)</option>
                            <option value="name-desc">Name (Z-A)</option>
                            <option value="size-desc">Size (Largest First)</option>
                            <option value="size-asc">Size (Smallest First)</option>
                            <option value="word-count-desc">Word Count (Most First)</option>
                            <option value="word-count-asc">Word Count (Fewest First)</option>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="modalSeriesSort">Sort Series By</Label>
                        <Select
                            id="modalSeriesSort"
                            value={filters.seriesSort}
                            onChange={e => setFilters('seriesSort', e.target.value)}
                        >
                            <option value="name-asc">Series Name (A-Z)</option>
                            <option value="file-count-desc">File Count (Most First)</option>
                            <option value="updated-desc">Last Updated (Newest First)</option>
                        </Select>
                    </div>
                </CardContent>
                <CardFooter className="justify-end">
                    <Button onClick={onClose}>Done</Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export const BackupOrganizer: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();

    const [zipFile, setZipFile] = useState<File | null>(null);
    const [status, setStatus] = useState<Status | null>(null);

    const [processedSeries, setProcessedSeries] = useState<Record<string, BackupOrganizerFileInfo[]>>({});
    const [otherFiles, setOtherFiles] = useState<BackupOrganizerFileInfo[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<BackupOrganizerFileInfo>>(new Set());
    const [allFolders, setAllFolders] = useState<string[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [folderFilter, setFolderFilter] = useState('all');
    const [seriesSort, setSeriesSort] = useState('name-asc');
    const [fileSort, setFileSort] = useState('date-desc');
    const [isFilterModalOpen, setFilterModalOpen] = useState(false);

    const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set());
    const [modalContent, setModalContent] = useState<BackupOrganizerFileInfo | null>(null);
    const [preserveStructure, setPreserveStructure] = useState(false);

    const parseFileContent = useCallback(async (zipEntry: any): Promise<BackupOrganizerFileInfo> => {
        const fullPath = zipEntry.name;
        const originalName = fullPath.split('/').pop() || '';
        const folderPath = fullPath.substring(0, fullPath.lastIndexOf('/') + 1) || '/';

        const isNovTxt = originalName.toLowerCase().endsWith('.nov.txt');
        const fileExt = isNovTxt ? 'nov.txt' : (originalName.split('.').pop()?.toLowerCase() || '');
        const isNovelBackup = fileExt === 'nov' || fileExt === 'json' || isNovTxt;

        let determinedDate: Date | null = null;
        let jsonData: BackupData | undefined;
        let seriesName: string | undefined;
        let timestamp: number | undefined;
        let wordCount: number | undefined;

        if (isNovelBackup) {
            try {
                const content = await zipEntry.async('string');
                const data = JSON.parse(content) as BackupData;
                jsonData = data;

                if (data.title && typeof data.last_backup_date !== 'undefined' && data.revisions) {
                    timestamp = data.last_backup_date;
                    determinedDate = new Date(timestamp);
                    seriesName = getSeriesNameFromTitle(data.title);
                    wordCount = data.revisions?.[0]?.scenes ? calculateWordCount(data.revisions[0].scenes) : 0;
                }
            } catch {
                // Parsing failed
            }
        }

        if (!determinedDate) {
            const match = originalName.match(/(\d{14})/);
            if (match && match[1]) {
                const dtString = match[1];
                const year = parseInt(dtString.substring(0, 4), 10);
                const month = parseInt(dtString.substring(4, 6), 10) - 1;
                const day = parseInt(dtString.substring(6, 8), 10);
                const hour = parseInt(dtString.substring(8, 10), 10);
                const minute = parseInt(dtString.substring(10, 12), 10);
                const second = parseInt(dtString.substring(12, 14), 10);
                determinedDate = new Date(year, month, day, hour, minute, second);
            }
        }

        let finalDate: Date;
        if (determinedDate) {
            finalDate = determinedDate;
        } else if (zipEntry.date) {
            finalDate = zipEntry.date;
        } else {
            finalDate = new Date();
        }

        if (isNaN(finalDate.getTime())) {
            finalDate = new Date();
        }

        if (!seriesName) {
            seriesName = getSeriesNameFromTitle(originalName.replace(/\.[^/.]+$/, ""));
        }

        if (!timestamp) {
            timestamp = finalDate.getTime();
        }

        return {
            fullPath,
            originalName,
            folderPath,
            zipEntry,
            size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
            dateObject: finalDate,
            fileType: fileExt,
            seriesName,
            timestamp,
            jsonData,
            wordCount
        };
    }, []);

    const handleFileSelected = async (files: FileList) => {
        const file = files[0];
        setZipFile(file);
        setStatus(null);
        showSpinner();

        try {
            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(file);
            const entries: any[] = [];
            zip.forEach((relativePath: string, zipEntry: any) => {
                if (!zipEntry.dir) entries.push(zipEntry);
            });

            // Use pMap to limit concurrency to 5 files at a time to prevent memory issues
            const fileInfos = await pMap(entries, parseFileContent, 5);

            const folders = new Set<string>();
            const seriesMap: Record<string, BackupOrganizerFileInfo[]> = {};
            const others: BackupOrganizerFileInfo[] = [];

            fileInfos.forEach(info => {
                folders.add(info.folderPath);
                if (['nov', 'json', 'nov.txt', 'txt'].includes(info.fileType)) {
                    const sName = info.seriesName || 'Uncategorized';
                    if (!seriesMap[sName]) seriesMap[sName] = [];
                    seriesMap[sName].push(info);
                } else {
                    others.push(info);
                }
            });

            setAllFolders(Array.from(folders).sort());
            setProcessedSeries(seriesMap);
            setOtherFiles(others);
            setStatus({ message: `Loaded ${fileInfos.length} files from archive.`, type: 'success' });

        } catch (err: any) {
            setStatus({ message: `Error reading ZIP: ${err.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    const getFilteredFiles = useCallback((files: BackupOrganizerFileInfo[]) => {
        let result = files;
        if (folderFilter !== 'all') {
            result = result.filter(f => f.folderPath === folderFilter);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(f => f.originalName.toLowerCase().includes(q));
        }
        return result.sort((a, b) => {
            switch (fileSort) {
                case 'date-desc': return b.timestamp! - a.timestamp!;
                case 'date-asc': return a.timestamp! - b.timestamp!;
                case 'name-asc': return a.originalName.localeCompare(b.originalName);
                case 'name-desc': return b.originalName.localeCompare(a.originalName);
                case 'size-desc': return b.size - a.size;
                case 'size-asc': return a.size - b.size;
                case 'word-count-desc': return (b.wordCount || 0) - (a.wordCount || 0);
                case 'word-count-asc': return (a.wordCount || 0) - (b.wordCount || 0);
                default: return 0;
            }
        });
    }, [folderFilter, searchQuery, fileSort]);

    const sortedSeriesKeys = useMemo(() => {
        return Object.keys(processedSeries).sort((a, b) => {
            const filesA = processedSeries[a];
            const filesB = processedSeries[b];
            switch (seriesSort) {
                case 'name-asc': return a.localeCompare(b);
                case 'file-count-desc': return filesB.length - filesA.length;
                case 'updated-desc':
                    const maxA = Math.max(...filesA.map(f => f.timestamp || 0));
                    const maxB = Math.max(...filesB.map(f => f.timestamp || 0));
                    return maxB - maxA;
                default: return 0;
            }
        });
    }, [processedSeries, seriesSort]);

    const handleSelection = (file: BackupOrganizerFileInfo, isSelected: boolean) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            if (isSelected) next.add(file); else next.delete(file);
            return next;
        });
    };

    const handleSeriesSelection = (files: BackupOrganizerFileInfo[], isSelected: boolean) => {
        setSelectedFiles(prev => {
            const next = new Set(prev);
            files.forEach(f => { if (isSelected) next.add(f); else next.delete(f); });
            return next;
        });
    };

    const handleDownload = async (file: BackupOrganizerFileInfo) => {
        if (!file.zipEntry) return;
        const blob = await file.zipEntry.async('blob');
        triggerDownload(blob, file.originalName);
    };

    const handleDownloadSelected = async () => {
        if (selectedFiles.size === 0) return;
        showSpinner();
        try {
            const JSZip = await getJSZip();
            const newZip = new JSZip();

            const processFile = async (file: BackupOrganizerFileInfo) => {
                const content = await file.zipEntry.async('blob');
                const path = preserveStructure ? file.fullPath : file.originalName;
                newZip.file(path, content);
            };

            await Promise.all(Array.from(selectedFiles).map(processFile));

            const blob = await newZip.generateAsync({ type: 'blob' });
            triggerDownload(blob, 'organized_backup.zip');
            showToast(`Downloaded ${selectedFiles.size} files.`);
        } catch (e: any) {
            showToast(`Error creating zip: ${e.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 min-h-screen animate-fade-in space-y-6">
            <PageHeader
                title="Backup Organizer"
                description="Organize, filter, and extract novel backups from large ZIP archives."
            />

            {!zipFile ? (
                <Card className="max-w-2xl mx-auto">
                    <CardHeader>
                        <CardTitle className="text-center">Upload Archive</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="text-center text-muted-foreground p-4">
                            <Archive className="w-16 h-16 mx-auto mb-4 opacity-20" />
                            <p>Upload a large ZIP archive containing multiple novel backups (e.g. from WebDav). We'll group them by series and help you find the latest versions.</p>
                        </div>
                        <FileInput inputId="organizerZip" label="Select ZIP File" accept=".zip" onFileSelected={handleFileSelected} />
                    </CardContent>
                </Card>
            ) : (
                <>
                    <div className="sticky top-4 z-20 flex flex-col md:flex-row gap-3 p-4 bg-background/80 backdrop-blur-lg border rounded-xl shadow-lg transition-all">
                        <div className="flex-grow relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9 bg-background/50"
                            />
                        </div>
                        <Button variant="outline" onClick={() => setFilterModalOpen(true)} className="gap-2 shrink-0">
                            <Filter className="h-4 w-4" /> Filters
                        </Button>
                        {selectedFiles.size > 0 && (
                            <Button onClick={handleDownloadSelected} className="gap-2 shrink-0 animate-in fade-in zoom-in">
                                <Download className="h-4 w-4" /> Download ({selectedFiles.size})
                            </Button>
                        )}
                    </div>

                    <div className="space-y-4">
                        {sortedSeriesKeys.map(seriesName => {
                            const files = getFilteredFiles(processedSeries[seriesName]);
                            if (files.length === 0) return null;
                            const timestamps = files.map(f => f.timestamp || 0);
                            const maxTs = Math.max(...timestamps);

                            return (
                                <FilePanel
                                    key={seriesName}
                                    title={seriesName}
                                    files={files}
                                    selectedFiles={selectedFiles}
                                    onSelection={handleSelection}
                                    onSeriesSelection={handleSeriesSelection}
                                    onPreview={file => setModalContent(file)}
                                    onDownload={handleDownload}
                                    collapsedSeries={collapsedSeries}
                                    setCollapsedSeries={setCollapsedSeries}
                                    newestFileTimestamp={maxTs}
                                    fileSort={fileSort}
                                />
                            );
                        })}

                        {getFilteredFiles(otherFiles).length > 0 && (
                            <FilePanel
                                title="Other Files"
                                files={getFilteredFiles(otherFiles)}
                                selectedFiles={selectedFiles}
                                onSelection={handleSelection}
                                onSeriesSelection={handleSeriesSelection}
                                onPreview={file => setModalContent(file)}
                                onDownload={handleDownload}
                                collapsedSeries={collapsedSeries}
                                setCollapsedSeries={setCollapsedSeries}
                                newestFileTimestamp={0}
                                fileSort={fileSort}
                            />
                        )}
                    </div>
                </>
            )}

            <FilterModal isOpen={isFilterModalOpen} onClose={() => setFilterModalOpen(false)} allFolders={allFolders} filters={{ folderFilter, fileSort, seriesSort }} setFilters={(k, v) => {
                if (k === 'folderFilter') setFolderFilter(v);
                if (k === 'fileSort') setFileSort(v);
                if (k === 'seriesSort') setSeriesSort(v);
            }} />

            {modalContent && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModalContent(null)}>
                    <Card className="max-w-xl w-full shadow-2xl animate-scale-in" onClick={e => e.stopPropagation()}>
                        <CardHeader>
                            <CardTitle className="break-words leading-tight">{modalContent.originalName}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <DIV_InfoRow label="Path" value={modalContent.fullPath} fullWidth />
                                <DIV_InfoRow label="Size" value={formatBytes(modalContent.size)} />
                                <DIV_InfoRow label="Date" value={formatDate(modalContent.dateObject)} />
                            </div>

                            {modalContent.jsonData && (
                                <div className="bg-muted p-4 rounded-lg space-y-2 mt-2">
                                    <div className="font-semibold">{modalContent.jsonData.title}</div>
                                    {modalContent.wordCount !== undefined && <div className="text-sm text-muted-foreground">{modalContent.wordCount.toLocaleString()} words</div>}
                                    {modalContent.jsonData.description && <p className="text-sm italic text-muted-foreground mt-2 line-clamp-4">{modalContent.jsonData.description}</p>}
                                </div>
                            )}
                        </CardContent>
                        <CardFooter className="justify-end gap-3">
                            <Button variant="ghost" onClick={() => setModalContent(null)}>Close</Button>
                            <Button onClick={() => handleDownload(modalContent)} className="gap-2">
                                <Download className="h-4 w-4" /> Download
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
            <StatusMessage status={status} />
        </div>
    );
};

const DIV_InfoRow = ({ label, value, fullWidth = false }: { label: string, value: string, fullWidth?: boolean }) => (
    <div className={cn("space-y-1", fullWidth ? "col-span-2" : "")}>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="font-medium truncate" title={value}>{value}</div>
    </div>
);
