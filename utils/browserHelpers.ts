/**
 * Triggers a file download in the browser.
 * @param blob The Blob to download.
 * @param filename The desired filename.
 * @param showToast An optional function to display toast notifications.
 */
export function triggerDownload(blob: Blob, filename: string, showToast?: (message: string, isError?: boolean) => void) {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        document.body.removeChild(a);
        // Use a timeout to ensure the download has time to start, especially in Firefox.
        setTimeout(() => URL.revokeObjectURL(url), 150);
        
        if (showToast) {
            showToast(`Download started: ${filename}`);
        }
    } catch (error: any) {
        console.error("Download error:", error);
        if (showToast) {
            showToast(`Error during download: ${error.message || 'Unknown error'}`, true);
        }
    }
}