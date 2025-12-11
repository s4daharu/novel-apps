import React, { useState, useRef, useCallback, memo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip, escapeHTML } from '../utils/helpers';
import { generateEpubBlob } from '../utils/epubGenerator';
import { Status } from '../utils/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';
import {
    Download, Upload, FileText, CheckSquare, Square, Trash2,
    GripVertical, RefreshCw, Settings, FolderArchive, Book
} from 'lucide-react';

const EpubToZip: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [epubFile, setEpubFile] = useState<File | null>(null);
    type ChapterInfo = { title: string; href: string; id: string; originalIndex: number; };
    const [chapters, setChapters] = useState<ChapterInfo[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [enableRemoveLines, setEnableRemoveLines] = useState(false);
    const [linesToRemove, setLinesToRemove] = useState(1);
    const [status, setStatus] = useState<Status | null>(null);
    const zipInstanceRef = useRef<any | null>(null);
    const fileNameRef = useRef('');

    const resetUI = () => {
        setStatus(null);
        setEpubFile(null);
        setChapters([]);
        setSelectedIndices(new Set());
        zipInstanceRef.current = null;
    };

    const handleFileSelected = async (files: FileList) => {
        resetUI();
        const file = files[0];
        setEpubFile(file);

        if (!file || !file.name.toLowerCase().endsWith('.epub')) {
            setStatus({ message: 'Error: Please select a valid .epub file.', type: 'error' });
            return;
        }

        fileNameRef.current = file.name;
        setStatus({ message: `Reading ${file.name}...`, type: 'info' });
        showSpinner();

        try {
            const JSZip = await getJSZip();
            const buffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(buffer);
            zipInstanceRef.current = zip;

            const chapterList = await getChapterListFromEpub(zip);
            if (chapterList.length > 0) {
                setChapters(chapterList);
                setSelectedIndices(new Set(chapterList.map(c => c.originalIndex)));
                setStatus({ message: `Found ${chapterList.length} chapters.`, type: 'success' });
                showToast(`Found ${chapterList.length} chapters.`);
            } else {
                setStatus({ message: 'No chapters found or ToC is unparsable.', type: 'warning' });
                showToast('No chapters found in EPUB.', true);
            }
        } catch (err: any) {
            console.error("EPUB parsing Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error parsing EPUB: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    const getChapterListFromEpub = async (zip: any): Promise<ChapterInfo[]> => {
        const domParser = new DOMParser();
        const readFileFromZip = (path: string) => zip.file(path)?.async('string');
        const parseXml = (xml: string) => domParser.parseFromString(xml, 'application/xml');
        const resolvePath = (rel: string, base: string) => new URL(rel, `http://localhost/${base}`).pathname.substring(1);

        const containerXml = await readFileFromZip('META-INF/container.xml');
        if (!containerXml) throw new Error("Could not find EPUB's container.xml.");
        const opfPath = parseXml(containerXml).querySelector('rootfile')?.getAttribute('full-path');
        if (!opfPath) throw new Error("Could not find OPF path in container.xml.");

        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
        const opfContent = await readFileFromZip(opfPath);
        if (!opfContent) throw new Error(`Could not read OPF file at ${opfPath}`);
        const opfDoc = parseXml(opfContent);

        const tocItem = opfDoc.querySelector('manifest > item[properties~="nav"]') || opfDoc.querySelector(`manifest > item[id="${opfDoc.querySelector('spine[toc]')?.getAttribute('toc')}"]`);
        if (!tocItem || !tocItem.getAttribute('href')) throw new Error("No standard Table of Contents (NAV/NCX) found.");

        const tocPath = resolvePath(tocItem.getAttribute('href')!, opfDir);
        const tocContent = await readFileFromZip(tocPath);
        if (!tocContent) throw new Error(`ToC file not found at ${tocPath}`);
        const tocDoc = parseXml(tocContent);

        const isNav = !!tocDoc.querySelector('nav[epub\\:type="toc"], nav[*|type="toc"]');
        const chapterElements = isNav ? tocDoc.querySelectorAll('nav[epub\\:type="toc"] ol a, nav[*|type="toc"] ol a') : tocDoc.querySelectorAll('navPoint');

        const chapterList = Array.from(chapterElements).map((el, index) => {
            const label = isNav ? el.textContent?.trim() : el.querySelector('navLabel > text')?.textContent?.trim();
            const srcAttr = isNav ? el.getAttribute('href') : el.querySelector('content')?.getAttribute('src');
            if (label && srcAttr) {
                return {
                    title: label,
                    href: resolvePath(srcAttr.split('#')[0], opfDir),
                    id: `epubzip-chap-${index}`,
                    originalIndex: index
                };
            }
            return null;
        }).filter((c): c is ChapterInfo => c !== null);

        return [...new Map(chapterList.map(item => [item.href, item])).values()];
    };

    const extractTextFromHtml = (htmlString: string): string => {
        const domParser = new DOMParser();
        const doc = domParser.parseFromString(htmlString, 'text/html');
        if (!doc.body) return '';

        function convertNodeToText(node: Node): string {
            let text = '';
            if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
            if (node.nodeType !== Node.ELEMENT_NODE) return '';

            const element = node as Element;
            const tagName = element.tagName.toLowerCase();

            if (['script', 'style', 'header', 'footer', 'nav'].includes(tagName)) {
                return '';
            }

            const isBlock = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'br', 'hr'].includes(tagName);

            if (isBlock) text += '\n';
            for (const child of Array.from(node.childNodes)) {
                text += convertNodeToText(child);
            }
            if (isBlock) text += '\n';

            return text;
        }
        let rawText = convertNodeToText(doc.body);
        return rawText.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n\n');
    };

    const handleExtract = async () => {
        setStatus(null);
        if (selectedIndices.size === 0) {
            return setStatus({ message: "No chapters selected to extract.", type: 'error' });
        }
        if (!zipInstanceRef.current) {
            return setStatus({ message: "EPUB file not loaded.", type: 'error' });
        }

        showSpinner();
        try {
            const JSZip = await getJSZip();
            const outputZip = new JSZip();
            const BOM = "\uFEFF";
            let filesAdded = 0;

            const chaptersToExtract = chapters.filter(c => selectedIndices.has(c.originalIndex));

            for (const chapter of chaptersToExtract) {
                const chapterHtml = await zipInstanceRef.current.file(chapter.href)?.async('string');
                if (!chapterHtml) continue;

                let chapterText = extractTextFromHtml(chapterHtml);
                if (enableRemoveLines && linesToRemove > 0) {
                    chapterText = chapterText.split('\n').slice(linesToRemove).join('\n');
                }

                if (chapterText.trim()) {
                    const filename = `${String(filesAdded + 1).padStart(4, '0')}_${chapter.title.replace(/[^\p{L}\p{N}._-]+/gu, '_')}.txt`;
                    outputZip.file(filename, BOM + chapterText);
                    filesAdded++;
                }
            }

            if (filesAdded > 0) {
                setStatus({ message: `Generating ZIP with ${filesAdded} chapters...`, type: 'info' });
                const zipBlob = await outputZip.generateAsync({ type: "blob" });
                const baseName = fileNameRef.current.replace(/\.epub$/i, '') || 'epub_content';
                triggerDownload(zipBlob, `${baseName}_chapters.zip`);
                setStatus({ message: `Download started for ${filesAdded} chapters.`, type: 'success' });
            } else {
                setStatus({ message: "No chapter content retrieved.", type: 'warning' });
            }
        } catch (err: any) {
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <Card>
                <CardHeader>
                    <CardTitle>Source EPUB</CardTitle>
                </CardHeader>
                <CardContent>
                    <FileInput inputId="epubUploadForTxt" label="Upload EPUB File" accept=".epub" onFileSelected={handleFileSelected} onFileCleared={resetUI} />
                </CardContent>
            </Card>

            {chapters.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle>Select Chapters</CardTitle>
                            <p className="text-sm text-muted-foreground">{selectedIndices.size} of {chapters.length} selected</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedIndices(new Set(chapters.map(c => c.originalIndex)))}>Select All</Button>
                            <Button variant="outline" size="sm" onClick={() => setSelectedIndices(new Set())}>Clear</Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-64 overflow-y-auto border rounded-md p-1">
                            {chapters.map(c => {
                                const isSelected = selectedIndices.has(c.originalIndex);
                                return (
                                    <div
                                        key={c.id}
                                        className={cn(
                                            "flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors",
                                            isSelected ? "bg-accent/50" : ""
                                        )}
                                        onClick={() => setSelectedIndices(p => { const s = new Set(p); isSelected ? s.delete(c.originalIndex) : s.add(c.originalIndex); return s; })}
                                    >
                                        <div className={cn("flex-shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}>
                                            {isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                                        </div>
                                        <span className="text-sm truncate">{c.title}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 pt-4 border-t space-y-4">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="checkbox"
                                    id="removeLinesCheck"
                                    checked={enableRemoveLines}
                                    onChange={e => setEnableRemoveLines(e.target.checked)}
                                    className="rounded border-input text-primary focus:ring-primary"
                                />
                                <Label htmlFor="removeLinesCheck" className="font-normal cursor-pointer">Remove initial lines from extracted text</Label>
                            </div>

                            {enableRemoveLines && (
                                <div className="flex items-center gap-2 pl-6">
                                    <Label htmlFor="linesToRemove" className="text-xs">Line count:</Label>
                                    <Input
                                        type="number"
                                        id="linesToRemove"
                                        min="0"
                                        value={linesToRemove}
                                        onChange={e => setLinesToRemove(parseInt(e.target.value, 10))}
                                        className="h-8 w-20"
                                    />
                                </div>
                            )}
                        </div>
                    </CardContent>
                    <CardFooter className="justify-center border-t pt-6">
                        <Button onClick={handleExtract} disabled={!epubFile || chapters.length === 0} size="lg" className="w-full md:w-auto min-w-[200px]">
                            <Download className="mr-2 h-4 w-4" /> Extract to ZIP
                        </Button>
                    </CardFooter>
                </Card>
            )}
            <StatusMessage status={status} />
        </div>
    );
};

type Chapter = { name: string; content: string; title: string; };

// Memoized chapter list item
const ChapterListItem = memo(({
    chapter,
    index,
    onTitleChange,
    onDragStart,
    onDragEnter,
    onDragEnd
}: {
    chapter: Chapter;
    index: number;
    onTitleChange: (index: number, title: string) => void;
    onDragStart: () => void;
    onDragEnter: () => void;
    onDragEnd: () => void;
}) => (
    <li
        onDragEnter={onDragEnter}
        onDragOver={e => e.preventDefault()}
        className="flex items-center gap-2 p-2 border-b last:border-0 hover:bg-accent/50 transition-colors group"
    >
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            className="p-2 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            title="Drag to reorder"
        >
            <GripVertical className="h-4 w-4" />
        </div>
        <span className="text-xs text-muted-foreground w-6 text-center">{index + 1}.</span>
        <Input
            value={chapter.title}
            onChange={e => onTitleChange(index, e.target.value)}
            className="h-8 text-sm"
        />
    </li>
));
ChapterListItem.displayName = 'ChapterListItem';

const ZipToEpub: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [epubTitle, setEpubTitle] = useState('');
    const [epubLang, setEpubLang] = useState('en');
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [status, setStatus] = useState<Status | null>(null);
    const [showBatchRename, setShowBatchRename] = useState(false);
    const [renamePattern, setRenamePattern] = useState('Chapter {n}');
    const [renameStartNum, setRenameStartNum] = useState(1);
    const draggedItemIndex = useRef<number | null>(null);
    const draggedOverItemIndex = useRef<number | null>(null);

    const resetUI = () => {
        setZipFile(null);
        setChapters([]);
        setStatus(null);
    };

    const handleFileSelected = async (files: FileList) => {
        resetUI();
        const file = files[0];
        setZipFile(file);
        setEpubTitle(file.name.replace(/\.zip$/i, ''));
        setStatus({ message: `Reading ${file.name}...`, type: 'info' });
        showSpinner();
        try {
            const JSZip = await getJSZip();
            const zip = await JSZip.loadAsync(file);
            const chapterPromises = zip.file(/.txt$/i).map((file: any) =>
                file.async('string').then((text: string) => ({
                    name: file.name,
                    content: text,
                    title: file.name.replace(/\.txt$/i, '').replace(/^[0-9\s._-]+/, '').replace(/[_-]/g, ' ').trim() || 'Untitled'
                }))
            );
            const loadedChapters = (await Promise.all(chapterPromises))
                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (loadedChapters.length === 0) throw new Error("No .txt files found in ZIP.");
            setChapters(loadedChapters);
            setStatus({ message: `Found ${loadedChapters.length} chapters.`, type: 'success' });
        } catch (err: any) {
            setStatus({ message: `Error reading ZIP: ${err.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    const handleChapterTitleChange = useCallback((index: number, newTitle: string) => {
        setChapters(prev => {
            const newChapters = [...prev];
            newChapters[index] = { ...newChapters[index], title: newTitle };
            return newChapters;
        });
    }, []);

    const handleBatchRename = () => {
        let counter = renameStartNum;
        setChapters(prev => prev.map(chapter => ({
            ...chapter,
            title: renamePattern.replace('{n}', String(counter++)).replace('{title}', chapter.title)
        })));
        setShowBatchRename(false);
        showToast(`Renamed ${chapters.length} chapters`);
    };

    const handleCreateEpub = async () => {
        setStatus(null);
        if (chapters.length === 0) return setStatus({ message: "No chapters loaded.", type: 'error' });
        if (!epubTitle) return setStatus({ message: "EPUB Title is required.", type: 'error' });

        showSpinner();
        try {
            const JSZip = await getJSZip();
            let coverImageData: ArrayBuffer | undefined;
            let coverImageExt: string | undefined;
            if (coverFile) {
                coverImageData = await coverFile.arrayBuffer();
                coverImageExt = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
            }

            const epubBlob = await generateEpubBlob(
                JSZip,
                chapters.map(c => ({ title: c.title, content: c.content })),
                { title: epubTitle, language: epubLang, coverImageData, coverImageExt }
            );

            triggerDownload(epubBlob, `${epubTitle.replace(/[^a-z0-9]/gi, '_')}.epub`);
            setStatus({ message: "EPUB created successfully!", type: 'success' });
        } catch (err: any) {
            setStatus({ message: `Error creating EPUB: ${err.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    const handleDragSort = () => {
        if (draggedItemIndex.current === null || draggedOverItemIndex.current === null) return;
        const items = [...chapters];
        const draggedItemContent = items.splice(draggedItemIndex.current, 1)[0];
        items.splice(draggedOverItemIndex.current, 0, draggedItemContent);
        draggedItemIndex.current = null;
        draggedOverItemIndex.current = null;
        setChapters(items);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <Card>
                <CardHeader>
                    <CardTitle>Source Files</CardTitle>
                </CardHeader>
                <CardContent>
                    <FileInput inputId="zipUpload" label="Upload ZIP with .txt Chapters" accept=".zip" onFileSelected={handleFileSelected} onFileCleared={resetUI} />
                </CardContent>
            </Card>

            {chapters.length > 0 && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle>Chapter Organization</CardTitle>
                            <p className="text-sm text-muted-foreground">Drag to reorder • {chapters.length} chapters</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setShowBatchRename(true)}>
                            Batch Rename
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <ul className="max-h-64 overflow-y-auto border rounded-md">
                            {chapters.map((chap, index) => (
                                <ChapterListItem
                                    key={chap.name}
                                    chapter={chap}
                                    index={index}
                                    onTitleChange={handleChapterTitleChange}
                                    onDragStart={() => (draggedItemIndex.current = index)}
                                    onDragEnter={() => (draggedOverItemIndex.current = index)}
                                    onDragEnd={handleDragSort}
                                />
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Metadata</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="epubTitle">EPUB Title</Label>
                            <Input id="epubTitle" value={epubTitle} onChange={e => setEpubTitle(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="epubLang">Language Code</Label>
                            <Input id="epubLang" value={epubLang} onChange={e => setEpubLang(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Cover Image (Optional)</Label>
                        <FileInput inputId="coverUpload" label="Upload Cover Image" accept="image/jpeg,image/png" onFileSelected={files => setCoverFile(files[0])} onFileCleared={() => setCoverFile(null)} />
                    </div>
                </CardContent>
                <CardFooter className="justify-center border-t pt-6">
                    <Button onClick={handleCreateEpub} disabled={chapters.length === 0} size="lg" className="w-full md:w-auto min-w-[200px]">
                        <Book className="mr-2 h-4 w-4" /> Create EPUB
                    </Button>
                </CardFooter>
            </Card>

            {/* Batch Rename Modal */}
            {showBatchRename && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-md shadow-lg animate-scale-in">
                        <CardHeader>
                            <CardTitle>Batch Rename Chapters</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Pattern</Label>
                                <Input
                                    value={renamePattern}
                                    onChange={e => setRenamePattern(e.target.value)}
                                    placeholder="Chapter {n}"
                                />
                                <p className="text-xs text-muted-foreground">{'{n}'} = number, {'{title}'} = current title</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Start Number</Label>
                                <Input
                                    type="number"
                                    value={renameStartNum}
                                    onChange={e => setRenameStartNum(parseInt(e.target.value) || 1)}
                                    min="1"
                                />
                            </div>
                            <div className="p-2 bg-muted rounded text-sm">
                                Preview: <span className="font-mono">{renamePattern.replace('{n}', String(renameStartNum)).replace('{title}', 'Title')}</span>
                            </div>
                        </CardContent>
                        <CardFooter className="justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowBatchRename(false)}>Cancel</Button>
                            <Button onClick={handleBatchRename}>Rename All</Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
            <StatusMessage status={status} />
        </div>
    );
};

export const ZipEpub: React.FC = () => {
    const [mode, setMode] = useState<'zipToEpub' | 'epubToZip'>('zipToEpub');

    return (
        <div id="zipEpubApp" className="max-w-4xl mx-auto space-y-6 animate-fade-in p-4 md:p-8">
            <PageHeader
                title="ZIP ↔ EPUB Converter"
                description="Convert between ZIP archives of chapter files and EPUB books."
            />

            <div className="flex justify-center mb-8">
                <div className="bg-muted p-1 rounded-lg inline-flex">
                    <Button
                        variant={mode === 'zipToEpub' ? 'default' : 'ghost'}
                        onClick={() => setMode('zipToEpub')}
                        className="w-40"
                    >
                        ZIP → EPUB
                    </Button>
                    <Button
                        variant={mode === 'epubToZip' ? 'default' : 'ghost'}
                        onClick={() => setMode('epubToZip')}
                        className="w-40"
                    >
                        EPUB → ZIP
                    </Button>
                </div>
            </div>

            <div key={mode} className="animate-fade-in">
                {mode === 'zipToEpub' ? <ZipToEpub /> : <EpubToZip />}
            </div>
        </div>
    );
};