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

async function fetchFontFromGoogleAPI(fontFamily: string): Promise<ArrayBuffer> {
    // Step 1: Fetch CSS from Google Fonts API
    const cssUrl = `https://fonts.googleapis.com/css2?family=${fontFamily}&display=swap`;
    const cssResponse = await fetch(cssUrl);
    if (!cssResponse.ok) {
        throw new Error(`Failed to fetch CSS for ${fontFamily} from Google Fonts API: ${cssResponse.status}`);
    }
    const cssText = await cssResponse.text();
    
    // Step 2: Extract font URL from CSS
    const urlMatch = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/);
    if (!urlMatch) throw new Error(`Could not extract font URL for ${fontFamily}`);
    
    // Step 3: Fetch the actual font file
    const fontUrl = urlMatch[1];
    const fontResponse = await fetch(fontUrl);
    if (!fontResponse.ok) throw new Error(`Failed to fetch font: ${fontResponse.status}`);
    
    return await fontResponse.arrayBuffer();
}

export async function getFonts() {
    if (FONT_CACHE) return FONT_CACHE;
    try {
        const [marmeladFontBytes, notoFontBytes] = await Promise.all([
            fetchFontFromGoogleAPI('Marmelad'),
            fetchFontFromGoogleAPI('Noto+Sans+SC')
        ]);
        
        FONT_CACHE = { notoFontBytes, marmeladFontBytes };
        return FONT_CACHE;
    } catch (error: any) {
        console.error("Font load for PDF failed:", error);
        throw new Error(`Font load for PDF failed: ${error.message}`);
    }
}