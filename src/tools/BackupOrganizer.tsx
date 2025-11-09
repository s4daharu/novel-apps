import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { getJSZip, triggerDownload } from '../utils/helpers';
import { Status, BackupData, BackupOrganizerFileInfo } from '../utils/types';
import { calculateWordCount } from '../utils/backupHelpers';

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

    // This regex is designed to be non-greedy and match common chapter range patterns
    const chapterRangePattern = /(C|Ch|Chapter)?\s?\d+[-_]\d+/i;
    const simpleChapterPattern = /(C|Ch|Chapter)\s?\d+/i;

    let cleanedTitle = title
        // Remove prefixes like "101-200_", "C1_100_", or "Ch 1-100 "
        .replace(new RegExp(`^${chapterRangePattern.source}[-_]?\\s*`), '')
        // Remove suffixes like " C1-300", "_C101_200", or " C102_END"
        .replace(new RegExp(`\\s*[-_]?${chapterRangePattern.source}(\\s*_END)?$`), '')
        // Remove simple chapter indicators like " C101" at the end of the string
        .replace(new RegExp(`\\s*${simpleChapterPattern.source}$`), '')
        // Normalize underscores/hyphens to spaces and collapse multiple whitespace characters
        .replace(/[_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
        
    // If cleaning the title results in an empty string (e.g., the title was just "1-100"),
    // fall back to the original title to avoid blank series names.
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
    const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every((f:any) => selectedFiles.has(f));
    const someVisibleSelected = visibleFiles.some((f:any) => selectedFiles.has(f));
    
    return (
        <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
            <header onClick={() => setCollapsedSeries((p: Set<string>) => { const s = new Set(p); isCollapsed ? s.delete(title) : s.add(title); return s; })} className="p-3 flex items-center gap-3 cursor-pointer select-none">
                {/* FIX: The `ref` callback for setting the indeterminate state was implicitly returning a value, which is not allowed for this prop. It has been corrected to a function block that explicitly returns void. */}
                <input type="checkbox" checked={allVisibleSelected} ref={el => { if (el) { el.indeterminate = !allVisibleSelected && someVisibleSelected; } }} onClick={e => e.stopPropagation()} onChange={e => onSeriesSelection(visibleFiles, e.target.checked)} className="w-5 h-5 rounded accent-primary-600 focus:ring-primary-500" />
                <h2 className="font-semibold text-lg flex-grow text-slate-800 dark:text-slate-200">{title}</h2>
                <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-full">{files.length}</span>
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-slate-500 dark:text-slate-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
            </header>
            {!isCollapsed && (
                <ul className="list-none p-0 m-0 border-t border-slate-200 dark:border-slate-700">
                    {files.map((file: BackupOrganizerFileInfo) => (
                        <li key={file.fullPath} className="flex items-start gap-3 p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                            <input type="checkbox" checked={selectedFiles.has(file)} onChange={e => onSelection(file, e.target.checked)} className="w-5 h-5 rounded mt-1 accent-primary-600 focus:ring-primary-500" />
                            <div className="flex-grow min-w-0">
                                <div className="flex items-center gap-2">
                                    <span onClick={() => onPreview(file)} className="break-words sm:truncate cursor-pointer hover:text-primary-500 font-medium text-slate-800 dark:text-slate-200" title={file.originalName}>{file.originalName}</span>
                                    {file.timestamp === newestFileTimestamp && file.fileType === 'nov' && <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">Latest</span>}
                                </div>
                                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    <span>{formatDate(file.dateObject)}</span>
                                    <span>{formatBytes(file.size)}</span>
                                    {file.wordCount != null && (
                                        <span>{file.wordCount.toLocaleString()} words</span>
                                    )}
                                    <span className="break-words sm:truncate" title={file.folderPath}>{file.folderPath}</span>
                                </div>
                            </div>
                            <button onClick={() => onDownload(file)} className="flex-shrink-0 p-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" aria-label={`Download ${file.originalName}`}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Filters &amp; Sort</h2>
                    <button onClick={onClose} className="text-2xl">&times;</button>
                </header>
                <div className="p-4 space-y-4">
                    {allFolders.length > 1 && (
                        <div>
                            <label htmlFor="modalFolderFilter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Filter by Folder:</label>
                            <select id="modalFolderFilter" value={filters.folderFilter} onChange={e => setFilters('folderFilter', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                                <option value="all">All Folders</option>
                                {allFolders.map(f => <option key={f} value={f}>{f || '/'}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label htmlFor="modalFileSort" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sort Files By:</label>
                        <select id="modalFileSort" value={filters.fileSort} onChange={e => setFilters('fileSort', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                           <option value="date-desc">Date (Newest First)</option>
                           <option value="date-asc">Date (Oldest First)</option>
                           <option value="name-asc">Name (A-Z)</option>
                           <option value="name-desc">Name (Z-A)</option>
                           <option value="size-desc">Size (Largest First)</option>
                           <option value="size-asc">Size (Smallest First)</option>
                           <option value="word-count-desc">Word Count (Most First)</option>
                           <option value="word-count-asc">Word Count (Fewest First)</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="modalSeriesSort" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sort Series By:</label>
                        <select id="modalSeriesSort" value={filters.seriesSort} onChange={e => setFilters('seriesSort', e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                           <option value="name-asc">Series Name (A-Z)</option>
                           <option value="file-count-desc">File Count (Most First)</option>
                           <option value="updated-desc">Last Updated (Newest First)</option>
                        </select>
                    </div>
                </div>
                <footer className="p-4 border-t border-slate-200 dark:border-slate-700 text-right">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white">Done</button>
                </footer>
            </div>
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
                jsonData = data; // Store data regardless of date presence
                
                // Primary method: check for last_backup_date in JSON
                if (data.title && typeof data.last_backup_date !== 'undefined' && data.revisions) {
                    timestamp = data.last_backup_date;
                    determinedDate = new Date(timestamp);
                    seriesName = getSeriesNameFromTitle(data.title);
                    wordCount = data.revisions?.[0]?.scenes ? calculateWordCount(data.revisions[0].scenes) : 0;
                }
            } catch {
                // JSON parsing failed or file is not a valid backup, will proceed to filename check
            }
        }
    
        // Fallback method: check for datetime string in filename if no date from JSON
        if (!determinedDate) {
            const match = originalName.match(/(\d{14})/);
            if (match && match[1]) {
                const dtString = match[1]; // YYYYMMDDHHMMSS
                const year = parseInt(dtString.substring(0, 4), 10);
                const month = parseInt(dtString.substring(4, 6), 10) - 1; // month is 0-indexed
                const day = parseInt(dtString.substring(6, 8), 10);
                const hour = parseInt(dtString.substring(8, 10), 10);
                const minute = parseInt(dtString.substring(10, 12), 10);
                const second = parseInt(dtString.substring(12, 14), 10);
                const date = new Date(year, month, day, hour, minute, second);
                
                if (!isNaN(date.getTime())) {
                    determinedDate = date;
                }
            }
        }
        
        // Final fallback: if no date is found, use a default epoch date.
        if (!determinedDate) {
            determinedDate = new Date(0); // Epoch time
        }
    
        // Special handling for novel backups where seriesName might not have been set yet
        if (isNovelBackup && !seriesName) {
            if (jsonData?.title) { // if JSON was parsed but had no date or title was missed
                 seriesName = getSeriesNameFromTitle(jsonData.title);
            } else { // if JSON parsing failed, use filename for series
                 seriesName = getSeriesNameFromTitle(originalName.replace(/\.(nov\.txt|nov|json)$/i, ''));
            }
        }
    
        const fileInfo: BackupOrganizerFileInfo = {
            fullPath,
            originalName,
            folderPath,
            zipEntry,
            size: zipEntry._data.uncompressedSize,
            dateObject: determinedDate,
            fileType: fileExt,
            seriesName,
            timestamp,
            jsonData,
            wordCount
        };
    
        return fileInfo;
    }, []);

    const handleFileSelected = async (files: FileList) => {
        resetState();
        const file = files[0];
        const isZipFile = file && (
            file.type === 'application/zip' ||
            file.type === 'application/x-zip-compressed' ||
            file.name.toLowerCase().endsWith('.zip')
        );

        if (!isZipFile) {
            showToast('Please upload a valid .zip file.', true);
            return;
        }
        setZipFile(file);
        showSpinner();
        setStatus({ type: 'info', message: 'Processing ZIP file...' });
        
        try {
            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(file);
            const filePromises: Promise<BackupOrganizerFileInfo>[] = [];
            zip.forEach((_: string, zipEntry: any) => {
                if (!zipEntry.dir) {
                    filePromises.push(parseFileContent(zipEntry));
                }
            });

            const allFiles = await Promise.all(filePromises);
            const series: Record<string, BackupOrganizerFileInfo[]> = {};
            const others: BackupOrganizerFileInfo[] = [];
            let novFileCount = 0;

            allFiles.forEach(fileInfo => {
                if (fileInfo.seriesName) {
                    novFileCount++;
                    if (!series[fileInfo.seriesName]) series[fileInfo.seriesName] = [];
                    series[fileInfo.seriesName].push(fileInfo);
                } else {
                    others.push(fileInfo);
                }
            });

            if (novFileCount === 0 && others.length === 0) {
                setStatus({ type: 'warning', message: 'No processable files found in the zip archive.' });
            } else {
                setProcessedSeries(series);
                setOtherFiles(others);
                const uniqueFolders = [...new Set(allFiles.map(f => f.folderPath))];
                setAllFolders(uniqueFolders.sort());
                setStatus({ type: 'success', message: `Found ${novFileCount} metadata files across ${Object.keys(series).length} series, and ${others.length} other files.`});
            }
        } catch (err: any) {
            setStatus({ type: 'error', message: `Error reading ZIP file: ${err.message}` });
        } finally {
            hideSpinner();
        }
    };
    
    // FIX: Add an explicit type annotation to the useMemo hook. This prevents TypeScript from inferring an 'unknown' type when the dependencies are complex, resolving subsequent errors related to missing properties like '.filter' and '.length' on the memoized value.
    const filteredAndSortedData = useMemo<{
        series: { seriesName: string; files: BackupOrganizerFileInfo[] }[];
        others: BackupOrganizerFileInfo[];
    }>(() => {
        const query = searchQuery.toLowerCase();
        
        const filterFile = (file: BackupOrganizerFileInfo) => (
            (folderFilter === 'all' || file.folderPath === folderFilter) &&
            (file.originalName.toLowerCase().includes(query) ||
             (file.seriesName && file.seriesName.toLowerCase().includes(query)) ||
             (file.jsonData?.description && file.jsonData.description.toLowerCase().includes(query)))
        );
        
        const fileSorter = (a: BackupOrganizerFileInfo, b: BackupOrganizerFileInfo) => {
            switch (fileSort) {
                case 'date-asc': return (a.timestamp ?? a.dateObject.getTime()) - (b.timestamp ?? b.dateObject.getTime());
                case 'date-desc': return (b.timestamp ?? b.dateObject.getTime()) - (a.timestamp ?? a.dateObject.getTime());
                case 'size-asc': return a.size - b.size;
                case 'size-desc': return b.size - a.size;
                case 'word-count-asc': return (a.wordCount ?? -1) - (b.wordCount ?? -1);
                case 'word-count-desc': return (b.wordCount ?? -1) - (a.wordCount ?? -1);
                case 'name-asc': return a.originalName.localeCompare(b.originalName);
                case 'name-desc': return b.originalName.localeCompare(a.originalName);
                default: return 0;
            }
        };

        const sortedSeries = Object.entries(processedSeries).map(([seriesName, files]) => ({
            seriesName,
            files: files.filter(filterFile).sort(fileSorter)
        })).filter(s => s.files.length > 0);

        if (seriesSort === 'name-asc') sortedSeries.sort((a, b) => a.seriesName.localeCompare(b.seriesName));
        else if (seriesSort === 'file-count-desc') sortedSeries.sort((a, b) => b.files.length - a.files.length);
        else if (seriesSort === 'updated-desc') sortedSeries.sort((a, b) => Math.max(...b.files.map(f => f.timestamp ?? 0)) - Math.max(...a.files.map(f => f.timestamp ?? 0)));
        
        return { series: sortedSeries, others: otherFiles.filter(filterFile).sort(fileSorter) };
    }, [searchQuery, folderFilter, seriesSort, fileSort, processedSeries, otherFiles]);
    
    const handleSelection = useCallback((file: BackupOrganizerFileInfo, isSelected: boolean) => {
        setSelectedFiles(prev => { const newSet = new Set(prev); isSelected ? newSet.add(file) : newSet.delete(file); return newSet; });
    }, []);

    const handleSeriesSelection = useCallback((files: BackupOrganizerFileInfo[], isSelected: boolean) => {
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            files.forEach(file => isSelected ? newSet.add(file) : newSet.delete(file));
            return newSet;
        });
    }, []);

    const handleSelectLatest = (type: 'newest' | 'oldest') => {
        const newSelections = new Set<BackupOrganizerFileInfo>();
        Object.values(processedSeries).forEach(files => {
            if (files.length === 0) return;
            const sorted = [...files].sort((a,b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
            const fileToSelect = type === 'newest' ? sorted[sorted.length - 1] : sorted[0];
            if (fileToSelect) newSelections.add(fileToSelect);
        });
        setSelectedFiles(newSelections);
    };
    
    const handleSelectAll = (select: boolean) => {
        if (select) {
            const allVisibleFiles = new Set([...filteredAndSortedData.series.flatMap(s => s.files), ...filteredAndSortedData.others]);
            setSelectedFiles(allVisibleFiles);
        } else {
            setSelectedFiles(new Set());
        }
    };

    const downloadSelected = async () => {
        if (selectedFiles.size === 0) return;
        showSpinner();
        try {
            const JSZip = await getJSZip();
            const zip = new JSZip();
            for (const fileInfo of selectedFiles) {
                const content = await fileInfo.zipEntry.async('blob');
                const path = preserveStructure ? fileInfo.fullPath : fileInfo.originalName;
                zip.file(path, content);
            }
            const blob = await zip.generateAsync({ type: "blob" });
            triggerDownload(blob, "Backup_Selection.zip");
        } catch (err: any) {
            showToast(`Error creating ZIP: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };
    
     const downloadSingleFile = async (fileInfo: BackupOrganizerFileInfo) => {
        showToast(`Downloading ${fileInfo.originalName}...`);
        showSpinner();
        try {
            const content = await fileInfo.zipEntry.async('blob');
            triggerDownload(content, fileInfo.originalName);
        } catch (err: any) {
            showToast(`Error downloading file: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };
    
    const resetState = () => { setZipFile(null); setStatus(null); setProcessedSeries({}); setOtherFiles([]); setSelectedFiles(new Set()); setAllFolders([]); setSearchQuery(''); setFolderFilter('all'); };

    if (!zipFile) {
        return (
            <div id="backupOrganizerApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Backup Organizer</h1>
                <div className="max-w-md mx-auto">
                    <FileInput inputId="organizerZipUpload" label="Upload ZIP Archive" accept=".zip" onFileSelected={handleFileSelected} />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload a .zip file to inspect its contents.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div id="backupOrganizerApp" className="max-w-5xl mx-auto p-4 md:p-6 space-y-5 animate-fade-in pb-28">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Backup Organizer</h1>

            <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
                    <div>
                        <label htmlFor="searchInput" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Filter by Name/Description:</label>
                        <input type="text" id="searchInput" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="e.g., Chapter 1, draft..." className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white"/>
                    </div>
                     <button onClick={() => setFilterModalOpen(true)} className="w-full sm:w-auto px-4 py-2 text-sm rounded-lg font-medium bg-white hover:bg-slate-50 dark:bg-slate-600 dark:hover:bg-slate-500">Filters &amp; Sort</button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button onClick={() => handleSelectLatest('newest')} className="px-3 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Select Newest</button>
                    <button onClick={() => handleSelectLatest('oldest')} className="px-3 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Select Oldest</button>
                    <button onClick={() => handleSelectAll(true)} className="px-3 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Select All</button>
                    <button onClick={() => handleSelectAll(false)} className="px-3 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Select None</button>
                </div>
            </div>

            <FilterModal 
                isOpen={isFilterModalOpen}
                onClose={() => setFilterModalOpen(false)}
                allFolders={allFolders}
                filters={{ folderFilter, fileSort, seriesSort }}
                setFilters={(key, value) => {
                    if (key === 'folderFilter') setFolderFilter(value);
                    if (key === 'fileSort') setFileSort(value);
                    if (key === 'seriesSort') setSeriesSort(value);
                }}
            />

            <StatusMessage status={status} />

            <div className="space-y-4">
                {filteredAndSortedData.series.map(({ seriesName, files }) => (
                    <FilePanel key={seriesName} title={seriesName} files={files} selectedFiles={selectedFiles} onSelection={handleSelection} onSeriesSelection={handleSeriesSelection} onPreview={setModalContent} onDownload={downloadSingleFile} collapsedSeries={collapsedSeries} setCollapsedSeries={setCollapsedSeries} newestFileTimestamp={Math.max(...files.map(f => f.timestamp ?? 0))} fileSort={fileSort} />
                ))}
                {filteredAndSortedData.others.length > 0 && (
                     <FilePanel title="Other Files" files={filteredAndSortedData.others} selectedFiles={selectedFiles} onSelection={handleSelection} onSeriesSelection={handleSeriesSelection} onPreview={setModalContent} onDownload={downloadSingleFile} collapsedSeries={collapsedSeries} setCollapsedSeries={setCollapsedSeries} newestFileTimestamp={0} fileSort={fileSort} />
                )}
            </div>

            {selectedFiles.size > 0 && (
                <div className="fixed bottom-0 left-0 right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:bottom-4 z-40 sm:w-full sm:max-w-md animate-slide-in">
                    <div className="bg-slate-800/90 dark:bg-slate-900/90 backdrop-blur-sm text-white sm:rounded-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 shadow-2xl flex items-center justify-between gap-4">
                        <div>
                            <p className="font-bold">{selectedFiles.size} file(s) selected</p>
                            <label className="text-xs flex items-center gap-2 text-slate-300 mt-1 cursor-pointer">
                                <input type="checkbox" checked={preserveStructure} onChange={e => setPreserveStructure(e.target.checked)} className="accent-primary-500"/>
                                Preserve folder structure
                            </label>
                        </div>
                        <button onClick={downloadSelected} className="px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg">Download</button>
                    </div>
                </div>
            )}
            
            {modalContent && <PreviewModal file={modalContent} onClose={() => setModalContent(null)} />}
        </div>
    );
};

const PreviewModal = ({ file, onClose }: { file: BackupOrganizerFileInfo, onClose: () => void }) => {
    const [content, setContent] = useState<string | null>('Loading...');
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const loadContent = async () => {
            if (file.fileType === 'nov' && file.jsonData) {
                const data = file.jsonData;
                const wordCount = data.revisions?.[0]?.book_progresses?.slice(-1)[0]?.word_count?.toLocaleString() || 'N/A';
                const sceneCount = data.revisions?.[0]?.scenes?.length || 'N/A';
                if (active) setContent(`<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <strong class="text-right text-slate-500 dark:text-slate-400">Title:</strong> <span>${data.title || 'N/A'}</span>
                    <strong class="text-right text-slate-500 dark:text-slate-400">Description:</strong> <pre class="whitespace-pre-wrap font-sans">${data.description || 'N/A'}</pre>
                    <strong class="text-right text-slate-500 dark:text-slate-400">Path:</strong> <span>${file.folderPath}</span>
                    <strong class="text-right text-slate-500 dark:text-slate-400">Updated:</strong> <span>${formatDate(file.dateObject)}</span>
                    <strong class="text-right text-slate-500 dark:text-slate-400">Words:</strong> <span>${wordCount}</span>
                    <strong class="text-right text-slate-500 dark:text-slate-400">Scenes:</strong> <span>${sceneCount}</span>
                    <strong class="text-right text-slate-500 dark:text-slate-400">Size:</strong> <span>${formatBytes(file.size)}</span>
                </div>`);
            } else if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(file.fileType)) {
                const blob = await file.zipEntry.async('blob');
                const url = URL.createObjectURL(blob);
                if (active) { setImageUrl(url); setContent(null); }
            } else {
                try {
                    const text = await file.zipEntry.async('string');
                    if (active) setContent(`<pre class="whitespace-pre-wrap text-sm">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`);
                } catch {
                    if (active) setContent('Preview not available for this binary file.');
                }
            }
        };
        
        loadContent();

        return () => {
            active = false;
            if (imageUrl) URL.revokeObjectURL(imageUrl);
        };
    }, [file, imageUrl]);

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="font-semibold text-lg truncate text-slate-800 dark:text-slate-200" title={file.originalName}>{file.originalName}</h3>
                    <button onClick={onClose} className="text-2xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">&times;</button>
                </header>
                <div className="p-4 overflow-y-auto">
                    {imageUrl && <img src={imageUrl} alt="Preview" className="max-w-full max-h-[60vh] mx-auto" />}
                    {content && <div dangerouslySetInnerHTML={{ __html: content }} />}
                </div>
            </div>
        </div>
    );
};