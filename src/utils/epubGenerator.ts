/**
 * Shared EPUB generation utility
 * Consolidates EPUB creation logic used by NovelSplitter and ZipToEpub
 */

import { escapeHTML, generateUUID } from './helpers';

export interface EpubChapter {
    title: string;
    content: string;
}

export interface EpubMetadata {
    title: string;
    author?: string;
    language: string;
    coverImageData?: ArrayBuffer;
    coverImageExt?: string;
}

export interface EpubGenerationResult {
    zip: any;
    uuid: string;
}

/**
 * Generates an EPUB structure in a JSZip instance
 * @param JSZip - The JSZip constructor
 * @param chapters - Array of chapters with title and content
 * @param metadata - EPUB metadata
 * @returns Promise with the populated JSZip instance
 */
export async function generateEpubStructure(
    JSZip: any,
    chapters: EpubChapter[],
    metadata: EpubMetadata
): Promise<EpubGenerationResult> {
    const zip = new JSZip();
    const bookUUID = generateUUID();

    // Required mimetype file (must be uncompressed)
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

    // Container file
    zip.folder("META-INF")!.file(
        "container.xml",
        `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
    );

    const oebps = zip.folder("OEBPS")!;

    // Stylesheet
    oebps.folder("css")!.file(
        "style.css",
        "body{font-family:sans-serif;line-height:1.6;} h2{text-align:center;font-weight:bold;} p{text-indent:1.5em; margin-top:0; margin-bottom:0; text-align:justify;} p+p{margin-top: 1em;}"
    );

    const manifestItems: { id: string; href: string; "media-type": string; properties?: string }[] = [
        { id: "css", href: "css/style.css", "media-type": "text/css" },
        { id: "nav", href: "nav.xhtml", "media-type": "application/xhtml+xml", properties: "nav" }
    ];
    const spineItems: { idref: string; linear?: string }[] = [];

    // Handle cover image if provided
    if (metadata.coverImageData && metadata.coverImageExt) {
        const ext = metadata.coverImageExt;
        oebps.folder("images")!.file(`cover.${ext}`, metadata.coverImageData);
        manifestItems.push({
            id: "cover-image",
            href: `images/cover.${ext}`,
            "media-type": `image/${ext === 'jpg' ? 'jpeg' : ext}`,
            properties: "cover-image"
        });
        oebps.folder("text")!.file(
            "cover.xhtml",
            `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="text-align:center;margin:0;padding:0;"><img src="../images/cover.${ext}" alt="Cover" style="max-width:100%;max-height:100vh;object-fit:contain;"/></body></html>`
        );
        manifestItems.push({ id: "cover-page", href: "text/cover.xhtml", "media-type": "application/xhtml+xml" });
        spineItems.push({ idref: "cover-page", linear: "no" });
    }

    // Generate chapter files
    chapters.forEach((chapter, i) => {
        const filename = `chapter_${i + 1}.xhtml`;
        const bodyContent = chapter.content
            .split('\n')
            .filter(line => line.trim())
            .map(line => `<p>${escapeHTML(line)}</p>`)
            .join('\n');

        oebps.folder("text")!.file(
            filename,
            `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${metadata.language}"><head><title>${escapeHTML(chapter.title)}</title><link rel="stylesheet" type="text/css" href="../css/style.css"/></head><body><h2>${escapeHTML(chapter.title)}</h2>${bodyContent}</body></html>`
        );

        manifestItems.push({
            id: `chapter-${i + 1}`,
            href: `text/${filename}`,
            "media-type": "application/xhtml+xml"
        });
        spineItems.push({ idref: `chapter-${i + 1}` });
    });

    // NCX for EPUB 2 compatibility
    const ncxNavPoints = chapters
        .map(
            (chapter, i) => `
        <navPoint id="navPoint-${i + 1}" playOrder="${i + 1}">
            <navLabel><text>${escapeHTML(chapter.title)}</text></navLabel>
            <content src="text/chapter_${i + 1}.xhtml"/>
        </navPoint>`
        )
        .join('');

    const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head>
    <meta name="dtb:uid" content="urn:uuid:${bookUUID}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
</head>
<docTitle><text>${escapeHTML(metadata.title)}</text></docTitle>
<navMap>${ncxNavPoints}</navMap>
</ncx>`;

    oebps.file("toc.ncx", ncxContent);
    manifestItems.push({ id: "ncx", href: "toc.ncx", "media-type": "application/x-dtbncx+xml" });

    // Navigation document (EPUB 3)
    const navLiItems = chapters
        .map((c, i) => `<li><a href="text/chapter_${i + 1}.xhtml">${escapeHTML(c.title)}</a></li>`)
        .join("\n");

    oebps.file(
        "nav.xhtml",
        `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol>${navLiItems}</ol></nav></body></html>`
    );

    // Content OPF (package file)
    const manifestXml = manifestItems
        .map(
            item =>
                `<item id="${item.id}" href="${item.href}" media-type="${item["media-type"]}" ${item.properties ? `properties="${item.properties}"` : ''}/>`
        )
        .join("");

    const spineXml = spineItems
        .map(item => `<itemref idref="${item.idref}" ${item.linear ? `linear="${item.linear}"` : ''}/>`)
        .join("");

    const contentOPF = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">urn:uuid:${bookUUID}</dc:identifier><dc:title>${escapeHTML(metadata.title)}</dc:title><dc:language>${escapeHTML(metadata.language)}</dc:language><dc:creator>${escapeHTML(metadata.author || '')}</dc:creator><meta property="dcterms:modified">${new Date().toISOString()}</meta>${metadata.coverImageData ? '<meta name="cover" content="cover-image"/>' : ''}</metadata><manifest>${manifestXml}</manifest><spine toc="ncx">${spineXml}</spine></package>`;

    oebps.file("content.opf", contentOPF);

    return { zip, uuid: bookUUID };
}

/**
 * Generates an EPUB blob ready for download
 * @param JSZip - The JSZip constructor
 * @param chapters - Array of chapters
 * @param metadata - EPUB metadata
 * @returns Promise with the EPUB blob
 */
export async function generateEpubBlob(
    JSZip: any,
    chapters: EpubChapter[],
    metadata: EpubMetadata
): Promise<Blob> {
    const { zip } = await generateEpubStructure(JSZip, chapters, metadata);
    return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}
