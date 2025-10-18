
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { triggerDownload } from '../utils/helpers';
import { BackupData, BackupScene, FrMatch, FrReviewItem } from '../utils/types';

export const FindReplaceBackup: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const navigate = useNavigate();
    const CONTEXT_LENGTH = 100;

    // Main state
    const [backupData, setBackupData] = useState<BackupData | null>(null);
    const [fileName, setFileName] = useState('');
    const [modificationsMade, setModificationsMade] = useState(false);

    // Search and Replace state
    const [findPattern, setFindPattern] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [options, setOptions] = useState({ useRegex: false, caseSensitive: false, wholeWord: false });
    
    // Results state
    const [matches, setMatches] = useState<FrMatch[]>([]);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

    // Modal state
    const [isReviewModalOpen, setReviewModalOpen] = useState(false);
    const [reviewItems, setReviewItems] = useState<FrReviewItem[]>([]);
    const [reviewSelection, setReviewSelection] = useState<Set<number>>(new Set());

    const getScenePlainText = useCallback((scene: BackupScene): string => {
        try {
            const content = JSON.parse(scene.text);
            return content.blocks?.map((b: any) => (b.text || '')).join('\n') || '';
        } catch { return ''; }
    }, []);

    const performSearch = useCallback(() => {
        if (!findPattern || !backupData) {
            setMatches([]);
            setCurrentMatchIndex(-1);
            return;
        }

        let regex;
        try {
            const flags = options.caseSensitive ? 'g' : 'gi';
            let finalPattern = options.useRegex ? findPattern : findPattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            if (options.wholeWord) {
                finalPattern = `\\b${finalPattern}\\b`;
            }
            regex = new RegExp(finalPattern, flags);
        } catch (e) {
            setMatches([]);
            setCurrentMatchIndex(-1);
            showToast('Invalid Regular Expression', true);
            return;
        }

        const allMatches: FrMatch[] = [];
        backupData.revisions[0].scenes.forEach(scene => {
            const plainText = getScenePlainText(scene);
            let match;
            while ((match = regex.exec(plainText)) !== null) {
                allMatches.push({
                    sceneCode: scene.code,
                    sceneTitle: scene.title,
                    index: match.index,
                    length: match[0].length,
                    text: match[0]
                });
            }
        });
        
        setMatches(allMatches);
        setCurrentMatchIndex(allMatches.length > 0 ? 0 : -1);
    }, [findPattern, options, backupData, getScenePlainText, showToast]);

    useEffect(() => {
        const handler = setTimeout(() => {
            performSearch();
        }, 300);
        return () => clearTimeout(handler);
    }, [findPattern, options, backupData, performSearch]);

    const handleFileSelected = async (files: FileList) => {
        const file = files[0];
        if (!file) return;

        showSpinner();
        try {
            const fileText = await file.text();
            const data = JSON.parse(fileText) as BackupData;
            if (!data.revisions?.[0]?.scenes) {
                throw new Error('Invalid backup file structure.');
            }
            setBackupData(data);
            setFileName(file.name);
            setModificationsMade(false);
        } catch (err: any) {
            showToast(`Error loading file: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };
    
    const handleClose = () => {
        setBackupData(null);
        setFileName('');
        setFindPattern('');
        setReplaceText('');
        setMatches([]);
        setCurrentMatchIndex(-1);
        navigate('/');
    };

    const handleNavigate = (direction: 1 | -1) => {
        setCurrentMatchIndex(prev => {
            const next = prev + direction;
            if (next >= 0 && next < matches.length) return next;
            return prev;
        });
    };
    
    const handleDownload = () => {
      if (!backupData) return;
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      triggerDownload(blob, fileName);
    };

    const handleReplaceNext = () => {
        if (currentMatchIndex < 0 || !backupData) return;
        
        const match = matches[currentMatchIndex];
        const newBackupData = JSON.parse(JSON.stringify(backupData));
        const scene = newBackupData.revisions[0].scenes.find((s: BackupScene) => s.code === match.sceneCode);

        if (scene) {
            let plainText = getScenePlainText(scene);
            plainText = plainText.substring(0, match.index) + replaceText + plainText.substring(match.index + match.length);
            const newBlocks = plainText.split('\n').map(line => ({ type: 'text', align: 'left', text: line }));
            scene.text = JSON.stringify({ blocks: newBlocks });
            setBackupData(newBackupData);
            setModificationsMade(true);
        }
    };

    const handleReviewReplaceAll = () => {
        if (matches.length === 0) return;
        const items = matches.map((match, index) => {
            const sceneText = getScenePlainText(backupData!.revisions[0].scenes.find(s => s.code === match.sceneCode)!);
            const contextStart = Math.max(0, match.index - 30);
            const preContext = sceneText.substring(contextStart, match.index);
            const postContext = sceneText.substring(match.index + match.length, match.index + match.length + 30);
            
            return {
                ...match,
                id: index,
                context: (
                    <>...{preContext}<span className="bg-red-500/20 px-1 rounded"><del>{match.text}</del></span>{postContext}... </>
                )
            };
        });
        setReviewItems(items);
        setReviewSelection(new Set(items.map(it => it.id)));
        setReviewModalOpen(true);
    };
    
    const handleConfirmReplaceAll = () => {
        const newBackupData = JSON.parse(JSON.stringify(backupData));
        const scenes = newBackupData.revisions[0].scenes as BackupScene[];
        
        const matchesToReplace = matches
            .map((match, index) => ({...match, id: index}))
            .filter(match => reviewSelection.has(match.id))
            .sort((a, b) => {
                if (a.sceneCode < b.sceneCode) return -1;
                if (a.sceneCode > b.sceneCode) return 1;
                return b.index - a.index; // IMPORTANT: process replacements from end to start within each scene
            });

        const sceneCache = new Map<string, string>();
        
        matchesToReplace.forEach(match => {
            if (!sceneCache.has(match.sceneCode)) {
                sceneCache.set(match.sceneCode, getScenePlainText(scenes.find(s => s.code === match.sceneCode)!));
            }
            let plainText = sceneCache.get(match.sceneCode)!;
            plainText = plainText.substring(0, match.index) + replaceText + plainText.substring(match.index + match.length);
            sceneCache.set(match.sceneCode, plainText);
        });

        sceneCache.forEach((plainText, sceneCode) => {
            const scene = scenes.find(s => s.code === sceneCode);
            if (scene) {
                const newBlocks = plainText.split('\n').map(line => ({ type: 'text', align: 'left', text: line }));
                scene.text = JSON.stringify({ blocks: newBlocks });
            }
        });
        
        setBackupData(newBackupData);
        setModificationsMade(true);
        setReviewModalOpen(false);
        showToast(`${reviewSelection.size} replacements made.`);
    };

    if (!backupData) {
        return (
            <div className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6">
                <div className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 p-6 animate-fade-in tool-section">
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">Find & Replace in Backup</h1>
                    <div className="max-w-md mx-auto">
                        <FileInput inputId="frBackupFile" label="Upload Backup File" accept=".json,.txt,.nov" onFileSelected={handleFileSelected} />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 text-center">Upload a backup file to begin.</p>
                    </div>
                </div>
            </div>
        );
    }

    const currentMatch = matches[currentMatchIndex];
    const preview = currentMatch ? (
        <>
            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate mb-2">{currentMatch.sceneTitle}</div>
            <div className="text-slate-600 dark:text-slate-400 leading-relaxed break-words">
                ...{getScenePlainText(backupData.revisions[0].scenes.find(s => s.code === currentMatch.sceneCode)!).substring(Math.max(0, currentMatch.index - CONTEXT_LENGTH), currentMatch.index)}
                <mark className="bg-primary-500/30 px-1 rounded">{currentMatch.text}</mark>
                {getScenePlainText(backupData.revisions[0].scenes.find(s => s.code === currentMatch.sceneCode)!).substring(currentMatch.index + currentMatch.length, currentMatch.index + currentMatch.length + CONTEXT_LENGTH)}...
            </div>
        </>
    ) : null;
    
    return (
        <div className="tool-section absolute inset-0 flex flex-col bg-slate-200 dark:bg-slate-900/80">
            <header className="flex-shrink-0 flex items-center justify-between p-2 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate px-2">{fileName}</h2>
                <div className="flex items-center gap-2">
                     <button onClick={handleDownload} disabled={!modificationsMade} className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-md transition-all disabled:opacity-60 disabled:cursor-not-allowed">Download</button>
                    <button onClick={handleClose} className="inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white shadow-md transition-all">Close</button>
                </div>
            </header>
             <main className="flex-grow overflow-y-auto p-4 md:p-8 flex justify-center bg-slate-50 dark:bg-slate-800">
                <div className="w-full max-w-2xl">
                    {matches.length > 0 ? (
                        <div className="p-4 bg-white dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-sm min-h-[8rem]">{preview}</div>
                    ) : (
                        <div className="text-center p-8 text-slate-500 dark:text-slate-400">{findPattern ? 'No results found.' : 'Enter a search term to begin.'}</div>
                    )}
                </div>
            </main>
            <footer className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-md border-t border-slate-300 dark:border-slate-700 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                <div className="max-w-4xl mx-auto space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-grow">
                             <input type="text" value={findPattern} onChange={e => setFindPattern(e.target.value)} placeholder="Find" className="w-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 pr-24 text-base text-slate-800 dark:text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
                             <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 pointer-events-none">
                                {matches.length > 0 ? `${currentMatchIndex + 1} of ${matches.length}` : 'No results'}
                            </div>
                        </div>
                        <button onClick={() => handleNavigate(-1)} disabled={currentMatchIndex <= 0} className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 w-10 h-10 rounded-md inline-flex items-center justify-center text-2xl transition-all hover:bg-primary-600 hover:text-white hover:border-primary-600 disabled:opacity-50" aria-label="Find Previous">‹</button>
                        <button onClick={() => handleNavigate(1)} disabled={currentMatchIndex >= matches.length - 1} className="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 w-10 h-10 rounded-md inline-flex items-center justify-center text-2xl transition-all hover:bg-primary-600 hover:text-white hover:border-primary-600 disabled:opacity-50" aria-label="Find Next">›</button>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="text" value={replaceText} onChange={e => setReplaceText(e.target.value)} placeholder="Replace with" className="flex-grow bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-base text-slate-800 dark:text-slate-200 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"/>
                        <button onClick={handleReplaceNext} disabled={matches.length === 0} className="flex-grow bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 h-10 rounded-md inline-flex items-center justify-center text-sm font-medium transition-all hover:bg-primary-600 hover:text-white hover:border-primary-600 disabled:opacity-50">Replace</button>
                        <button onClick={handleReviewReplaceAll} disabled={matches.length === 0} className="flex-grow bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 h-10 rounded-md inline-flex items-center justify-center text-sm font-medium transition-all hover:bg-primary-600 hover:text-white hover:border-primary-600 disabled:opacity-50">Replace All</button>
                    </div>
                    <div className="flex items-center justify-center pt-2">
                        <div className="flex justify-center bg-slate-100 dark:bg-slate-700 rounded-md p-1">
                            {Object.entries({useRegex: 'Regex', caseSensitive: 'Case-sensitive', wholeWord: 'Whole word'}).map(([key, label]) => (
                                <label key={key} className={`flex-1 flex justify-center px-3 py-1.5 transition-colors duration-200 rounded-md ${options[key as keyof typeof options] ? 'bg-primary-500/20' : ''}`} htmlFor={`fr-${key}`}>
                                    <input type="checkbox" id={`fr-${key}`} checked={options[key as keyof typeof options]} onChange={e => setOptions(o => ({ ...o, [key]: e.target.checked }))} className="hidden" />
                                    <span className={`text-sm font-medium ${options[key as keyof typeof options] ? 'text-primary-600' : 'text-slate-600 dark:text-slate-300'} whitespace-nowrap`}>{label}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </footer>

            {isReviewModalOpen && (
                <div className="absolute inset-0 bg-slate-100/70 dark:bg-black/70 backdrop-blur-sm z-40 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-300 dark:border-slate-700 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                        <header className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center flex-shrink-0">
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Review Changes</h2>
                            <button onClick={() => setReviewModalOpen(false)} className="text-2xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">&times;</button>
                        </header>
                        <div className="p-3 bg-slate-100 dark:bg-slate-900/50 flex-shrink-0">
                            <label className="flex items-center gap-2 text-slate-800 dark:text-slate-200 select-none cursor-pointer">
                                <input type="checkbox" checked={reviewSelection.size === reviewItems.length} onChange={e => setReviewSelection(e.target.checked ? new Set(reviewItems.map(i => i.id)) : new Set())} className="w-4 h-4 align-middle rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600" />
                                <span>{reviewSelection.size} of {reviewItems.length} selected</span>
                            </label>
                        </div>
                        <ul className="list-none p-0 m-0 overflow-y-auto flex-grow">
                            {reviewItems.map(item => (
                                <li key={item.id} className="p-3 border-b border-slate-200 dark:border-slate-700 last:border-b-0 text-sm">
                                    <div className="flex items-start gap-3">
                                        <input type="checkbox" id={`review-${item.id}`} checked={reviewSelection.has(item.id)} onChange={e => setReviewSelection(s => { const newSet = new Set(s); if (e.target.checked) newSet.add(item.id); else newSet.delete(item.id); return newSet; })} className="mt-1 w-4 h-4 rounded" />
                                        <label htmlFor={`review-${item.id}`} className="flex-1 cursor-pointer">
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">{item.sceneTitle}</div>
                                            <div className="text-slate-600 dark:text-slate-400 mt-1">{item.context}</div>
                                        </label>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <footer className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-4 flex-shrink-0">
                            <button onClick={() => setReviewModalOpen(false)} className="px-4 py-2 rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 dark:text-white">Cancel</button>
                            <button onClick={handleConfirmReplaceAll} className="px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white">Confirm Replacements</button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};
