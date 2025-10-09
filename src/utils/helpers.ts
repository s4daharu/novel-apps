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

let FONT_CACHE: { notoFontBytes: ArrayBuffer; latinFontBytes: ArrayBuffer; } | null = null;

async function fetchFont(url: string, fontName: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${fontName} font from ${url}: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
}

export async function getFonts() {
    if (FONT_CACHE) return FONT_CACHE;
    try {
        // Use a font with broad Latin character support for Pinyin, etc.
        const latinFontUrl = '/fonts/NotoSans-Regular.ttf';
        
        // Use the local Alibaba PuHuiTi font for Chinese characters.
        const chineseFontUrl = '/fonts/Alibaba-PuHuiTi-Heavy.otf';

        const [latinFontBytes, chineseFontBytes] = await Promise.all([
            fetchFont(latinFontUrl, 'Noto Sans'),
            fetchFont(chineseFontUrl, 'Alibaba PuHuiTi')
        ]);
        
        FONT_CACHE = { notoFontBytes: chineseFontBytes, latinFontBytes };
        return FONT_CACHE;
    } catch (error: any) {
        console.error("Font load for PDF failed:", error);
        throw new Error(`Font load for PDF failed: ${error.message}`);
    }
}