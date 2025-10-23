import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { getJSZip, triggerDownload } from '../utils/helpers';
import { Status, BackupData, BackupOrganizerFileInfo } from '../utils/types';

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatDate = (date: Date) => date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

export const BackupOrganizer: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();

    const [zipFile, setZipFile] = useState<File | null>(null);
    const [status, setStatus] = useState<Status | null>(null);

    const [processedSeries, setProcessedSeries] = useState<Record<string, BackupOrganizerFileInfo[]>>({});
    const [otherFiles, setOtherFiles] = useState<BackupOrganizerFileInfo[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<Set<BackupOrganizerFileInfo>>(new Set());
    const [allFolders, setAllFolders] = useState<string[]>([]);
    
    // Filters & Sorting
    const [searchQuery, setSearchQuery] = useState('');
    const [folderFilter, setFolderFilter] = useState('all');
    const [seriesSort, setSeriesSort] = useState('name-asc');
    const [fileSort, setFileSort] = useState('desc');

    // UI State
    const [collapsedSeries, setCollapsedSeries] = useState<Set<string>>(new Set());
    const [modalContent, setModalContent] = useState<BackupOrganizerFileInfo | null>(null);
    const [preserveStructure, setPreserveStructure] = useState(false);

    const handleFileSelected = async (files: FileList) => {
        resetState();
        const file = files[0];
        if (!file || file.type !== "application/zip") {
            showToast('Please upload a valid .zip file.', true);
            return;
        }
        setZipFile(file);
        showSpinner();
        setStatus({ type: 'info', message: 'Processing ZIP file...' });
        
        try {
            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(file);
            const filePromises: Promise<BackupOrganizerFileInfo | null>[] = [];
            zip.forEach((_: string, zipEntry: any) => {
                if (!zipEntry.dir) {
                    filePromises.push(parseFileContent(zipEntry));
                }
            });

            const allFiles = (await Promise.all(filePromises)).filter((f): f is BackupOrganizerFileInfo => f !== null);

            const series: Record<string, BackupOrganizerFileInfo[]> = {};
            const others: BackupOrganizerFileInfo[] = [];
            let novFileCount = 0;

            allFiles.forEach(fileInfo => {
                if (fileInfo.fileType === 'nov' && fileInfo.seriesName) {
                    novFileCount++;
                    if (!series[fileInfo.seriesName]) {
                        series[fileInfo.seriesName] = [];
                    }
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

    const parseFileContent = async (zipEntry: any): Promise<BackupOrganizerFileInfo | null> => {
        const fullPath = zipEntry.name;
        const originalName = fullPath.split('/').pop() || '';
        const folderPath = fullPath.substring(0, fullPath.lastIndexOf('/') + 1) || '/';
        const fileExt = originalName.split('.').pop()?.toLowerCase() || '';

        const baseInfo = {
            fullPath, originalName, folderPath, zipEntry,
            size: zipEntry._data.uncompressedSize,
            dateObject: zipEntry.date,
            fileType: fileExt,
        };

        if (originalName.toLowerCase().endsWith('.nov') || originalName.toLowerCase().endsWith('.nov.txt')) {
            try {
                const content = await zipEntry.async('string');
                const data = JSON.parse(content) as BackupData;
                if (!data.title || !data.last_update_date) return null;
                
                return {
                    ...baseInfo,
                    seriesName: data.title,
                    timestamp: data.last_update_date,
                    dateObject: new Date(data.last_update_date),
                    jsonData: data,
                };
            } catch { return null; }
        } else {
             return baseInfo;
        }
    };
    
    const filteredAndSortedData = useMemo(() => {
        const query = searchQuery.toLowerCase();
        
        const filterFile = (file: BackupOrganizerFileInfo) => {
            const folderMatch = folderFilter === 'all' || file.folderPath === folderFilter;
            if (!folderMatch) return false;
            
            const textMatch = (
                file.originalName.toLowerCase().includes(query) ||
                (file.seriesName && file.seriesName.toLowerCase().includes(query)) ||
                (file.jsonData?.description && file.jsonData.description.toLowerCase().includes(query))
            );
            return textMatch;
        };

        const sortedSeries = Object.entries(processedSeries).map(([seriesName, files]) => {
            const sortedFiles = [...files].sort((a, b) => fileSort === 'asc' ? (a.timestamp ?? 0) - (b.timestamp ?? 0) : (b.timestamp ?? 0) - (a.timestamp ?? 0));
            return { seriesName, files: sortedFiles.filter(filterFile) };
        }).filter(s => s.files.length > 0);

        if (seriesSort === 'name-asc') {
            sortedSeries.sort((a, b) => a.seriesName.localeCompare(b.seriesName));
        } else if (seriesSort === 'file-count-desc') {
            sortedSeries.sort((a, b) => b.files.length - a.files.length);
        } else if (seriesSort === 'updated-desc') {
            sortedSeries.sort((a, b) => {
                const lastA = Math.max(...a.files.map(f => f.timestamp ?? 0));
                const lastB = Math.max(...b.files.map(f => f.timestamp ?? 0));
                return lastB - lastA;
            });
        }
        
        return {
            series: sortedSeries,
            others: otherFiles.filter(filterFile).sort((a,b) => a.fullPath.localeCompare(b.fullPath)),
        };

    }, [searchQuery, folderFilter, seriesSort, fileSort, processedSeries, otherFiles]);

    const handleSelection = useCallback((file: BackupOrganizerFileInfo, isSelected: boolean) => {
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            if (isSelected) newSet.add(file);
            else newSet.delete(file);
            return newSet;
        });
    }, []);

    const handleSeriesSelection = useCallback((files: BackupOrganizerFileInfo[], isSelected: boolean) => {
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            files.forEach(file => {
                if (isSelected) newSet.add(file);
                else newSet.delete(file);
            });
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
    
    const resetState = () => {
        setZipFile(null);
        setStatus(null);
        setProcessedSeries({});
        setOtherFiles([]);
        setSelectedFiles(new Set());
        setAllFolders([]);
        setSearchQuery('');
        setFolderFilter('all');
    };

    if (!zipFile) {
        return (
            <div id="backupOrganizerApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in will-change-[transform,opacity]">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Backup Organizer</h1>
                <div className="max-w-md mx-auto">
                    <FileInput inputId="organizerZipUpload" label="Upload ZIP Archive" accept=".zip" onFileSelected={handleFileSelected} />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload a .zip file to inspect its contents.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div id="backupOrganizerApp" className="max-w-5xl mx-auto p-4 md:p-6 space-y-5 animate-fade-in">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Backup Organizer</h1>

            <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="lg:col-span-2">
                    <label htmlFor="searchInput" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Filter:</label>
                    <input type="text" id="searchInput" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Filter by name, desc..." className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white"/>
                </div>
                {allFolders.length > 1 && (
                    <div>
                        <label htmlFor="folderFilter" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Folder:</label>
                        <select id="folderFilter" value={folderFilter} onChange={e => setFolderFilter(e.target.value)} className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                            <option value="all">All Folders</option>
                            {allFolders.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleSelectLatest('newest')} className="px-3 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Select Newest</button>
                    <button onClick={() => handleSelectLatest('oldest')} className="px-3 py-2 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500">Select Oldest</button>
                </div>
            </div>

            <StatusMessage status={status} />

            <div className="space-y-4">
                {filteredAndSortedData.series.map(({ seriesName, files }) => (
                    <SeriesPanel key={seriesName} seriesName={seriesName} files={files} selectedFiles={selectedFiles} onSelection={handleSelection} onSeriesSelection={handleSeriesSelection} onPreview={setModalContent} collapsedSeries={collapsedSeries} setCollapsedSeries={setCollapsedSeries} newestFileTimestamp={Math.max(...files.map(f => f.timestamp ?? 0))} />
                ))}
                {filteredAndSortedData.others.length > 0 && (
                    <OtherFilesPanel files={filteredAndSortedData.others} selectedFiles={selectedFiles} onSelection={handleSelection} onSeriesSelection={handleSeriesSelection} onPreview={setModalContent} collapsedSeries={collapsedSeries} setCollapsedSeries={setCollapsedSeries} />
                )}
            </div>

            {selectedFiles.size > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-md z-40 animate-slide-in">
                    <div className="bg-slate-800/90 dark:bg-slate-900/90 backdrop-blur-sm text-white rounded-xl p-4 shadow-2xl flex items-center justify-between gap-4">
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

const SeriesPanel = ({ seriesName, files, selectedFiles, onSelection, onSeriesSelection, onPreview, collapsedSeries, setCollapsedSeries, newestFileTimestamp }: any) => {
    const isCollapsed = collapsedSeries.has(seriesName);
    const visibleFiles = files;
    const allVisibleSelected = visibleFiles.every((f:any) => selectedFiles.has(f));
    const someVisibleSelected = visibleFiles.some((f:any) => selectedFiles.has(f));
    
    return (
        <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
            <header onClick={() => setCollapsedSeries((p: Set<string>) => { const s = new Set(p); isCollapsed ? s.delete(seriesName) : s.add(seriesName); return s; })} className="p-3 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={allVisibleSelected} ref={el => el && (el.indeterminate = !allVisibleSelected && someVisibleSelected)} onClick={e => e.stopPropagation()} onChange={e => onSeriesSelection(visibleFiles, e.target.checked)} className="w-5 h-5 rounded" />
                <h2 className="font-semibold text-lg flex-grow text-slate-800 dark:text-slate-200">{seriesName}</h2>
                <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-full">{files.length}</span>
            </header>
            {!isCollapsed && (
                <ul className="list-none p-0 m-0 border-t border-slate-200 dark:border-slate-700">
                    {files.map((file: BackupOrganizerFileInfo) => (
                        <li key={file.fullPath} className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_120px_100px_auto] gap-3 items-center p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                            <input type="checkbox" checked={selectedFiles.has(file)} onChange={e => onSelection(file, e.target.checked)} className="w-5 h-5 rounded" />
                            <div className="truncate">
                                <span onClick={() => onPreview(file)} className="cursor-pointer hover:text-primary-500">{file.originalName}</span>
                                {file.timestamp === newestFileTimestamp && <span className="ml-2 text-xs px-1.5 py-0.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">Latest</span>}
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate md:hidden">{formatDate(file.dateObject)} - {formatBytes(file.size)}</p>
                            </div>
                            <span className="hidden md:inline text-sm text-right text-slate-600 dark:text-slate-400">{formatDate(file.dateObject)}</span>
                            <span className="hidden md:inline text-sm text-right text-slate-600 dark:text-slate-400">{formatBytes(file.size)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const OtherFilesPanel = ({ files, selectedFiles, onSelection, onSeriesSelection, onPreview, collapsedSeries, setCollapsedSeries }: any) => {
    const seriesName = "Other Files";
    const isCollapsed = collapsedSeries.has(seriesName);
    const visibleFiles = files;
    const allVisibleSelected = visibleFiles.every((f: any) => selectedFiles.has(f));
    const someVisibleSelected = visibleFiles.some((f: any) => selectedFiles.has(f));
    
    return (
        <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm">
            <header onClick={() => setCollapsedSeries((p: Set<string>) => { const s = new Set(p); isCollapsed ? s.delete(seriesName) : s.add(seriesName); return s; })} className="p-3 flex items-center gap-3 cursor-pointer">
                 <input type="checkbox" checked={allVisibleSelected} ref={el => el && (el.indeterminate = !allVisibleSelected && someVisibleSelected)} onClick={e => e.stopPropagation()} onChange={e => onSeriesSelection(visibleFiles, e.target.checked)} className="w-5 h-5 rounded" />
                <h2 className="font-semibold text-lg flex-grow text-slate-800 dark:text-slate-200">{seriesName}</h2>
                <span className="text-sm px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-full">{files.length}</span>
            </header>
            {!isCollapsed && (
                 <ul className="list-none p-0 m-0 border-t border-slate-200 dark:border-slate-700">
                    {files.map((file: BackupOrganizerFileInfo) => (
                        <li key={file.fullPath} className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_120px_100px_auto] gap-3 items-center p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0">
                            <input type="checkbox" checked={selectedFiles.has(file)} onChange={e => onSelection(file, e.target.checked)} className="w-5 h-5 rounded" />
                            <div className="truncate">
                                <span onClick={() => onPreview(file)} className="cursor-pointer hover:text-primary-500">{file.originalName}</span>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate md:hidden">{formatDate(file.dateObject)} - {formatBytes(file.size)}</p>
                            </div>
                            <span className="hidden md:inline text-sm text-right text-slate-600 dark:text-slate-400">{formatDate(file.dateObject)}</span>
                            <span className="hidden md:inline text-sm text-right text-slate-600 dark:text-slate-400">{formatBytes(file.size)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const PreviewModal = ({ file, onClose }: { file: BackupOrganizerFileInfo, onClose: () => void }) => {
    const [content, setContent] = useState<string | null>('Loading...');

    useEffect(() => {
        const loadContent = async () => {
            if (file.fileType === 'nov' && file.jsonData) {
                const data = file.jsonData;
                const wordCount = data.revisions?.[0]?.book_progresses?.[0]?.word_count?.toLocaleString() || 'N/A';
                const sceneCount = data.revisions?.[0]?.scenes?.length || 'N/A';
                const sectionCount = data.revisions?.[0]?.sections?.length || 'N/A';
                setContent(`<div class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2">
                    <strong class="text-right text-primary-500">Title:</strong> <span>${data.title || 'N/A'}</span>
                    <strong class="text-right text-primary-500">Description:</strong> <pre class="whitespace-pre-wrap font-sans">${data.description || 'N/A'}</pre>
                    <strong class="text-right text-primary-500">Folder Path:</strong> <span>${file.folderPath}</span>
                    <strong class="text-right text-primary-500">Last Updated:</strong> <span>${formatDate(file.dateObject)}</span>
                    <strong class="text-right text-primary-500">Word Count:</strong> <span>${wordCount}</span>
                    <strong class="text-right text-primary-500">Scene Count:</strong> <span>${sceneCount}</span>
                    <strong class="text-right text-primary-500">Section Count:</strong> <span>${sectionCount}</span>
                    <strong class="text-right text-primary-500">File Size:</strong> <span>${formatBytes(file.size)}</span>
                </div>`);
            } else if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(file.fileType)) {
                const blob = await file.zipEntry.async('blob');
                const url = URL.createObjectURL(blob);
                setContent(`<img src="${url}" alt="Preview" class="max-w-full max-h-[60vh] mx-auto" />`);
                return () => URL.revokeObjectURL(url);
            } else {
                try {
                    const text = await file.zipEntry.async('string');
                    setContent(`<pre class="whitespace-pre-wrap text-sm">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`);
                } catch {
                    setContent('Preview not available for this binary file.');
                }
            }
        };
        const cleanupPromise = loadContent();
        return () => { cleanupPromise.then(cleanup => cleanup && cleanup()); };
    }, [file]);

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <h3 className="font-semibold text-lg truncate text-slate-800 dark:text-slate-200" title={file.originalName}>{file.originalName}</h3>
                    <button onClick={onClose} className="text-2xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">&times;</button>
                </header>
                <div className="p-4 overflow-y-auto" dangerouslySetInnerHTML={{ __html: content || '' }}></div>
            </div>
        </div>
    );
};
