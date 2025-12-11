import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { triggerDownload } from '../utils/helpers';
import { BackupData, BackupScene, FrMatch, FrReviewItem } from '../utils/types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import {
    Search, Replace, ChevronLeft, ChevronRight, X, Download,
    ArrowLeft, CaseSensitive, Regex, Type, BookOpen
} from 'lucide-react';
import { cn } from '../utils/cn';

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
                    <>...{preContext}<span className="bg-red-500/20 px-1 rounded mx-0.5 text-red-700 dark:text-red-300 decoration-slice line-through">{match.text}</span>{postContext}... </>
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
            .map((match, index) => ({ ...match, id: index }))
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
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in p-4 md:p-8">
                <PageHeader
                    title="Find & Replace in Backup"
                    description="Perform advanced text search and replacements across an entire novel backup file."
                />
                <Card>
                    <CardContent className="pt-6">
                        <FileInput inputId="frBackupFile" label="Upload Backup File" accept=".json,.txt,.nov" onFileSelected={handleFileSelected} />
                    </CardContent>
                </Card>
            </div>
        );
    }

    const currentMatch = matches[currentMatchIndex];
    const preview = currentMatch ? (
        <div className="animate-fade-in">
            <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-muted-foreground" />
                {currentMatch.sceneTitle}
            </h3>
            <div className="text-lg leading-relaxed font-serif text-foreground/80 whitespace-pre-wrap p-6 bg-muted/30 rounded-lg border border-border shadow-sm">
                ...{getScenePlainText(backupData.revisions[0].scenes.find(s => s.code === currentMatch.sceneCode)!).substring(Math.max(0, currentMatch.index - CONTEXT_LENGTH), currentMatch.index)}
                <mark className="bg-primary/30 text-primary-foreground px-1 rounded font-bold border-b-2 border-primary mx-0.5">{currentMatch.text}</mark>
                {getScenePlainText(backupData.revisions[0].scenes.find(s => s.code === currentMatch.sceneCode)!).substring(currentMatch.index + currentMatch.length, currentMatch.index + currentMatch.length + CONTEXT_LENGTH)}...
            </div>
        </div>
    ) : null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            {/* Header */}
            <header className="flex-shrink-0 h-16 border-b border-border bg-background/80 backdrop-blur px-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={handleClose}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex flex-col">
                        <h2 className="font-semibold text-sm md:text-base leading-tight">{fileName}</h2>
                        <span className="text-xs text-muted-foreground">Find & Replace Mode</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        onClick={handleDownload}
                        disabled={!modificationsMade}
                        variant={modificationsMade ? "default" : "secondary"}
                        size="sm"
                    >
                        <Download className="mr-2 h-4 w-4" /> Save Changes
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleClose}>
                        Close
                    </Button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-3xl h-full flex flex-col">
                    {findPattern ? (
                        <div className="flex-1 overflow-y-auto p-4 md:p-8 flex items-center justify-center">
                            {matches.length > 0 ? (
                                preview
                            ) : (
                                <div className="text-center text-muted-foreground">
                                    <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                                    <p>No matches found for "{findPattern}"</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                            <Search className="h-16 w-16 mb-4 opacity-10" />
                            <p className="text-lg">Enter a search term below to begin.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Bottom Control Panel */}
            <footer className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-all">
                <div className="max-w-3xl mx-auto space-y-4">
                    {/* Search Row */}
                    <div className="flex gap-2 relative">
                        <div className="relative flex-grow">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={findPattern}
                                onChange={e => setFindPattern(e.target.value)}
                                placeholder="Find text..."
                                className="pl-9 pr-28"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-background px-1">
                                {matches.length > 0 ? `${currentMatchIndex + 1} / ${matches.length}` : '0 results'}
                            </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <Button variant="outline" size="icon" onClick={() => handleNavigate(-1)} disabled={currentMatchIndex <= 0}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => handleNavigate(1)} disabled={currentMatchIndex >= matches.length - 1}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Replace Row */}
                    <div className="flex gap-2">
                        <div className="relative flex-grow">
                            <Replace className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                value={replaceText}
                                onChange={e => setReplaceText(e.target.value)}
                                placeholder="Replace with..."
                                className="pl-9"
                            />
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Button onClick={handleReplaceNext} disabled={matches.length === 0} variant="secondary">
                                Replace
                            </Button>
                            <Button onClick={handleReviewReplaceAll} disabled={matches.length === 0}>
                                Replace All
                            </Button>
                        </div>
                    </div>

                    {/* Options Row */}
                    <div className="flex justify-center gap-2 pt-1 border-t border-border/50 mt-2">
                        <Button
                            variant={options.useRegex ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setOptions(o => ({ ...o, useRegex: !o.useRegex }))}
                            className="h-8 text-xs gap-1.5"
                        >
                            <Regex className="h-3 w-3" /> Regex
                        </Button>
                        <Button
                            variant={options.caseSensitive ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setOptions(o => ({ ...o, caseSensitive: !o.caseSensitive }))}
                            className="h-8 text-xs gap-1.5"
                        >
                            <CaseSensitive className="h-4 w-4" /> Case Sensitive
                        </Button>
                        <Button
                            variant={options.wholeWord ? "default" : "ghost"}
                            size="sm"
                            onClick={() => setOptions(o => ({ ...o, wholeWord: !o.wholeWord }))}
                            className="h-8 text-xs gap-1.5"
                        >
                            <Type className="h-3 w-3" /> Whole Word
                        </Button>
                    </div>
                </div>
            </footer>

            {/* Review Modal */}
            {isReviewModalOpen && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <Card className="w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-in">
                        <CardContent className="p-0 flex flex-col h-full overflow-hidden">
                            <div className="p-4 border-b flex justify-between items-center bg-muted/20">
                                <h3 className="font-semibold text-lg">Review Replacements</h3>
                                <Button variant="ghost" size="icon" onClick={() => setReviewModalOpen(false)}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            <div className="p-2 border-b bg-muted/50 text-sm flex justify-between items-center">
                                <label className="flex items-center gap-2 cursor-pointer select-none px-2 py-1 rounded hover:bg-muted">
                                    <input
                                        type="checkbox"
                                        checked={reviewSelection.size === reviewItems.length}
                                        onChange={e => setReviewSelection(e.target.checked ? new Set(reviewItems.map(i => i.id)) : new Set())}
                                        className="rounded border-primary text-primary focus:ring-primary"
                                    />
                                    <span>Select All ({reviewItems.length})</span>
                                </label>
                                <span className="text-muted-foreground px-2">{reviewSelection.size} selected</span>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                <ul className="divide-y">
                                    {reviewItems.map(item => (
                                        <li key={item.id} className="p-4 hover:bg-muted/30 transition-colors">
                                            <div className="flex gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={reviewSelection.has(item.id)}
                                                    onChange={e => setReviewSelection(s => { const newSet = new Set(s); if (e.target.checked) newSet.add(item.id); else newSet.delete(item.id); return newSet; })}
                                                    className="mt-1 w-4 h-4 rounded border-primary text-primary focus:ring-primary shrink-0"
                                                />
                                                <div
                                                    className="flex-grow cursor-pointer"
                                                    onClick={() => setReviewSelection(s => { const newSet = new Set(s); if (!s.has(item.id)) newSet.add(item.id); else newSet.delete(item.id); return newSet; })}
                                                >
                                                    <div className="font-medium text-sm mb-1 text-primary">{item.sceneTitle}</div>
                                                    <div className="text-sm text-muted-foreground leading-relaxed font-serif">
                                                        {item.context}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="p-4 border-t bg-muted/20 flex justify-end gap-3">
                                <Button variant="outline" onClick={() => setReviewModalOpen(false)}>Cancel</Button>
                                <Button onClick={handleConfirmReplaceAll}>
                                    Confirm {reviewSelection.size} Replacements
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};