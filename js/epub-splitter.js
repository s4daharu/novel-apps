/**
 * Browser-compatible EPUB Splitter functionality
 */

import { triggerDownload, getJSZip } from './browser-helpers.js';
import { updateStatus, setupFileInput } from './tool-helpers.js';
import { PDFDocument, rgb, PageSizes, PDFString, PDFName, PDFArray } from "pdf-lib";
import * as fontkit from "fontkit";

let FONT_CACHE = null;

// Helper function
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

async function getFonts(updateStatusCallback) {
    if (FONT_CACHE) return FONT_CACHE;
    try {
        updateStatusCallback('Loading fonts for PDF generation...', 'info');
        const notoFontUrl = './fonts/NotoSansSC-Regular.otf';
        const marmeladFontUrl = './fonts/Marmelad-Regular.ttf'; // Use local Marmelad font

        const [notoFontBytes, marmeladFontBytes] = await Promise.all([
            fetch(notoFontUrl).then(res => {
                if (!res.ok) throw new Error(`Font load failed: ${res.statusText}. Make sure 'NotoSansSC-Regular.otf' is in the '/fonts' folder.`);
                return res.arrayBuffer();
            }),
            fetch(marmeladFontUrl).then(res => {
                if (!res.ok) throw new Error(`Failed to load Marmelad font locally: ${res.statusText}. Make sure 'Marmelad-Regular.ttf' is in the '/fonts' folder.`);
                return res.arrayBuffer();
            })
        ]);
        
        FONT_CACHE = { notoFontBytes, marmeladFontBytes };
        return FONT_CACHE;
    } catch (error) {
        console.error("Font load failed:", error);
        updateStatusCallback(`Failed to load required font for PDF generation. ${error.message}`, 'error');
        throw new Error('Font load failed');
    }
}

export function initializeEpubSplitter(showAppToast, toggleAppSpinner) {
    const uploadInput = document.getElementById('epubUpload');
    const fileNameEl = document.getElementById('epubFileName');
    const clearFileBtn = document.getElementById('clearEpubUpload');
    const splitBtn = document.getElementById('splitBtn');
    const outputFormatEl = document.getElementById('outputFormat');
    const modeSelectContainer = document.getElementById('modeSelectContainer');
    const modeSelect = document.getElementById('modeSelect');
    const groupSizeGrp = document.getElementById('groupSizeGroup');
    const statusEl = document.getElementById('statusMessage');
    const downloadSec = document.querySelector('#splitterApp .download-section');
    const chapterPatternEl = document.getElementById('chapterPattern');
    const startNumberEl = document.getElementById('startNumber');
    const offsetNumberEl = document.getElementById('offsetNumber');
    const groupSizeEl = document.getElementById('groupSize');
    const chapterSelectionArea = document.getElementById('splitterChapterSelectionArea');
    const chapterListUl = document.getElementById('splitterChapterList');
    const selectAllChaptersBtn = document.getElementById('splitterSelectAllChapters');
    const deselectAllChaptersBtn = document.getElementById('splitterDeselectAllChapters');
    const chapterCountEl = document.getElementById('chapterCount');

    let parsedChaptersForSelection = [];

    if (!uploadInput || !splitBtn || !modeSelect || !fileNameEl || !clearFileBtn || !groupSizeGrp ||
        !statusEl || !downloadSec || !chapterPatternEl || !outputFormatEl || !modeSelectContainer ||
        !startNumberEl || !offsetNumberEl || !groupSizeEl ||
        !chapterSelectionArea || !chapterListUl || !selectAllChaptersBtn || !deselectAllChaptersBtn || !chapterCountEl) {
        console.error("EPUB Splitter UI elements not found. Initialization failed.");
        return;
    }

    function updateSplitterControls() {
        modeSelectContainer.style.display = 'block';
        groupSizeGrp.classList.toggle('hidden', modeSelect.value !== 'grouped');
    }
    
    outputFormatEl.addEventListener('change', updateSplitterControls);
    modeSelect.addEventListener('change', updateSplitterControls);

    function resetChapterSelectionUI() {
        chapterListUl.innerHTML = '';
        chapterSelectionArea.classList.add('hidden');
        parsedChaptersForSelection = [];
    }

    function displayChapterSelectionUI(chapters) {
        chapterListUl.innerHTML = '';
        chapterCountEl.textContent = `${chapters.length} chapters found`;

        if (chapters.length === 0) {
            chapterSelectionArea.classList.add('hidden');
            return;
        }

        chapters.forEach((chapInfo, index) => {
            const li = document.createElement('li');
            li.className = "flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-700";
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `splitter-chap-${index}`;
            checkbox.value = index.toString();
            checkbox.checked = true;
            checkbox.setAttribute('data-chapter-index', index.toString());
            checkbox.className = "w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600";

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = chapInfo.title;
            label.className = "text-sm text-slate-700 dark:text-slate-300 flex-1 cursor-pointer";

            li.appendChild(checkbox);
            li.appendChild(label);
            chapterListUl.appendChild(li);
        });
        chapterSelectionArea.classList.remove('hidden');
    }

    selectAllChaptersBtn.addEventListener('click', () => {
        chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = true));
    });

    deselectAllChaptersBtn.addEventListener('click', () => {
        chapterListUl.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
    });

    setupFileInput({
        inputEl: uploadInput,
        fileNameEl: fileNameEl,
        clearBtnEl: clearFileBtn,
        async onFileSelected(files) {
            const selectedFile = files[0];
            resetChapterSelectionUI();
            statusEl.classList.add('hidden');
            downloadSec.classList.add('hidden');
            splitBtn.disabled = true;

            toggleAppSpinner(true);
            try {
                const buffer = await readFileAsArrayBuffer(selectedFile);
                const JSZip = await getJSZip();
                const epub = await JSZip.loadAsync(buffer);
                
                const containerXml = await epub.file('META-INF/container.xml').async('text');
                const containerDoc = new DOMParser().parseFromString(containerXml, 'text/xml');
                const opfPath = containerDoc.querySelector('rootfile').getAttribute('full-path');
                
                const opfContent = await epub.file(opfPath).async('text');
                const opfDoc = new DOMParser().parseFromString(opfContent, 'text/xml');
                
                const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
                
                const manifestItems = {};
                opfDoc.querySelectorAll('manifest > item').forEach(item => {
                    manifestItems[item.getAttribute('id')] = item.getAttribute('href');
                });
                
                const spineItems = [];
                opfDoc.querySelectorAll('spine > itemref').forEach(itemref => {
                    const idref = itemref.getAttribute('idref');
                    const href = manifestItems[idref];
                    if (href && !href.includes('toc') && !href.includes('nav')) {
                        spineItems.push(opfBasePath + href);
                    }
                });
                
                const tempChapters = [];
                const parser = new DOMParser();

                const extractChapterContent = (doc_element) => {
                    function convertNodeToText(node) {
                        let text = '';
                        if (node.nodeType === Node.TEXT_NODE) {
                            return node.textContent;
                        }
                        if (node.nodeType !== Node.ELEMENT_NODE) {
                            return '';
                        }
                
                        const tagName = node.tagName.toLowerCase();
                        // Skip title tags, scripts, and styles to prevent them from appearing in the output text.
                        if (['h1', 'h2', 'h3', 'script', 'style', 'header', 'footer', 'nav'].includes(tagName)) {
                            return '';
                        }
                
                        const isBlock = ['p', 'div', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'tr', 'br', 'hr'].includes(tagName);
                
                        if (isBlock) text += '\n';
                
                        for (const child of node.childNodes) {
                            text += convertNodeToText(child);
                        }
                        
                        if (isBlock) text += '\n';
                        
                        return text;
                    }
                
                    let rawText = convertNodeToText(doc_element.cloneNode(true));
                
                    return rawText
                        .replace(/\r\n?/g, '\n')
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line.length > 0)
                        .join('\n\n');
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
                        chapterSections.forEach((section) => {
                            const titleEl = section.querySelector('h1, h2, h3');
                            const title = titleEl ? titleEl.textContent.trim() : `Chapter ${tempChapters.length + 1}`;
                            const text = extractChapterContent(section);
                            
                            if (text) {
                                tempChapters.push({ title, text });
                            }
                        });
                    } else if (doc.body) {
                        const titleEl = doc.body.querySelector('h1, h2, h3, title');
                        const title = titleEl ? titleEl.textContent.trim() : `Chapter ${tempChapters.length + 1}`;
                        const text = extractChapterContent(doc.body);
                        
                        if (text) {
                            tempChapters.push({ title, text });
                        }
                    }
                }
                
                parsedChaptersForSelection = tempChapters.map((chap, index) => ({
                    index: index,
                    title: chap.title,
                    text: chap.text
                }));
                
                displayChapterSelectionUI(parsedChaptersForSelection);
                
                if (parsedChaptersForSelection.length > 0) {
                    showAppToast(`Found ${parsedChaptersForSelection.length} chapters.`, false);
                } else {
                    showAppToast('No chapters found. Check EPUB structure.', true);
                    updateStatus(statusEl, 'Error: No chapters found.', 'error');
                }
                
            } catch (err) {
                console.error("EPUB parsing failed:", err);
                showAppToast(`Error parsing EPUB: ${err.message}`, true);
                updateStatus(statusEl, `Error: ${err.message || 'Could not parse EPUB.'}`, 'error');
            } finally {
                toggleAppSpinner(false);
                splitBtn.disabled = parsedChaptersForSelection.length === 0;
            }
        },
        onFileCleared() {
            resetChapterSelectionUI();
            statusEl.classList.add('hidden');
            downloadSec.classList.add('hidden');
            splitBtn.disabled = true;
        }
    });

    async function generateTxtZip({ usableChaps, pattern, startNumber, mode, groupSize }) {
        const JSZip = await getJSZip();
        const zip = new JSZip();
        const BOM = "\uFEFF"; // UTF-8 Byte Order Mark

        if (mode === 'single') {
            usableChaps.forEach((text, i) => {
                const chapNum = String(startNumber + i).padStart(2, '0');
                zip.file(`${pattern}${chapNum}.txt`, BOM + text);
            });
        } else { // grouped
            for (let i = 0; i < usableChaps.length; i += groupSize) {
                const groupStartNum = startNumber + i;
                const groupEndNum = Math.min(startNumber + i + groupSize - 1, startNumber + usableChaps.length - 1);
                const name = groupStartNum === groupEndNum
                    ? `${pattern}${String(groupStartNum).padStart(2, '0')}.txt`
                    : `${pattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}.txt`;

                const content = usableChaps.slice(i, i + groupSize).join('\n\n\n---------------- END ----------------\n\n\n');
                zip.file(name, BOM + content);
            }
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const downloadFilename = `${pattern}_chapters.zip`;
        await triggerDownload(blob, downloadFilename, 'application/zip', showAppToast);
    }
    
    async function createPdfFromChapters(chaptersData, fontBytes) {
        const pdfDoc = await PDFDocument.create();
        pdfDoc.registerFontkit(fontkit);
        const chineseFont = await pdfDoc.embedFont(fontBytes.notoFontBytes);
        const englishFont = await pdfDoc.embedFont(fontBytes.marmeladFontBytes);
    
        // TOC setup
        const tocPage = pdfDoc.addPage(PageSizes.A4);
        const tocEntries = [];
    
        // Mobile-friendly formatting with increased font size
        const FONT_SIZE = 14;
        const TITLE_FONT_SIZE = 18;
        const LINE_HEIGHT = FONT_SIZE * 1.5;
        const TITLE_LINE_HEIGHT = TITLE_FONT_SIZE * 1.5;
        const PARAGRAPH_SPACING = LINE_HEIGHT * 0.5;
        const margin = 72; // 1 inch on all sides

        // Array for PDF Outline (Bookmark) refs
        const outlineItemRefs = [];

        // --- Dual Font Rendering Helpers ---
        const CJK_REGEX = /[\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef]/;
        const SPLIT_REGEX = /([\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef]+|[^\u4e00-\u9fa5\u3000-\u303F\uff00-\uffef]+)/g;
        const WRAP_REGEX = /([^\u4e00-\u9fa5\s]+|\s+|[\u4e00-\u9fa5])/g;

        const measureMixedTextWidth = (text, size) => {
            let totalWidth = 0;
            const segments = text.match(SPLIT_REGEX) || [text];
            for (const segment of segments) {
                const font = CJK_REGEX.test(segment) ? chineseFont : englishFont;
                totalWidth += font.widthOfTextAtSize(segment, size, { enableLigatures: false });
            }
            return totalWidth;
        };

        const drawMixedTextLine = (page, text, options) => {
            const { x, y, size } = options;
            let currentX = x;
            const segments = text.match(SPLIT_REGEX) || [text];
            
            for (const segment of segments) {
                const font = CJK_REGEX.test(segment) ? chineseFont : englishFont;
                page.drawText(segment, {
                    x: currentX,
                    y,
                    font,
                    size,
                    color: rgb(0, 0, 0),
                    enableLigatures: false
                });
                currentX += font.widthOfTextAtSize(segment, size, { enableLigatures: false });
            }
        };

        for (const chapter of chaptersData) {
            let page = pdfDoc.addPage(PageSizes.A4);
            const { width, height } = page.getSize();
            tocEntries.push({ title: chapter.title, page });

            const outlineItemDict = pdfDoc.context.obj({
                Title: PDFString.of(chapter.title),
                Dest: [page.ref, PDFName.of('XYZ'), null, height, null],
            });
            outlineItemRefs.push(pdfDoc.context.register(outlineItemDict));
    
            const usableWidth = width - 2 * margin;
            let y = height - margin;
    
            const checkAndAddNewPage = () => {
                if (y < margin) {
                    page = pdfDoc.addPage(PageSizes.A4);
                    y = height - margin;
                }
            };
    
            // Chapter Title
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
                
                if (line.length > 0) {
                    drawMixedTextLine(page, line, { x: margin, y, size: FONT_SIZE });
                }
                y -= (LINE_HEIGHT + PARAGRAPH_SPACING);
            }
        }

        // Create PDF Outlines (Bookmarks)
        if (outlineItemRefs.length > 0) {
            const outlineRootRef = pdfDoc.context.nextRef();
    
            for (let i = 0; i < outlineItemRefs.length; i++) {
                const itemRef = outlineItemRefs[i];
                const item = pdfDoc.context.lookup(itemRef);
    
                item.set(PDFName.of('Parent'), outlineRootRef);
                if (i > 0) item.set(PDFName.of('Prev'), outlineItemRefs[i - 1]);
                if (i < outlineItemRefs.length - 1) item.set(PDFName.of('Next'), outlineItemRefs[i + 1]);
            }
    
            const outlineRoot = pdfDoc.context.obj({
                Type: 'Outlines',
                First: outlineItemRefs[0],
                Last: outlineItemRefs[outlineItemRefs.length - 1],
                Count: outlineItemRefs.length,
            });
    
            pdfDoc.context.assign(outlineRootRef, outlineRoot);
            pdfDoc.catalog.set(PDFName.of('Outlines'), outlineRootRef);
        }
    
        // --- Draw Clickable Table of Contents on the first page ---
        const pages = pdfDoc.getPages();
        const tocTitleSize = 22;
        const tocEntrySize = 14;
        const tocLineHeight = tocEntrySize * 1.8;
        const { width: tocWidth, height: tocHeight } = tocPage.getSize();
        const tocMargin = 72;
        let tocY = tocHeight - tocMargin;

        let tocPageAnnots = tocPage.node.get(PDFName.of('Annots'));
        if (!tocPageAnnots || !(tocPageAnnots instanceof PDFArray)) {
            tocPageAnnots = pdfDoc.context.obj([]);
            tocPage.node.set(PDFName.of('Annots'), tocPageAnnots);
        }
    
        drawMixedTextLine(tocPage, 'Table of Contents', { x: tocMargin, y: tocY, size: tocTitleSize });
        tocY -= tocTitleSize * 2.5;
    
        const tocUsableWidth = tocWidth - (2 * tocMargin);
    
        for (const entry of tocEntries) {
            if (tocY < tocMargin) break;
    
            const pageNumber = pages.indexOf(entry.page) + 1;
            const pageNumText = String(pageNumber);
            let titleText = entry.title;
            const pageNumWidth = englishFont.widthOfTextAtSize(pageNumText, tocEntrySize);
    
            let titleWidth = measureMixedTextWidth(titleText, tocEntrySize);
            while (titleWidth > tocUsableWidth - pageNumWidth - 20) { // 20 for padding
                titleText = titleText.slice(0, -4) + '...';
                titleWidth = measureMixedTextWidth(titleText, tocEntrySize);
            }
    
            drawMixedTextLine(tocPage, titleText, { x: tocMargin, y: tocY, size: tocEntrySize });
            tocPage.drawText(pageNumText, { x: tocWidth - tocMargin - pageNumWidth, y: tocY, font: englishFont, size: tocEntrySize, color: rgb(0, 0, 0) });
    
            const { height: pageHeight } = entry.page.getSize();
            const linkAnnotation = pdfDoc.context.obj({
                Type: 'Annot',
                Subtype: 'Link',
                Rect: [
                    tocMargin,              // left
                    tocY - 4,               // bottom
                    tocWidth - tocMargin,   // right
                    tocY + tocEntrySize,    // top
                ],
                Border: [0, 0, 0], // No visible border
                Dest: [entry.page.ref, PDFName.of('XYZ'), null, pageHeight, null],
            });
            const linkAnnotationRef = pdfDoc.context.register(linkAnnotation);
            tocPageAnnots.push(linkAnnotationRef);

            tocY -= tocLineHeight;
        }
    
        return await pdfDoc.save();
    }
    
    async function generatePdfZip({ usableChaps, pattern, startNumber, mode, groupSize }) {
        updateStatus(statusEl, 'Preparing PDF generation...', 'info');
        
        const fontBytes = await getFonts((msg, type) => updateStatus(statusEl, msg, type));
        
        const JSZip = await getJSZip();
        const zip = new JSZip();

        if (mode === 'single') {
            for (let i = 0; i < usableChaps.length; i++) {
                const chapNum = String(startNumber + i).padStart(2, '0');
                const title = parsedChaptersForSelection.find(c => c.text === usableChaps[i])?.title || `${pattern} ${chapNum}`;
                const chaptersData = [{ title, text: usableChaps[i] }];
                
                const pdfBytes = await createPdfFromChapters(chaptersData, fontBytes);
                zip.file(`${pattern}${chapNum}.pdf`, pdfBytes);
            }
        } else { // grouped
            for (let i = 0; i < usableChaps.length; i += groupSize) {
                const groupStartNum = startNumber + i;
                const groupEndNum = Math.min(startNumber + i + groupSize - 1, startNumber + usableChaps.length - 1);
                
                const name = groupStartNum === groupEndNum
                    ? `${pattern}${String(groupStartNum).padStart(2, '0')}.pdf`
                    : `${pattern}${String(groupStartNum).padStart(2, '0')}-${String(groupEndNum).padStart(2, '0')}.pdf`;
                
                const chapterGroup = usableChaps.slice(i, i + groupSize);
                const chaptersData = chapterGroup.map((text, index) => {
                    const originalChapNum = startNumber + i + index;
                    const chapInfo = parsedChaptersForSelection.find(c => c.text === text);
                    return {
                        title: chapInfo?.title || `${pattern} ${originalChapNum}`,
                        text: text
                    };
                });
                
                const pdfBytes = await createPdfFromChapters(chaptersData, fontBytes);
                zip.file(name, pdfBytes);
            }
        }
        
        const blob = await zip.generateAsync({ type: 'blob' });
        const downloadFilename = `${pattern}_chapters_pdf.zip`;
        await triggerDownload(blob, downloadFilename, 'application/zip', showAppToast);
    }

    splitBtn.addEventListener('click', async () => {
        statusEl.classList.add('hidden');
        downloadSec.classList.add('hidden');

        const selectedChapterIndices = Array.from(chapterListUl.querySelectorAll('input[type="checkbox"]:checked'))
                                            .map(cb => parseInt(cb.value, 10));

        if (selectedChapterIndices.length === 0) {
            showAppToast("No chapters selected to process.", true);
            return updateStatus(statusEl, 'Error: No chapters selected to process.', 'error');
        }
        
        const chaptersToProcess = parsedChaptersForSelection
            .filter(chapInfo => selectedChapterIndices.includes(chapInfo.index))
            .map(chapInfo => chapInfo.text);

        const pattern = chapterPatternEl.value.trim() || 'Chapter';
        const startNumber = parseInt(startNumberEl.value, 10);
        if (isNaN(startNumber) || startNumber < 1) {
            startNumberEl.focus();
            return updateStatus(statusEl, 'Error: Start Number must be 1 or greater.', 'error');
        }
        const offset = parseInt(offsetNumberEl.value, 10);
        if (isNaN(offset) || offset < 0) {
            offsetNumberEl.focus();
            return updateStatus(statusEl, 'Error: Offset must be 0 or greater.', 'error');
        }

        const format = outputFormatEl.value;
        const mode = modeSelect.value;
        let groupSize = 1;
        if (mode === 'grouped') {
            groupSize = parseInt(groupSizeEl.value, 10);
            if (isNaN(groupSize) || groupSize < 1) {
                groupSizeEl.focus();
                return updateStatus(statusEl, 'Error: Chapters per File must be 1 or greater.', 'error');
            }
        }

        splitBtn.disabled = true;
        toggleAppSpinner(true);

        try {
            const usableChaps = chaptersToProcess.slice(offset);
            if (usableChaps.length === 0) {
                throw new Error(`Offset of ${offset} resulted in no chapters to process from your selection.`);
            }
            
            if (format === 'pdf') {
                await generatePdfZip({ usableChaps, pattern, startNumber, mode, groupSize });
            } else {
                await generateTxtZip({ usableChaps, pattern, startNumber, mode, groupSize });
            }
            
            const outputType = format === 'pdf' ? 'PDFs in a ZIP file' : '.txt files in a ZIP file';
            updateStatus(statusEl, `Extracted ${usableChaps.length} chapter(s) as ${outputType}. Download started.`, 'success');
            showAppToast(`Extracted ${usableChaps.length} chapter(s).`);

        } catch (err) {
            console.error("EPUB Splitter Error:", err);
            updateStatus(statusEl, `Error: ${err.message}`, 'error');
            showAppToast(`Error splitting EPUB: ${err.message}`, true);
        } finally {
            toggleAppSpinner(false);
            splitBtn.disabled = false;
        }
    });
    
    // Set initial control visibility on load
    updateSplitterControls();
}