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
export async function getFonts() {
    if (FONT_CACHE) return FONT_CACHE;
    try {
        const notoFontUrl = '/fonts/NotoSansSC-Regular.otf';
        const marmeladFontUrl = '/fonts/Marmelad-Regular.ttf';

        const [notoFontBytes, marmeladFontBytes] = await Promise.all([
            fetch(notoFontUrl).then(res => {
                if (!res.ok) throw new Error(`Font load failed: ${res.status}. Could not fetch NotoSansSC font from '${notoFontUrl}'. Make sure the file exists in 'public/fonts/'.`);
                return res.arrayBuffer();
            }),
            fetch(marmeladFontUrl).then(res => {
                if (!res.ok) throw new Error(`Failed to load Marmelad font from '${marmeladFontUrl}': ${res.status}. Make sure the file exists in 'public/fonts/'.`);
                return res.arrayBuffer();
            })
        ]);
        
        FONT_CACHE = { notoFontBytes, marmeladFontBytes };
        return FONT_CACHE;
    } catch (error: any) {
        console.error("Font load failed:", error);
        throw new Error(`Font load failed: ${error.message}`);
    }
}