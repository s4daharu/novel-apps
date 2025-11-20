

declare global {
    interface Window {
        JSZip: any;
    }
}

export const escapeHTML = (str: string | undefined): string => {
    if (typeof str !== 'string') return '';
    const lookup: { [key: string]: string } = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, (c) => lookup[c]);
};

export const triggerDownload = (blob: Blob, filename: string) => {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error("Browser download error:", error);
        return false;
    }
};

export const getJSZip = async (): Promise<any> => {
    if (window.JSZip) {
        return window.JSZip;
    }
    try {
        const mod = await import('jszip');
        return (mod && mod.default) || mod;
    } catch (e) {
        throw new Error('JSZip not available.');
    }
};

export async function pMap<T, R>(
    array: T[],
    mapper: (item: T, index: number) => Promise<R>,
    concurrency: number
  ): Promise<R[]> {
    const results = new Array<R>(array.length);
    let index = 0;
    const next = async (): Promise<void> => {
      while (index < array.length) {
        const i = index++;
        results[i] = await mapper(array[i], i);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, next));
    return results;
  }

let FONT_CACHE: { cjkFontBytes: ArrayBuffer; latinFontBytes: ArrayBuffer; } | null = null;

async function fetchFont(url: string, fontName: string): Promise<ArrayBuffer> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${fontName} from ${url}: ${response.status} ${response.statusText}`);
        }
        return await response.arrayBuffer();
    } catch (error: any) {
        // Propagate error with context
        throw new Error(`Could not load ${fontName}. ${error.message}`);
    }
}

export async function getFonts() {
    if (FONT_CACHE) return FONT_CACHE;
    try {
        // Use a font with broad Latin character support for Pinyin, etc.
        const latinFontUrl = '/fonts/NotoSans-Regular.ttf';
        
        // Use Alibaba PuHuiTi Heavy for CJK character support in PDFs.
        const cjkFontUrl = '/fonts/Alibaba-PuHuiTi-Heavy.otf';

        const [latinFontBytes, cjkFontBytes] = await Promise.all([
            fetchFont(latinFontUrl, 'Latin Font (Noto Sans)'),
            fetchFont(cjkFontUrl, 'CJK Font (Alibaba PuHuiTi Heavy)')
        ]);
        
        FONT_CACHE = { cjkFontBytes, latinFontBytes };
        return FONT_CACHE;
    } catch (error: any) {
        console.error("Font load for PDF failed:", error);
        // We throw here so the UI can catch it and display a specific error message about missing fonts
        throw new Error(`Font loading failed. PDF generation requires local font files. Details: ${error.message}`);
    }
}
