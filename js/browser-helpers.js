/**
 * Browser-compatible file operations to replace Capacitor functionality
 */

/**
 * Get JSZip with fallback support
 * @returns {Promise<JSZip>} JSZip instance
 */
export async function getJSZip() {
    try {
        // Try ESM import first (online)
        const mod = await import('jszip');
        return (mod && mod.default) || mod;
    } catch (e) {
        // Fallback to global UMD (offline)
        if (window.JSZip) {
            return window.JSZip;
        }
        throw new Error('JSZip not available. Please check your internet connection or ensure jszip.min.js is loaded.');
    }
}

/**
 * Triggers a file download using standard browser APIs
 * @param {Blob} blob The Blob to download
 * @param {string} filename The desired filename for the downloaded file
 * @param {string} mimeType The MIME type of the file
 * @param {Function} showAppToast A function to display toast notifications
 */
export async function triggerDownload(blob, filename, mimeType, showAppToast) {
    console.log(`triggerDownload: Starting browser download for "${filename}".`);

    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showAppToast(`Download started: ${filename}`, false);
    } catch (webDownloadError) {
        console.error("triggerDownload: Browser download error:", webDownloadError);
        showAppToast(`Error during download: ${webDownloadError.message || 'Unknown error'}`, true);
    }
}
