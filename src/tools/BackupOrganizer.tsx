
import React, { useState, useMemo, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { getJSZip, triggerDownload, pMap } from '../utils/helpers';
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
                determinedDate = new Date(year, month, day, hour, minute, second);
            }
        }

        // If still no date, use ZIP date
        if (!determinedDate) {
            determinedDate = zipEntry.date;
        }

        if (!seriesName) {
            seriesName = getSeriesNameFromTitle(originalName.replace(/\.[^/.]+$/, ""));
        }
        
        // Fallback for timestamp
        if (!timestamp) {
            timestamp = determinedDate.getTime();
        }

        return {
            fullPath,
            originalName,
            folderPath,
            zipEntry,
            size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
            dateObject: determinedDate,
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
                // Logic to categorize into series or others
                // If it looks like a backup file
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

    // ... Sorting and Filtering Logic ...
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
            
            // Helper to process files
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
        <div className="max-w-5xl mx-auto p-4 md:p-6 min-h-screen animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">Backup Organizer</h1>
            
            {!zipFile ? (
                 <div className="max-w-xl mx-auto bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center shadow-sm">
                    <p className="text-slate-600 dark:text-slate-300 mb-6">Upload a large ZIP archive containing multiple novel backups (e.g. from WebDav). This tool helps you group them by series, identify the latest versions, and extract what you need.</p>
                    <FileInput inputId="organizerZip" label="Upload Archive (ZIP)" accept=".zip" onFileSelected={handleFileSelected} />
                 </div>
            ) : (
                <>
                    <div className="flex flex-col md:flex-row gap-4 mb-6 sticky top-4 z-10">
                         <div className="flex-grow relative">
                            <input type="text" placeholder="Search files..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl border-none shadow-md bg-white/90 dark:bg-slate-800/90 backdrop-blur-md focus:ring-2 focus:ring-primary-500" />
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <button onClick={() => setFilterModalOpen(true)} className="px-4 py-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-xl shadow-md font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                            Filters
                        </button>
                        {selectedFiles.size > 0 && (
                             <button onClick={handleDownloadSelected} className="px-6 py-3 bg-primary-600 text-white rounded-xl shadow-md font-medium hover:bg-primary-700 flex items-center gap-2 animate-bounce-in">
                                <span>Download ({selectedFiles.size})</span>
                            </button>
                        )}
                    </div>

                    <div className="space-y-6">
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
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setModalContent(null)}>
                     <div className="bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4 break-words">{modalContent.originalName}</h3>
                        <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                            <p><strong>Path:</strong> {modalContent.fullPath}</p>
                            <p><strong>Size:</strong> {formatBytes(modalContent.size)}</p>
                            <p><strong>Date:</strong> {formatDate(modalContent.dateObject)}</p>
                             {modalContent.jsonData && (
                                <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-lg mt-4">
                                    <p><strong>Title:</strong> {modalContent.jsonData.title}</p>
                                    {modalContent.wordCount !== undefined && <p><strong>Word Count:</strong> {modalContent.wordCount.toLocaleString()}</p>}
                                    {modalContent.jsonData.description && <p className="mt-2 italic opacity-80 line-clamp-3">{modalContent.jsonData.description}</p>}
                                </div>
                            )}
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setModalContent(null)} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700">Close</button>
                            <button onClick={() => handleDownload(modalContent)} className="px-4 py-2 rounded-lg bg-primary-600 text-white">Download</button>
                        </div>
                     </div>
                </div>
            )}
            <StatusMessage status={status} />
        </div>
    );
};
