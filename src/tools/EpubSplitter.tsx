import React, { useState } from 'react';
// @ts-ignore
import { PDFDocument, rgb, PageSizes, PDFString, PDFName, PDFArray, PDFDict } from 'pdf-lib';
// @ts-ignore
import * as fontkit from 'fontkit';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip, getFonts, escapeHTML } from '../utils/helpers';
import { Status } from '../utils/types';

export const EpubSplitter: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    
    // Component State
    const [epubFile, setEpubFile] = useState<File | null>(null);
    const [parsedChapters, setParsedChapters] = useState<{ index: number; title: string; text: string }[]>([]);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [status, setStatus] = useState<Status | null>(null);
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

    // Form Inputs State
    const [outputFormat, setOutputFormat] = useState<'zip-txt' | 'zip-pdf' | 'single-txt' | 'single-docx' | 'zip-docx' | 'single-pdf'>('zip-txt');
    const [mode, setMode] = useState<'single' | 'grouped'>('single');
    const [chapterPattern, setChapterPattern] = useState('Chapter ');
    const [startNumber, setStartNumber] = useState(1);
    const [offsetNumber, setOffsetNumber] = useState(0);
    const [skipLast, setSkipLast] = useState(0);
    const [groupSize, setGroupSize] = useState(4);
    const [pdfFontSize, setPdfFontSize] = useState(14);
    
    // Handlers for chapter selection
    const handleSelectAll = () => {
        const allIndices = new Set(parsedChapters.map(c => c.index));
        setSelectedIndices(allIndices);
    };

    const handleDeselectAll = () => {
        setSelectedIndices(new Set());
    };

    const handleCheckboxChange = (index: number, checked: boolean) => {
        setSelectedIndices(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(index);
            } else {
                newSet.delete(index);
            }
            return newSet;
        });
    };

    const resetChapterSelection = () => {
        setParsedChapters([]);
        setSelectedIndices(new Set());
    };
    
    const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    const handleFileSelected = async (files: FileList) => {
        const file = files[0];
        setEpubFile(file);
        resetChapterSelection();
        setStatus(null);

        if (!file) return;

        showSpinner();
        try {
            const buffer = await readFileAsArrayBuffer(file);
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
            setSelectedIndices(new Set(chapters.map(c => c.index)));

            if (chapters.length > 0) {
                showToast(`Found ${chapters.length} chapters.`);
            } else {
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
        if (selectedIndices.size === 0) {
            showToast("No chapters selected to process.", true);
            setStatus({ message: 'Error: No chapters selected to process.', type: 'error' });
            return;
        }

        if (isNaN(startNumber) || startNumber < 1) {
            setStatus({ message: 'Error: Start Number must be 1 or greater.', type: 'error' });
            return;
        }
        if (isNaN(offsetNumber) || offsetNumber < 0) {
            setStatus({ message: 'Error: Offset must be 0 or greater.', type: 'error' });
            return;
        }
        if (isNaN(skipLast) || skipLast < 0) {
            setStatus({ message: 'Error: Skip Last must be 0 or greater.', type: 'error' });
            return;
        }
        if (mode === 'grouped' && (isNaN(groupSize) || groupSize < 1)) {
            setStatus({ message: 'Error: Chapters per File must be 1 or greater.', type: 'error' });
            return;
        }

        showSpinner();

        try {
            const selectedAndSortedChapters = parsedChapters
                .filter(chap => selectedIndices.has(chap.index));
            
            const endSlice = selectedAndSortedChapters.length - skipLast;
            const chaptersToProcess = selectedAndSortedChapters.slice(offsetNumber, endSlice > 0 ? endSlice : 0);

            if (chaptersToProcess.length === 0) {
                throw new Error(`Offset/skip settings resulted in no chapters to process from your selection.`);
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
                case 'single-docx':
                    await generateSingleDocx(chaptersToProcess);
                    break;
                case 'zip-docx':
                    await generateDocxZip(chaptersToProcess);
                    break;
                case 'zip-txt':
                default:
                    await generateTxtZip(chaptersToProcess);
                    break;
            }

            const outputDescriptions: Record<typeof outputFormat, string> = {
                'zip-txt': '.txt files in a ZIP archive',
                'zip-pdf': 'PDFs in a ZIP file',
                'zip-docx': '.docx files in a ZIP file',
                'single-txt': 'a single .txt file',
                'single-docx': 'a single .docx file',
                'single-pdf': 'a single .pdf file'
            };

            setStatus({ message: `Extracted ${chaptersToProcess.length} chapter(s) as ${outputDescriptions[outputFormat]}. Download started.`, type: 'success' });
            showToast(`Extracted ${chaptersToProcess.length} chapter(s).`);

        } catch (err: any) {
            console.error("EPUB Splitter Error:", err);
            setStatus({ message: `Error: ${err.message}`, type: 'error' });
            showToast(`Error splitting EPUB: ${err.message}`, true);
        } finally {
            hideSpinner();
        }
    };

    const generateTxtZip = async (chaptersToProcess: typeof parsedChapters) => {
        const JSZip = await getJSZip();
        const zip = new JSZip();
        const BOM = "\uFEFF"; // UTF-8 Byte Order Mark

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
    };
    
    const generatePdfZip = async (chaptersToProcess: typeof parsedChapters, fontSize: number) => {
        setStatus({ message: 'Preparing PDF generation...', type: 'info' });
        const fontBytes = await getFonts();
        const JSZip = await getJSZip();
        const zip = new JSZip();

        if (mode === 'single') {
            for (let i = 0; i < chaptersToProcess.length; i++) {
                const chapter = chaptersToProcess[i];
                const chapNum = String(startNumber + i).padStart(2, '0');
                const pdfBytes = await createPdfFromChapters([chapter], fontBytes, fontSize);
                zip.file(`${chapterPattern}${chapNum}.pdf`, pdfBytes);
            }
        } else { // grouped
            for (let i = 0; i < chaptersToProcess.length; i += groupSize) {
                const group = chaptersToProcess.slice(i, i + groupSize);
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
        setStatus({ message: 'Generating single PDF...', type: 'info' });
        const fontBytes = await getFonts();
        const pdfBytes = await createPdfFromChapters(chaptersToProcess, fontBytes, fontSize);
        const fileNameBase = epubFile?.name.replace(/\.epub$/i, '') || 'novel';
       triggerDownload(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }), `${fileNameBase}_combined.pdf`);

    };

    const generateSingleTxt = async (chaptersToProcess: typeof parsedChapters) => {
        const BOM = "\uFEFF";
        const content = chaptersToProcess.map((chapter, i) => {
            const title = `${chapterPattern}${startNumber + i}`;
            return `${title}\n\n${chapter.text}`;
        }).join('\n\n\n----------------\n\n\n');

        const blob = new Blob([BOM + content], { type: 'text/plain;charset=utf-8' });
        const fileNameBase = epubFile?.name.replace(/\.epub$/i, '') || 'novel';
        triggerDownload(blob, `${fileNameBase}_combined.txt`);
    };

    const createDocxBlob = async (chaptersData: { title: string, text: string }[]): Promise<Blob> => {
        const JSZip = await getJSZip();
        const zip = new JSZip();
    
        let bodyContent = '';
        chaptersData.forEach((chapter, chapterIndex) => {
            bodyContent += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeHTML(chapter.title)}</w:t></w:r></w:p>`;
            bodyContent += `<w:p/>`;
    
            const paragraphs = chapter.text.split('\n\n').filter(p => p.trim());
            paragraphs.forEach(paragraph => {
                bodyContent += `<w:p><w:r><w:t>${escapeHTML(paragraph.trim())}</w:t></w:r></w:p>`;
                bodyContent += `<w:p/>`;
            });
    
            if (chapterIndex < chaptersData.length - 1) {
                bodyContent += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
            }
        });
    
        const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>${bodyContent}</w:body>
</w:document>`;
    
        const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
    
        const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

        const documentRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

        const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
        <w:name w:val="Normal"/>
        <w:pPr>
            <w:spacing w:after="0" w:line="240" w:lineRule="auto"/>
        </w:pPr>
        <w:rPr>
            <w:sz w:val="24"/>
        </w:rPr>
    </w:style>
    <w:style w:type="paragraph" w:styleId="Heading1">
        <w:name w:val="heading 1"/>
        <w:basedOn w:val="Normal"/>
        <w:next w:val="Normal"/>
        <w:pPr>
            <w:keepNext/>
            <w:keepLines/>
            <w:spacing w:before="240" w:after="0"/>
            <w:outlineLvl w:val="0"/>
        </w:pPr>
        <w:rPr>
            <w:b/>
            <w:sz w:val="32"/>
        </w:rPr>
    </w:style>
</w:styles>`;

        zip.file("[Content_Types].xml", contentTypesXml);
        zip.folder("_rels")!.file(".rels", relsXml);
        const wordFolder = zip.folder("word")!;
        wordFolder.file("document.xml", documentXml);
        wordFolder.file("styles.xml", stylesXml);
        wordFolder.folder("_rels")!.file("document.xml.rels", documentRelsXml);

        return zip.generateAsync({ type: "blob", mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    };

    const generateSingleDocx = async (chaptersToProcess: typeof parsedChapters) => {
        const chaptersWithTitles = chaptersToProcess.map((chapter, i) => ({
            title: `${chapterPattern}${startNumber + i}`,
            text: chapter.text
        }));
    
        const blob = await createDocxBlob(chaptersWithTitles);
        const fileNameBase = epubFile?.name.replace(/\.epub$/i, '') || 'novel';
        triggerDownload(blob, `${fileNameBase}_combined.docx`);
    };

    const generateDocxZip = async (chaptersToProcess: typeof parsedChapters) => {
        const JSZip = await getJSZip();
        const zip = new JSZip();
    
        if (mode === 'single') {
            for (let i = 0; i < chaptersToProcess.length; i++) {
                const chapter = chaptersToProcess[i];
                const chapNum = String(startNumber + i).padStart(2, '0');
                const title = `${chapterPattern}${chapNum}`;
                
                const docxBlob = await createDocxBlob([{ title: chapter.title, text: chapter.text }]);
                zip.file(`${title}.docx`, docxBlob);
            }
        } else { // grouped
            for (let i = 0; i < chaptersToProcess.length; i += groupSize) {
                const group = chaptersToProcess.slice(i, i + groupSize);
                const groupStartNum = startNumber + i;
                const groupEndNum = groupStartNum + group.length - 1;
                
                const name = group.length === 1
                    ? `${chapterPattern}${String(groupStartNum).padStart(2, '0')}`
                    : `${chapterPattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}`;
                
                const chaptersForDocx = group.map((chapter) => ({
                     title: chapter.title,
                     text: chapter.text
                }));
                
                const docxBlob = await createDocxBlob(chaptersForDocx);
                zip.file(`${name}.docx`, docxBlob);
            }
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(blob, `${chapterPattern.trim()}_chapters_docx.zip`);
    };

    const createPdfFromChapters = async (chaptersData: typeof parsedChapters, fontBytes: { notoFontBytes: ArrayBuffer, latinFontBytes: ArrayBuffer }, baseFontSize: number) => {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit as any);
        const chineseFont = await pdfDoc.embedFont(fontBytes.notoFontBytes);
        const englishFont = await pdfDoc.embedFont(fontBytes.latinFontBytes);
        
        const tocPage = pdfDoc.addPage(PageSizes.A4);
        const tocEntries: { title: string, page: any }[] = [];

        const FONT_SIZE = baseFontSize;
        const TITLE_FONT_SIZE = Math.round(baseFontSize * 1.25);
        const LINE_HEIGHT = FONT_SIZE * 1.5;
        const TITLE_LINE_HEIGHT = TITLE_FONT_SIZE * 1.5;
        const PARAGRAPH_SPACING = LINE_HEIGHT * 0.5;
        const margin = 72;
        const outlineItemRefs: any[] = [];
        
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

        for (const chapter of chaptersData) {
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
            drawMixedTextLine(page, chapter.title, { x: margin, y, size: TITLE_FONT_SIZE });
            y -= TITLE_LINE_HEIGHT * 1.5;
    
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
    
        const pages = pdfDoc.getPages();
        const { width: tocWidth, height: tocHeight } = tocPage.getSize();
        let tocY = tocHeight - margin;
        let tocPageAnnots = (tocPage.node.get(PDFName.of('Annots')) || pdfDoc.context.obj([])) as PDFArray;
        tocPage.node.set(PDFName.of('Annots'), tocPageAnnots);
    
        drawMixedTextLine(tocPage, 'Table of Contents', { x: margin, y: tocY, size: 22 });
        tocY -= 22 * 2.5;
    
        for (const entry of tocEntries) {
            if (tocY < margin) break;
            const pageNumber = pages.indexOf(entry.page) + 1;
            drawMixedTextLine(tocPage, entry.title, { x: margin, y: tocY, size: 14 });
            tocPage.drawText(String(pageNumber), { x: tocWidth - margin - englishFont.widthOfTextAtSize(String(pageNumber), 14), y: tocY, font: englishFont, size: 14, color: rgb(0, 0, 0) });
            
            const { height: pageHeight } = entry.page.getSize();
            const linkAnnotation = pdfDoc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [margin, tocY - 4, tocWidth - margin, tocY + 14], Border: [0, 0, 0], Dest: [entry.page.ref, PDFName.of('XYZ'), null, pageHeight, null] });
            tocPageAnnots.push(pdfDoc.context.register(linkAnnotation));
            tocY -= 14 * 1.8;
        }
    
        return await pdfDoc.save();
    }


    return (
        <div id="splitterApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in tool-section">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">EPUB Chapter Splitter</h1>
             <div className="max-w-md mx-auto">
                <FileInput inputId="epubUpload" label="Upload EPUB File" accept=".epub" onFileSelected={handleFileSelected} onFileCleared={() => { setEpubFile(null); resetChapterSelection(); setStatus(null); }} />
            </div>

             {parsedChapters.length > 0 && (
                <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600/50">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Select Chapters to Split</h4>
                        <div className="text-sm text-primary-600 dark:text-primary-400">{parsedChapters.length} chapters found</div>
                    </div>
                    <div className="mb-4 flex justify-center gap-3">
                        <button type="button" onClick={handleSelectAll} className="inline-flex items-center justify-center rounded-lg font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 px-3 py-1 text-sm">Select All</button>
                        <button type="button" onClick={handleDeselectAll} className="inline-flex items-center justify-center rounded-lg font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 px-3 py-1 text-sm">Deselect All</button>
                    </div>
                    <ul className="max-w-xl mx-auto max-h-48 overflow-y-auto bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-3 list-none text-left" aria-label="List of EPUB chapters for selection">
                        {parsedChapters.map(chap => (
                            <li key={chap.index} className="flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
                                <input type="checkbox" id={`splitter-chap-${chap.index}`} checked={selectedIndices.has(chap.index)} onChange={e => handleCheckboxChange(chap.index, e.target.checked)} className="w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600" />
                                <label htmlFor={`splitter-chap-${chap.index}`} className="text-sm text-slate-700 dark:text-slate-300 flex-1 cursor-pointer">{chap.title}</label>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            <div className="max-w-md mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="outputFormat" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Output Format:</label>
                        <select id="outputFormat" value={outputFormat} onChange={e => setOutputFormat(e.target.value as any)} className="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full">
                            <option value="zip-txt">ZIP (.txt files)</option>
                            <option value="zip-pdf">ZIP (.pdf files)</option>
                            <option value="zip-docx">ZIP (.docx files)</option>
                            <option value="single-txt">Single .txt file</option>
                            <option value="single-docx">Single .docx file</option>
                            <option value="single-pdf">Single .pdf file</option>
                        </select>
                    </div>

                    {outputFormat.startsWith('zip-') && (
                        <div>
                            <label htmlFor="modeSelect" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Output Mode:</label>
                            <select id="modeSelect" value={mode} onChange={e => setMode(e.target.value as any)} className="bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full">
                                <option value="single">Single Chapter per File</option>
                                <option value="grouped">Grouped Chapters per File</option>
                            </select>
                        </div>
                    )}

                    <div>
                        <label htmlFor="chapterPattern" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                        Chapter Prefix:
                        <span className={`tooltip-trigger relative group inline-block ml-1 cursor-help text-primary-600 font-bold border border-primary-600 rounded-full w-5 h-5 leading-4 text-center text-xs hover:bg-primary-600 hover:text-white ${activeTooltip === 'prefix' ? 'active' : ''}`} role="button" tabIndex={0} onClick={() => setActiveTooltip(p => p === 'prefix' ? null : 'prefix')}>
                                (?)
                                <span className="tooltip-text-popup absolute bottom-full left-1/2 -ml-[110px] w-[220px] invisible opacity-0 group-hover:visible group-hover:opacity-100 group-[.active]:visible group-[.active]:opacity-100 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-left rounded-md p-2 z-10 shadow-lg text-sm transition-opacity duration-300">Pattern for naming output files, e.g., 'C' will result in C01.txt, C02.txt. Click to dismiss.<div className="absolute top-full left-1/2 -ml-1 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-100 dark:border-t-slate-800"></div></span>
                        </span>
                        </label>
                        <input type="text" id="chapterPattern" placeholder="e.g., Chapter " value={chapterPattern} onChange={e => setChapterPattern(e.target.value)} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                    </div>

                    <div>
                        <label htmlFor="startNumber" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Start Number:</label>
                        <input type="number" id="startNumber" min="1" value={startNumber} onChange={e => setStartNumber(parseInt(e.target.value, 10))} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                    </div>
                   
                    <div>
                        <label htmlFor="offsetNumber" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Skip First:</label>
                        <input type="number" id="offsetNumber" min="0" value={offsetNumber} onChange={e => setOffsetNumber(parseInt(e.target.value, 10))} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                    </div>
                    <div>
                        <label htmlFor="skipLast" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Skip Last:</label>
                        <input type="number" id="skipLast" min="0" value={skipLast} onChange={e => setSkipLast(parseInt(e.target.value, 10))} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                    </div>
                </div>

                 {mode === 'grouped' && outputFormat.startsWith('zip-') && (
                    <div className="mt-4 p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                        <label htmlFor="groupSize" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chapters per File:</label>
                        <input type="number" id="groupSize" min="1" value={groupSize} onChange={e => setGroupSize(parseInt(e.target.value, 10))} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">When using grouped mode, how many chapters to include in each output file</p>
                    </div>
                )}
                 {(outputFormat === 'zip-pdf' || outputFormat === 'single-pdf') && (
                    <div className="mt-4 p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2 text-center">PDF Options</h3>
                        <div className="max-w-xs mx-auto">
                            <label htmlFor="pdfFontSize" className="flex items-center gap-2 block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Font Size:</label>
                            <input type="number" id="pdfFontSize" min="8" max="32" value={pdfFontSize} onChange={e => setPdfFontSize(parseInt(e.target.value, 10))} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 w-full" />
                        </div>
                    </div>
                )}
            </div>
            
            <div className="mt-8 flex justify-center gap-4">
                <button onClick={handleSplit} disabled={!epubFile || parsedChapters.length === 0} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 disabled:opacity-60 disabled:cursor-not-allowed">Process &amp; Download</button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};