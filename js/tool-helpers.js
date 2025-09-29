/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Common helper functions for tool UI and logic.
 */

/**
 * Sets up a file input with a display area and a clear button.
 * @param {object} options
 * @param {HTMLElement} options.inputEl The file input element.
 * @param {HTMLElement} options.fileNameEl The element to display the file name.
 * @param {HTMLElement} options.clearBtnEl The button to clear the file input.
 * @param {Function} options.onFileSelected A callback function executed when file(s) are selected. It receives the FileList.
 * @param {Function} [options.onFileCleared] An optional callback when the file selection is cleared.
 * @param {Function} [options.onButtonUpdate] An optional callback to enable/disable action buttons. It receives a boolean indicating if files are present.
 */
export function setupFileInput({ inputEl, fileNameEl, clearBtnEl, onFileSelected, onFileCleared, onButtonUpdate }) {
    if (!inputEl || !fileNameEl || !clearBtnEl) {
        console.error(`File input setup failed for ${inputEl?.id}. One or more elements not found.`);
        return;
    }

    const handleFileChange = (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            if (files.length === 1) {
                fileNameEl.innerHTML = `<span>${fileNameEl.dataset.prefix || 'Selected:'} ${files[0].name}</span>`;
            } else {
                 let fileListHtml = `<div class="text-xs text-slate-500 dark:text-slate-400 mb-2">Selected files:</div><ul class="list-disc list-inside text-sm -mt-1">`;
                for (let i = 0; i < files.length; i++) {
                    fileListHtml += `<li>${files[i].name}</li>`;
                }
                fileListHtml += '</ul>';
                fileNameEl.innerHTML = fileListHtml;
            }
            clearBtnEl.classList.remove('hidden');
            if (onFileSelected) onFileSelected(files);
        } else {
            fileNameEl.textContent = 'No file(s) selected.';
            clearBtnEl.classList.add('hidden');
            if (onFileCleared) onFileCleared();
        }
        if (onButtonUpdate) onButtonUpdate(files && files.length > 0);
    };
    
    const handleClear = () => {
        inputEl.value = '';
        fileNameEl.textContent = 'No file(s) selected.';
        clearBtnEl.classList.add('hidden');
        if (onFileCleared) onFileCleared();
        if (onButtonUpdate) onButtonUpdate(false);
    };

    inputEl.addEventListener('change', handleFileChange);
    clearBtnEl.addEventListener('click', handleClear);
    
    // Return a cleanup function in case it's needed for dynamic components later
    return () => {
        inputEl.removeEventListener('change', handleFileChange);
        clearBtnEl.removeEventListener('click', handleClear);
    };
}


/**
 * Updates a status message element with appropriate text and styling.
 * @param {HTMLElement|null} statusEl The status message element.
 * @param {string} message The message to display.
 * @param {'success'|'error'|'info'|'warning'} [type='info'] The type of message.
 */
export function updateStatus(statusEl, message, type = 'info') {
    if (!statusEl) return;

    statusEl.textContent = message;
    
    const baseClasses = 'rounded-xl p-4 mt-5 text-center text-sm';
    const typeClasses = {
        success: 'bg-green-50 dark:bg-green-600/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400',
        error: 'bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400',
        warning: 'bg-yellow-50 dark:bg-yellow-400/10 border border-yellow-200 dark:border-yellow-500/30 text-yellow-800 dark:text-yellow-300',
        info: 'bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300'
    };

    statusEl.className = `${baseClasses} ${typeClasses[type] || typeClasses['info']}`;
    statusEl.classList.remove('hidden');
}
