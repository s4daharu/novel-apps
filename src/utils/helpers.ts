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

let FONT_CACHE: { notoFontBytes: ArrayBuffer; marmeladFontBytes: ArrayBuffer; } | null = null;

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
        // Use the local Marmelad font for consistency with the UI.
        const marmeladFontUrl = '/public/fonts/Marmelad-Regular.ttf';
        
        // Use a stable, full OTF version of Noto Sans SC from a CDN for PDF embedding.
        // This is more reliable than the WOFF2 from Google's dynamic API.
        const notoFontUrl = 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.otf';

        const [marmeladFontBytes, notoFontBytes] = await Promise.all([
            fetchFont(marmeladFontUrl, 'Marmelad'),
            fetchFont(notoFontUrl, 'Noto Sans SC')
        ]);
        
        FONT_CACHE = { notoFontBytes, marmeladFontBytes };
        return FONT_CACHE;
    } catch (error: any) {
        console.error("Font load for PDF failed:", error);
        throw new Error(`Font load for PDF failed: ${error.message}`);
    }
}