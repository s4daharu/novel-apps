import React, { useState, useEffect } from 'react';
import { PDFDocument as PDFLibDoc, rgb, PageSizes, PDFString, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import * as fontkit from 'fontkit';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip, getFonts, escapeHTML } from '../utils/helpers';
import { Status } from '../utils/types';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Label } from '../components/ui/Label';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';

// Extended type definition for PDFDocument to include registerFontkit
type PDFDocument = PDFLibDoc & {
    registerFontkit: (fk: any) => void;
};

export const EpubSplitter: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();

    // Component State
    const [epubFile, setEpubFile] = useState<File | null>(null);
    const [parsedChapters, setParsedChapters] = useState<{ index: number; title: string; text: string }[]>([]);
    const [status, setStatus] = useState<Status | null>(null);

    // Form Inputs State
    const [outputFormat, setOutputFormat] = useState<'zip-txt' | 'zip-pdf' | 'single-txt' | 'single-pdf'>('zip-txt');
    const [mode, setMode] = useState<'single' | 'grouped'>('single');
    const [chapterPattern, setChapterPattern] = useState('Chapter ');
    const [startNumber, setStartNumber] = useState(1);
    const [startChapterIndex, setStartChapterIndex] = useState(0);
    const [endChapterIndex, setEndChapterIndex] = useState(0);
    const [groupSize, setGroupSize] = useState(4);
    const [pdfFontSize, setPdfFontSize] = useState(14);
    const [useFirstLineAsHeading, setUseFirstLineAsHeading] = useState(false);
    const [isFormattingOptionsOpen, setFormattingOptionsOpen] = useState(false);

    // Handlers for chapter range selection
    const handleStartChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStartIndex = parseInt(e.target.value, 10);
        setStartChapterIndex(newStartIndex);
        if (newStartIndex > endChapterIndex) {
            setEndChapterIndex(newStartIndex);
        }
    };

    const handleEndChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newEndIndex = parseInt(e.target.value, 10);
        setEndChapterIndex(newEndIndex);
        if (newEndIndex < startChapterIndex) {
            setStartChapterIndex(newEndIndex);
        }
    };

    const getFirstLinePreview = (text: string) => {
        if (!text) return '';
        const firstLine = text.split('\n')[0].trim();
        if (firstLine) {
            const truncated = firstLine.length > 60 ? `${firstLine.substring(0, 60)}...` : firstLine;
            return ` - "${truncated}"`;
        }
        return '';
    };

    const resetChapterSelection = () => {
        setParsedChapters([]);
        setStartChapterIndex(0);
        setEndChapterIndex(0);
    };

    const handleFileSelected = async (files: FileList) => {
        const file = files[0];
        setEpubFile(file);
        resetChapterSelection();
        setStatus(null);

        if (!file) return;

        showSpinner();
        try {
            const buffer = await file.arrayBuffer();
            const JSZip = await getJSZip();
            const epub = await JSZip.loadAsync(buffer);

            const containerXml = await epub.file('META-INF/container.xml').async('text');
            const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
            const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
            if (!opfPath) throw new Error("Could not find OPF file path in container.xml");

            const opfContent = await epub.file(opfPath).async('text');
            const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
            const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

            const manifestItems: Record<string, string> = {};
            opfDoc.querySelectorAll('manifest > item').forEach((item: Element) => {
                const id = item.getAttribute('id');
                const href = item.getAttribute('href');
                if (id && href) manifestItems[id] = href;
            });

            const spineItems: string[] = [];
            opfDoc.querySelectorAll('spine > itemref').forEach((itemref: Element) => {
                const idref = itemref.getAttribute('idref');
                if (idref) {
                    const href = manifestItems[idref];
                    if (href && !href.includes('toc') && !href.includes('nav')) {
                        spineItems.push(opfBasePath + href);
                    }
                }
            });

            const tempChapters: { title: string; text: string }[] = [];
            const parser = new DOMParser();

            const extractChapterContent = (doc_element: Element): string => {
                function convertNodeToText(node: Node): string {
                    let text = '';
                    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
                    if (node.nodeType !== Node.ELEMENT_NODE) return '';

                    const tagName = (node as Element).tagName.toLowerCase();
                    if (['h1', 'h2', 'h3', 'script', 'style', 'header', 'footer', 'nav'].includes(tagName)) return '';

                    const isBlock = ['p', 'div', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'br', 'hr'].includes(tagName);

                    if (isBlock) text += '\n';
                    for (const child of Array.from(node.childNodes)) text += convertNodeToText(child);
                    if (isBlock) text += '\n';

                    return text;
                }
                let rawText = convertNodeToText(doc_element.cloneNode(true));
                return rawText.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n\n');
            };

            for (const spinePath of spineItems) {
                const file = epub.file(spinePath);
                if (!file) continue;

                const content = await file.async('text');
                let doc = parser.parseFromString(content, 'application/xhtml+xml');
                if (doc.querySelector("parsererror")) {
                    doc = parser.parseFromString(content, 'text/html');
                }

                const chapterSections = doc.querySelectorAll('section[epub\\:type="chapter"], section[*|type="chapter"]');
                if (chapterSections.length > 0) {
                    chapterSections.forEach((section: Element) => {
                        const titleEl = section.querySelector('h1, h2, h3');
                        const title = titleEl ? titleEl.textContent?.trim() : `Chapter ${tempChapters.length + 1}`;
                        const text = extractChapterContent(section);
                        if (text && title) tempChapters.push({ title, text });
                    });
                } else if (doc.body) {
                    const titleEl = doc.body.querySelector('h1, h2, h3, title');
                    const title = titleEl ? titleEl.textContent?.trim() : `Chapter ${tempChapters.length + 1}`;
                    const text = extractChapterContent(doc.body);
                    if (text && title) tempChapters.push({ title, text });
                }
            }

            const chapters = tempChapters.map((chap, index) => ({ index, title: chap.title, text: chap.text }));
            setParsedChapters(chapters);
            setStartChapterIndex(0);
            if (chapters.length > 0) {
                setEndChapterIndex(chapters.length - 1);
                showToast(`Found ${chapters.length} chapters.`);
            } else {
                setEndChapterIndex(0);
                showToast('No chapters found. Check EPUB structure.', true);
                setStatus({ message: 'Error: No chapters found.', type: 'error' });
            }

        } catch (err: any) {
            console.error("EPUB parsing failed:", err);
            showToast(`Error parsing EPUB: ${err.message}`, true);
            setStatus({ message: `Error: ${err.message || 'Could not parse EPUB.'}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    const handleSplit = async () => {
        setStatus(null);
        if (parsedChapters.length === 0) {
            showToast("No chapters available to process.", true);
            setStatus({ message: 'Error: No chapters available to process.', type: 'error' });
            return;
        }

        if (isNaN(startNumber) || startNumber < 1) {
            setStatus({ message: 'Error: Start Number must be 1 or greater.', type: 'error' });
            return;
        }

        if (mode === 'grouped' && (isNaN(groupSize) || groupSize < 1)) {
            setStatus({ message: 'Error: Chapters per File must be 1 or greater.', type: 'error' });
            return;
        }

        hideSpinner();

        try {
            const chaptersToProcess = parsedChapters.slice(startChapterIndex, endChapterIndex + 1);

            if (chaptersToProcess.length === 0) {
                throw new Error(`The selected range resulted in no chapters to process.`);
            }

            switch (outputFormat) {
                case 'zip-pdf':
                    await generatePdfZip(chaptersToProcess, pdfFontSize);
                    break;
                case 'single-pdf':
                    await generateSinglePdf(chaptersToProcess, pdfFontSize);
                    break;
                case 'single-txt':
                    await generateSingleTxt(chaptersToProcess);
                    break;
                case 'zip-txt':
                default:
                    await generateTxtZip(chaptersToProcess);
                    break;
            }

            if (!status || status.type !== 'error') {
                const outputDescriptions: Record<typeof outputFormat, string> = {
                    'zip-txt': '.txt files in a ZIP archive',
                    'zip-pdf': 'PDFs in a ZIP file',
                    'single-txt': 'a single .txt file',
                    'single-pdf': 'a single .pdf file'
                };

                setStatus({ message: `Extracted ${chaptersToProcess.length} chapter(s) as ${outputDescriptions[outputFormat]}. Download started.`, type: 'success' });
                showToast(`Extracted ${chaptersToProcess.length} chapter(s).`);
            }

        } catch (err: any) {
            console.error("EPUB Splitter Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error splitting EPUB: ${err.message}`, true);
        }
    };

    const generateTxtZip = async (chaptersToProcess: typeof parsedChapters) => {
        showSpinner();
        const JSZip = await getJSZip();
        const zip = new JSZip();
        const BOM = "\uFEFF";

        if (mode === 'single') {
            chaptersToProcess.forEach((chapter, i) => {
                const chapNum = String(startNumber + i).padStart(2, '0');
                zip.file(`${chapterPattern}${chapNum}.txt`, BOM + chapter.text);
            });
        } else { // grouped
            for (let i = 0; i < chaptersToProcess.length; i += groupSize) {
                const group = chaptersToProcess.slice(i, i + groupSize);
                const groupStartNum = startNumber + i;
                const groupEndNum = groupStartNum + group.length - 1;
                const name = group.length === 1
                    ? `${chapterPattern}${String(groupStartNum).padStart(2, '0')}.txt`
                    : `${chapterPattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}.txt`;

                const content = group.map(c => c.text).join('\n\n\n---------------- END ----------------\n\n\n');
                zip.file(name, BOM + content);
            }
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(blob, `${chapterPattern.trim()}_chapters.zip`);
        hideSpinner();
    };

    const generatePdfZip = async (chaptersToProcess: typeof parsedChapters, fontSize: number) => {
        setStatus({ message: 'Loading fonts...', type: 'info' });
        const fontBytes = await getFonts();
        const JSZip = await getJSZip();
        const zip = new JSZip();

        const chaptersForPdf = chaptersToProcess.map(chapter => {
            if (useFirstLineAsHeading) {
                const lines = chapter.text.split('\n');
                const title = lines.shift()?.trim() || chapter.title;
                const text = lines.join('\n').trim();
                return { ...chapter, title, text };
            }
            return chapter;
        });

        if (mode === 'single') {
            for (let i = 0; i < chaptersForPdf.length; i++) {
                setStatus({ message: `Generating PDF for chapter ${i + 1} of ${chaptersForPdf.length}...`, type: 'info' });
                await new Promise(resolve => setTimeout(resolve, 0));
                const chapter = chaptersForPdf[i];
                const chapNum = String(startNumber + i).padStart(2, '0');
                const pdfBytes = await createPdfFromChapters([chapter], fontBytes, fontSize);
                zip.file(`${chapterPattern}${chapNum}.pdf`, pdfBytes);
            }
        } else { // grouped
            for (let i = 0; i < chaptersForPdf.length; i += groupSize) {
                setStatus({ message: `Generating PDF for group starting at chapter ${i + 1}...`, type: 'info' });
                await new Promise(resolve => setTimeout(resolve, 0));
                const group = chaptersForPdf.slice(i, i + groupSize);
                const groupStartNum = startNumber + i;
                const groupEndNum = groupStartNum + group.length - 1;

                const name = group.length === 1
                    ? `${chapterPattern}${String(groupStartNum).padStart(2, '0')}.pdf`
                    : `${chapterPattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}.pdf`;

                const pdfBytes = await createPdfFromChapters(group, fontBytes, fontSize);
                zip.file(name, pdfBytes);
            }
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(blob, `${chapterPattern.trim()}_chapters_pdf.zip`);
    };

    const generateSinglePdf = async (chaptersToProcess: typeof parsedChapters, fontSize: number) => {
        setStatus({ message: 'Loading fonts...', type: 'info' });
        const fontBytes = await getFonts();

        const chaptersForPdf = chaptersToProcess.map(chapter => {
            if (useFirstLineAsHeading) {
                const lines = chapter.text.split('\n');
                const title = lines.shift()?.trim() || chapter.title;
                const text = lines.join('\n').trim();
                return { ...chapter, title, text };
            }
            return chapter;
        });

        setStatus({ message: 'Generating single PDF (this may take a moment)...', type: 'info' });
        const pdfBytes = await createPdfFromChapters(chaptersForPdf, fontBytes, fontSize, (progress) => {
            setStatus({ message: `Processing chapter ${progress.current} of ${progress.total} for PDF...`, type: 'info' });
        });

        const fileNameBase = epubFile?.name.replace(/\.epub$/i, '') || 'novel';
        triggerDownload(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), `${fileNameBase}.pdf`);

    };

    const generateSingleTxt = async (chaptersToProcess: typeof parsedChapters) => {
        showSpinner();
        const BOM = "\uFEFF";
        const content = chaptersToProcess.map((chapter, i) => {
            const title = `${chapterPattern}${startNumber + i}`;
            return `${title}\n\n${chapter.text}`;
        }).join('\n\n\n----------------\n\n\n');

        const blob = new Blob([BOM + content], { type: 'text/plain;charset=utf-8' });
        const fileNameBase = epubFile?.name.replace(/\.epub$/i, '') || 'novel';
        triggerDownload(blob, `${fileNameBase}.txt`);
        hideSpinner();
    };

    const createPdfFromChapters = async (chaptersData: { title: string, text: string }[], fontBytes: { cjkFontBytes: ArrayBuffer, latinFontBytes: ArrayBuffer }, baseFontSize: number, onProgress?: (progress: { current: number; total: number }) => void) => {
        const pdfDoc = await PDFLibDoc.create() as PDFDocument;
        pdfDoc.registerFontkit(fontkit);

        const chineseFont = await pdfDoc.embedFont(fontBytes.cjkFontBytes);
        const englishFont = await pdfDoc.embedFont(fontBytes.latinFontBytes);

        const tocEntries: { title: string, page: any }[] = [];
        const outlineItemRefs: any[] = [];

        const FONT_SIZE = baseFontSize;
        const TITLE_FONT_SIZE = Math.round(baseFontSize * 1.25);
        const LINE_HEIGHT = FONT_SIZE * 1.5;
        const TITLE_LINE_HEIGHT = TITLE_FONT_SIZE * 1.5;
        const PARAGRAPH_SPACING = LINE_HEIGHT * 0.5;
        const margin = 72;

        const CJK_REGEX = /[\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef]/;
        const SPLIT_REGEX = /([\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef]+|[^\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef]+)/g;
        const WRAP_REGEX = /([^\u4e00-\u9fa5\s]+|\s+|[\u4e00-\u9fa5])/g;

        const measureMixedTextWidth = (text: string, size: number) => {
            let totalWidth = 0;
            const segments = text.match(SPLIT_REGEX) || [text];
            for (const segment of segments) {
                const font = CJK_REGEX.test(segment) ? chineseFont : englishFont;
                totalWidth += font.widthOfTextAtSize(segment, size);
            }
            return totalWidth;
        };

        const drawMixedTextLine = (page: any, text: string, options: { x: number, y: number, size: number }) => {
            const { x, y, size } = options;
            let currentX = x;
            const segments = text.match(SPLIT_REGEX) || [text];

            for (const segment of segments) {
                const font = CJK_REGEX.test(segment) ? chineseFont : englishFont;
                page.drawText(segment, { x: currentX, y, font, size, color: rgb(0, 0, 0) });
                currentX += font.widthOfTextAtSize(segment, size);
            }
        };

        const wrapText = (text: string, maxWidth: number, size: number, measureFn: (text: string, size: number) => number): string[] => {
            const lines: string[] = [];
            if (!text) return [''];

            let currentLine = '';
            const segments = text.match(/[\u4e00-\u9fa5]|[\w'-]+|\s+|[^\s\w]/g) || [];

            for (const segment of segments) {
                const testLine = currentLine + segment;
                if (measureFn(testLine, size) > maxWidth && currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = segment.trimStart();
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine.length > 0) {
                lines.push(currentLine);
            }

            return lines.map(l => l.trim()).filter(l => l.length > 0);
        };

        for (const [index, chapter] of chaptersData.entries()) {
            if (onProgress) {
                onProgress({ current: index + 1, total: chaptersData.length });
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            let page = pdfDoc.addPage(PageSizes.A4);
            const { width, height } = page.getSize();
            tocEntries.push({ title: chapter.title, page });

            const outlineItemDict = pdfDoc.context.obj({ Title: PDFString.of(chapter.title), Dest: [page.ref, PDFName.of('XYZ'), null, height, null] });
            outlineItemRefs.push(pdfDoc.context.register(outlineItemDict));

            const usableWidth = width - 2 * margin;
            let y = height - margin;

            const checkAndAddNewPage = () => {
                if (y < margin) {
                    page = pdfDoc.addPage(PageSizes.A4);
                    y = height - margin;
                }
            };

            checkAndAddNewPage();

            const wrappedTitleLines = wrapText(chapter.title, usableWidth, TITLE_FONT_SIZE, measureMixedTextWidth);
            for (const line of wrappedTitleLines) {
                checkAndAddNewPage();
                drawMixedTextLine(page, line, { x: margin, y, size: TITLE_FONT_SIZE });
                y -= TITLE_LINE_HEIGHT;
            }
            y -= TITLE_LINE_HEIGHT * 0.5;

            const paragraphs = chapter.text.split('\n\n');
            for (const para of paragraphs) {
                checkAndAddNewPage();
                const trimmedPara = para.trim();
                if (!trimmedPara) continue;

                const words = trimmedPara.match(WRAP_REGEX) || [];
                let line = '';

                for (const word of words) {
                    let testLine = line + word;
                    let testWidth = measureMixedTextWidth(testLine, FONT_SIZE);

                    if (testWidth > usableWidth && line.length > 0) {
                        drawMixedTextLine(page, line, { x: margin, y, size: FONT_SIZE });
                        y -= LINE_HEIGHT;
                        line = word.trimStart();
                        checkAndAddNewPage();
                    } else {
                        line = testLine;
                    }
                }

                if (line.length > 0) drawMixedTextLine(page, line, { x: margin, y, size: FONT_SIZE });
                y -= (LINE_HEIGHT + PARAGRAPH_SPACING);
            }
        }

        const tocLineHeight = 14 * 1.8;
        const pageHeightConst = PageSizes.A4[1];

        let tocPageCount = 0;
        let tocPageLineCounts: number[] = [];
        if (tocEntries.length > 0) {
            let linesAvailable = Math.floor((pageHeightConst - 2 * margin - (22 * 2.5)) / tocLineHeight);
            let currentLines = 0;
            const tempTocWidth = PageSizes.A4[0];

            for (const entry of tocEntries) {
                const pageNumStr = "999";
                const pageNumWidth = englishFont.widthOfTextAtSize(pageNumStr, 14);
                const tocUsableWidth = tempTocWidth - 2 * margin - pageNumWidth - 20;
                const wrappedLines = wrapText(entry.title, tocUsableWidth, 14, measureMixedTextWidth);

                if (currentLines + wrappedLines.length > linesAvailable) {
                    tocPageLineCounts.push(currentLines);
                    currentLines = 0;
                    linesAvailable = Math.floor((pageHeightConst - 2 * margin) / tocLineHeight);
                }
                currentLines += wrappedLines.length;
            }
            if (currentLines > 0) tocPageLineCounts.push(currentLines);
            tocPageCount = tocPageLineCounts.length;
        }

        for (let i = 0; i < tocPageCount; i++) {
            pdfDoc.insertPage(i, PageSizes.A4);
        }

        const allPages = pdfDoc.getPages();

        const pageNumberMap = new Map<any, number>();
        tocEntries.forEach(entry => {
            const pageIndex = allPages.indexOf(entry.page);
            if (pageIndex !== -1) {
                pageNumberMap.set(entry.page.ref, pageIndex + 1);
            }
        });

        let tocEntryIndex = 0;
        for (let i = 0; i < tocPageCount; i++) {
            const tocPage = allPages[i];
            const { width: tocWidth, height: tocHeight } = tocPage.getSize();
            let tocY = tocHeight - margin;
            let tocPageAnnots = (tocPage.node.get(PDFName.of('Annots')) || pdfDoc.context.obj([])) as PDFArray;
            tocPage.node.set(PDFName.of('Annots'), tocPageAnnots);

            if (i === 0) {
                drawMixedTextLine(tocPage, 'Table of Contents', { x: margin, y: tocY, size: 22 });
                tocY -= 22 * 2.5;
            }

            const linesOnThisPage = (i === 0)
                ? Math.floor((pageHeightConst - 2 * margin - (22 * 2.5)) / tocLineHeight)
                : Math.floor((pageHeightConst - 2 * margin) / tocLineHeight);

            let linesDrawn = 0;
            while (tocEntryIndex < tocEntries.length && linesDrawn < linesOnThisPage) {
                const entry = tocEntries[tocEntryIndex];
                const pageNumber = pageNumberMap.get(entry.page.ref);

                if (!pageNumber) {
                    tocEntryIndex++;
                    continue;
                }

                const pageNumStr = String(pageNumber);
                const pageNumWidth = englishFont.widthOfTextAtSize(pageNumStr, 14);
                const tocUsableWidth = tocWidth - 2 * margin - pageNumWidth - 20;
                const wrappedTocLines = wrapText(entry.title, tocUsableWidth, 14, measureMixedTextWidth);

                if (linesDrawn + wrappedTocLines.length > linesOnThisPage && linesDrawn > 0) {
                    break;
                }

                const entryStartY = tocY;

                for (const line of wrappedTocLines) {
                    drawMixedTextLine(tocPage, line, { x: margin, y: tocY, size: 14 });
                    tocY -= tocLineHeight;
                }

                tocPage.drawText(String(pageNumber), { x: tocWidth - margin - pageNumWidth, y: entryStartY, font: englishFont, size: 14, color: rgb(0, 0, 0) });

                const { height: chapterPageHeight } = entry.page.getSize();
                const linkRect: [number, number, number, number] = [margin, tocY + tocLineHeight - 14 + 4, tocWidth - margin, entryStartY + 4];
                const linkAnnotation = pdfDoc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: linkRect, Border: [0, 0, 0], Dest: [entry.page.ref, PDFName.of('XYZ'), null, chapterPageHeight, null] });
                tocPageAnnots.push(pdfDoc.context.register(linkAnnotation));

                linesDrawn += wrappedTocLines.length;
                tocEntryIndex++;
            }
        }

        if (outlineItemRefs.length > 0) {
            const outlineRootRef = pdfDoc.context.nextRef();
            for (let i = 0; i < outlineItemRefs.length; i++) {
                const itemRef = outlineItemRefs[i];
                const item = pdfDoc.context.lookup(itemRef) as PDFDict;
                item.set(PDFName.of('Parent'), outlineRootRef);
                if (i > 0) item.set(PDFName.of('Prev'), outlineItemRefs[i - 1]);
                if (i < outlineItemRefs.length - 1) item.set(PDFName.of('Next'), outlineItemRefs[i + 1]);
            }
            const outlineRoot = pdfDoc.context.obj({ Type: 'Outlines', First: outlineItemRefs[0], Last: outlineItemRefs[outlineItemRefs.length - 1], Count: outlineItemRefs.length });
            pdfDoc.context.assign(outlineRootRef, outlineRoot);
            pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);
        }

        return await pdfDoc.save();
    }

    const showFormattingOptions = outputFormat.includes('pdf');

    return (
        <div id="splitterApp" className="animate-fade-in space-y-6 max-w-4xl mx-auto px-4 py-6">
            <PageHeader
                title="EPUB Chapter Splitter"
                description="Extract chapters from EPUB files into individual text or PDF files."
            />

            <Card>
                <CardHeader>
                    <CardTitle>File Upload</CardTitle>
                </CardHeader>
                <CardContent>
                    <FileInput inputId="epubUpload" label="Upload EPUB File" accept=".epub" onFileSelected={handleFileSelected} onFileCleared={() => { setEpubFile(null); resetChapterSelection(); setStatus(null); }} />
                </CardContent>
            </Card>

            {parsedChapters.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Chapter Range</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="startChapter">From Chapter</Label>
                                <Select id="startChapter" value={startChapterIndex} onChange={handleStartChapterChange}>
                                    {parsedChapters.map((chap, index) => (
                                        <option key={chap.index} value={index}>
                                            {`${chap.title}${getFirstLinePreview(chap.text)}`}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="endChapter">To Chapter</Label>
                                <Select id="endChapter" value={endChapterIndex} onChange={handleEndChapterChange}>
                                    {parsedChapters.map((chap, index) => (
                                        <option key={chap.index} value={index}>
                                            {`${chap.title}${getFirstLinePreview(chap.text)}`}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="outputFormat">Output Format</Label>
                            <Select id="outputFormat" value={outputFormat} onChange={e => setOutputFormat(e.target.value as any)}>
                                <option value="zip-txt">ZIP (.txt files)</option>
                                <option value="zip-pdf">ZIP (.pdf files)</option>
                                <option value="single-txt">Single .txt file</option>
                                <option value="single-pdf">Single .pdf file</option>
                            </Select>
                        </div>

                        {outputFormat.startsWith('zip-') && (
                            <div className="space-y-2">
                                <Label htmlFor="modeSelect">Output Mode</Label>
                                <Select id="modeSelect" value={mode} onChange={e => setMode(e.target.value as any)}>
                                    <option value="single">Single Chapter per File</option>
                                    <option value="grouped">Grouped Chapters per File</option>
                                </Select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="chapterPattern" className="flex items-center gap-2">
                                Chapter Prefix
                                <div className="relative group">
                                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                    <span role="tooltip" className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 invisible opacity-0 group-hover:visible group-hover:opacity-100 bg-popover text-popover-foreground rounded-md p-2 z-10 shadow-lg text-xs transition-opacity duration-300 border">
                                        Pattern for naming output files, e.g., 'C' will result in C01.txt, C02.txt.
                                    </span>
                                </div>
                            </Label>
                            <Input type="text" id="chapterPattern" placeholder="e.g., Chapter " value={chapterPattern} onChange={e => setChapterPattern(e.target.value)} />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="startNumber">Start Number</Label>
                            <Input type="number" id="startNumber" min="1" value={startNumber} onChange={e => setStartNumber(parseInt(e.target.value, 10))} />
                        </div>
                    </div>

                    {mode === 'grouped' && outputFormat.startsWith('zip-') && (
                        <div className="p-4 bg-muted/50 rounded-lg border space-y-2">
                            <Label htmlFor="groupSize">Chapters per File</Label>
                            <Input type="number" id="groupSize" min="1" value={groupSize} onChange={e => setGroupSize(parseInt(e.target.value, 10))} />
                            <p className="text-xs text-muted-foreground">When using grouped mode, how many chapters to include in each output file</p>
                        </div>
                    )}

                    {showFormattingOptions && (
                        <div className="pt-2">
                            <Button variant="ghost" type="button" onClick={() => setFormattingOptionsOpen(!isFormattingOptionsOpen)} className="w-full flex justify-between items-center text-left h-auto p-2">
                                <span className="font-semibold">Formatting Options</span>
                                {isFormattingOptionsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>

                            {isFormattingOptionsOpen && (
                                <div className="mt-4 pt-4 border-t space-y-4 animate-fade-in">
                                    {(outputFormat === 'zip-pdf' || outputFormat === 'single-pdf') && (
                                        <div className="max-w-xs">
                                            <Label htmlFor="pdfFontSize">PDF Font Size</Label>
                                            <Input type="number" id="pdfFontSize" min="8" max="32" value={pdfFontSize} onChange={e => setPdfFontSize(parseInt(e.target.value, 10))} className="mt-2" />
                                        </div>
                                    )}
                                    <div className="flex items-center space-x-2">
                                        <input
                                            type="checkbox"
                                            id="useFirstLineAsHeading"
                                            checked={useFirstLineAsHeading}
                                            onChange={e => setUseFirstLineAsHeading(e.target.checked)}
                                            className="rounded border-input text-primary focus:ring-primary"
                                        />
                                        <Label htmlFor="useFirstLineAsHeading" className="font-normal">Use first line as chapter heading</Label>
                                    </div>
                                    <p className="text-xs text-muted-foreground pl-6">Treats the first line of text as the chapter title inside the document.</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
                <div className="p-6 pt-0 flex justify-center">
                    <Button onClick={handleSplit} disabled={!epubFile || parsedChapters.length === 0} size="lg" className="w-full sm:w-auto min-w-[200px]">
                        Process &amp; Download
                    </Button>
                </div>
            </Card>

            <StatusMessage status={status} />
        </div>
    );
};