
import React, { useState, useRef } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { FileInput } from '../components/FileInput';
import { StatusMessage } from '../components/StatusMessage';
import { triggerDownload, getJSZip, escapeHTML, extractTextFromHtml } from '../utils/helpers';
import { Status } from '../utils/types';

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
        <div id="epubToZipApp" className="space-y-5">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">EPUB to ZIP (TXT)</h1>
            <div className="max-w-md mx-auto">
                <FileInput inputId="epubUploadForTxt" label="Upload EPUB File" accept=".epub" onFileSelected={handleFileSelected} onFileCleared={resetUI} />
            </div>

            {chapters.length > 0 && (
                 <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600/50">
                    <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 text-center">Select Chapters to Extract:</h4>
                    <div className="my-4 flex justify-center gap-3">
                        <button onClick={() => setSelectedIndices(new Set(chapters.map(c => c.originalIndex)))} className="inline-flex items-center justify-center rounded-lg font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 px-3 py-1 text-sm">Select All</button>
                        <button onClick={() => setSelectedIndices(new Set())} className="inline-flex items-center justify-center rounded-lg font-medium bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 px-3 py-1 text-sm">Deselect All</button>
                    </div>
                    <ul className="max-w-xl mx-auto max-h-48 overflow-y-auto bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-3 list-none text-left">
                        {chapters.map(c => (
                            <li key={c.id} className="flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
                                <input type="checkbox" id={c.id} checked={selectedIndices.has(c.originalIndex)} onChange={e => setSelectedIndices(p => { const s = new Set(p); e.target.checked ? s.add(c.originalIndex) : s.delete(c.originalIndex); return s; })} className="w-4 h-4 rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600" />
                                <label htmlFor={c.id} className="text-sm text-slate-700 dark:text-slate-300 flex-1 cursor-pointer">{c.title}</label>
                            </li>
                        ))}
                    </ul>
                 </div>
            )}

            <div className="max-w-md mx-auto space-y-4">
                <div>
                    <label className="flex items-center gap-2 justify-center text-slate-800 dark:text-slate-200 select-none cursor-pointer">
                        <input type="checkbox" checked={enableRemoveLines} onChange={e => setEnableRemoveLines(e.target.checked)} className="w-4 h-4 align-middle rounded border-slate-400 dark:border-slate-500 focus:ring-2 focus:ring-primary-500 accent-primary-600"/>
                        Remove initial lines from chapters
                    </label>
                </div>
                {enableRemoveLines && (
                    <div className="text-center">
                        <label htmlFor="linesToRemove" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Number of lines to remove:</label>
                        <input type="number" id="linesToRemove" min="0" value={linesToRemove} onChange={e => setLinesToRemove(parseInt(e.target.value, 10))} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/50 transition-all duration-200 max-w-[100px] mx-auto" />
                    </div>
                )}
            </div>
            <div className="text-center">
                <button onClick={handleExtract} disabled={!epubFile || chapters.length === 0} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 disabled:opacity-60 disabled:cursor-not-allowed">Extract Chapters to ZIP</button>
            </div>
            <StatusMessage status={status} />
        </div>
    );
};

const ZipToEpub: React.FC = () => {
    const { showToast, showSpinner, hideSpinner } = useAppContext();
    const [zipFile, setZipFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [epubTitle, setEpubTitle] = useState('');
    const [epubLang, setEpubLang] = useState('en');
    type Chapter = { name: string; content: string; title: string; };
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [status, setStatus] = useState<Status | null>(null);
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
                .sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (loadedChapters.length === 0) throw new Error("No .txt files found in ZIP.");
            setChapters(loadedChapters);
            setStatus({ message: `Found ${loadedChapters.length} chapters.`, type: 'success' });
        } catch (err: any) {
            setStatus({ message: `Error reading ZIP: ${err.message}`, type: 'error' });
        } finally {
            hideSpinner();
        }
    };

    const handleChapterTitleChange = (index: number, newTitle: string) => {
        setChapters(prev => {
            const newChapters = [...prev];
            newChapters[index].title = newTitle;
            return newChapters;
        });
    };
    
    const handleCreateEpub = async () => {
        setStatus(null);
        if (chapters.length === 0) return setStatus({ message: "No chapters loaded.", type: 'error' });
        if (!epubTitle) return setStatus({ message: "EPUB Title is required.", type: 'error' });

        showSpinner();
        try {
            const JSZip = await getJSZip();
            const epubZip = new JSZip();
            const bookUUID = crypto.randomUUID();
            epubZip.file("mimetype", "application/epub+zip", { compression: "STORE" });
            epubZip.folder("META-INF")!.file("container.xml", `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
            
            const oebps = epubZip.folder("OEBPS")!;
            oebps.folder("css")!.file("style.css", "body{font-family:sans-serif;line-height:1.6;} h2{text-align:center;font-weight:bold;} p{text-indent:1.5em; margin-top:0; margin-bottom:0; text-align:justify;} p+p{margin-top: 1em;}");

            const manifestItems: any[] = [{ id: "css", href: "css/style.css", "media-type": "text/css" }, { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }];
            const spineItems: any[] = [];
            
            if (coverFile) {
                const ext = coverFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const mediaType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
                oebps.folder("images")!.file(`cover.${ext}`, await coverFile.arrayBuffer());
                manifestItems.push({ id: "cover-image", href: `images/cover.${ext}`, "media-type": mediaType, properties: "cover-image" });
                oebps.folder("text")!.file("cover.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="text-align:center;margin:0;padding:0;"><img src="../images/cover.${ext}" alt="Cover" style="max-width:100%;max-height:100vh;object-fit:contain;"/></body></html>`);
                manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: "cover-page", linear: "no" });
            }

            const textToXHTML = (text: string, chapterTitle: string) => {
                const bodyContent = text.split('\n').filter(line => line.trim()).map(line => `<p>${escapeHTML(line)}</p>`).join('\n');
                return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${epubLang}"><head><title>${escapeHTML(chapterTitle)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><h2>${escapeHTML(chapterTitle)}</h2>${bodyContent}</body></html>`;
            };

            chapters.forEach((chapter, i) => {
                const filename = `chapter_${i + 1}.xhtml`;
                const xhtml = textToXHTML(chapter.content, chapter.title);
                oebps.folder("text")!.file(filename, xhtml);
                const itemId = `chapter-${i + 1}`;
                manifestItems.push({ id: itemId, href: `text/${filename}`, "media-type": "application/xhtml+xml" });
                spineItems.push({ idref: itemId });
            });
            
            // Add NCX for EPUB 2 compatibility
            const ncxNavPoints = chapters.map((chapter, i) => `
                <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
                    <navLabel><text>${escapeHTML(chapter.title)}</text></navLabel>
                    <content src="text/chapter_${i + 1}.xhtml"/>
                </navPoint>`).join('');

            const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
    <meta name="dtb:uid" content="urn:uuid:${bookUUID}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeHTML(epubTitle)}</text></docTitle>
<navMap>${ncxNavPoints}</navMap>
</ncx>`;

            oebps.file("toc.ncx", ncxContent);
            manifestItems.push({ id: "ncx", href: "toc.ncx", "media-type": "application/x-dtbncx+xml" });

            const navLiItems = chapters.map((c, i) => `<li><a href="text/chapter_${i+1}.xhtml">${escapeHTML(c.title)}</a></li>`).join("\n");
            oebps.file("nav.xhtml", `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navLiItems}</ol></nav></body></html>`);

            const contentOPF = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">urn:uuid:${bookUUID}</dc:identifier><dc:title>${escapeHTML(epubTitle)}</dc:title><dc:language>${escapeHTML(epubLang)}</dc:language><dc:creator>${escapeHTML('')}</dc:creator><meta property="dcterms:modified">${new Date().toISOString()}</meta>${coverFile ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifestItems.map(item => `<item id="${item.id}" href="${item.href}" media-type="${item["media-type"]}" ${item.properties ? `properties="${item.properties}"` : ''}/>`).join("")}</manifest><spine toc="ncx">${spineItems.map(item => `<itemref idref="${item.idref}" ${item.linear ? `linear="${item.linear}"` : ''}/>`).join("")}</spine></package>`;
            oebps.file("content.opf", contentOPF);

            const epubBlob = await epubZip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
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
         <div id="zipToEpubApp" className="space-y-5">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">ZIP to EPUB Converter</h1>
            <div className="max-w-md mx-auto space-y-4">
                <FileInput inputId="zipUpload" label="Upload ZIP with .txt Chapters" accept=".zip" onFileSelected={handleFileSelected} onFileCleared={resetUI} />
                
                {chapters.length > 0 && (
                    <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Chapter Order & Titles (drag to reorder):</label>
                        <ul className="max-h-64 overflow-y-auto border rounded-lg bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600">
                            {chapters.map((chap, index) => (
                                <li key={chap.name} draggable onDragStart={() => (draggedItemIndex.current = index)} onDragEnter={() => (draggedOverItemIndex.current = index)} onDragEnd={handleDragSort} onDragOver={e => e.preventDefault()}
                                    className="flex items-center p-2 border-b dark:border-slate-700 last:border-b-0 cursor-grab">
                                    <input type="text" value={chap.title} onChange={e => handleChapterTitleChange(index, e.target.value)} className="flex-grow bg-transparent p-1 rounded-md border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-primary-500" />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                
                <div className="p-4 bg-slate-100/50 dark:bg-slate-700/20 rounded-lg border border-slate-200 dark:border-slate-600/30 space-y-4">
                     <div>
                        <label htmlFor="epubTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">EPUB Title:</label>
                        <input type="text" id="epubTitle" value={epubTitle} onChange={e => setEpubTitle(e.target.value)} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 w-full" />
                    </div>
                    <div>
                         <label htmlFor="epubLang" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Language Code:</label>
                         <input type="text" id="epubLang" value={epubLang} onChange={e => setEpubLang(e.target.value)} className="bg-slate-100 dark:bg-slate-700 border-2 border-transparent rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:border-primary-500 w-full" />
                    </div>
                    <FileInput inputId="coverUpload" label="Upload Cover Image (Optional)" accept="image/jpeg,image/png" onFileSelected={files => setCoverFile(files[0])} onFileCleared={() => setCoverFile(null)} />
                </div>
                
                <div className="text-center">
                    <button onClick={handleCreateEpub} disabled={chapters.length === 0} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-primary-600 hover:bg-primary-700 text-white shadow-lg disabled:opacity-50">Create EPUB</button>
                </div>
                <StatusMessage status={status} />
            </div>
        </div>
    );
};

export const ZipEpub: React.FC = () => {
  const [mode, setMode] = useState<'zipToEpub' | 'epubToZip'>('zipToEpub');

  return (
    <div id="zipEpubApp" className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in will-change-[transform,opacity]">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">ZIP ↔ EPUB Converter</h1>
      <div className="max-w-md mx-auto mb-6">
        <label className="text-center block mb-4 text-slate-800 dark:text-slate-200">Conversion Direction:</label>
        <div className="flex justify-center gap-3 mt-2">
          <button
            onClick={() => setMode('zipToEpub')}
            className={`flex items-center px-6 py-3 rounded-lg font-medium shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 hover:scale-105 ${
              mode === 'zipToEpub'
                ? 'bg-primary-600 text-white focus:ring-primary-500 hover:bg-primary-700'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:ring-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            <span>ZIP → EPUB</span>
          </button>
          <button
            onClick={() => setMode('epubToZip')}
            className={`flex items-center px-6 py-3 rounded-lg font-medium shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 hover:scale-105 ${
              mode === 'epubToZip'
                ? 'bg-primary-600 text-white focus:ring-primary-500 hover:bg-primary-700'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:ring-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            <span>EPUB → ZIP</span>
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">Choose your conversion direction</p>
      </div>

      <div id="zipEpubHost">
        {mode === 'zipToEpub' ? <ZipToEpub /> : <EpubToZip />}
      </div>
    </div>
  );
};
