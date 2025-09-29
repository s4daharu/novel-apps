/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Helper functions for creating and manipulating novel backup file structures.
 */

/**
 * Parses raw text into the structured block format used in backup files.
 * Handles paragraphs separated by one or more blank lines.
 * @param {string} rawText The raw text content of a chapter.
 * @returns {{blocks: Array<{type: string, align: string, text?: string}>}}
 */
export function parseTextToBlocks(rawText) {
    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split by two or more newlines to identify paragraphs
    const contentSegments = normalizedText.split(/\n{2,}/)
                                    .map(s => s.trim())
                                    .filter(s => s !== '');
    const blocks = [];

    // This logic ensures that paragraphs are preserved, and empty lines between them are represented correctly.
    for (let i = 0; i < contentSegments.length; i++) {
        blocks.push({ type: 'text', align: 'left', text: contentSegments[i] });
        // Add an empty block for spacing, but not after the last paragraph
        if (i < contentSegments.length - 1) {
           blocks.push({ type: 'text', align: 'left' });
        }
    }

    // Handle edge cases for empty or whitespace-only content
    if (contentSegments.length === 0) {
        if (rawText.trim() === '' && rawText.length > 0) {
            // Content is just whitespace (e.g., a few newlines)
            blocks.push({ type: 'text', align: 'left' });
        } else {
            // Content is truly empty
            blocks.push({ type: 'text', align: 'left', text: '' });
        }
    }

    return { blocks };
}

/**
 * Calculates the total word count from an array of scenes.
 * @param {Array<{text: string}>} scenes Array of scene objects from a backup file.
 * @returns {number} The total word count.
 */
export function calculateWordCount(scenes) {
    if (!scenes || !Array.isArray(scenes)) return 0;
    
    return scenes.reduce((totalWordCount, scene) => {
        try {
            const sceneContent = JSON.parse(scene.text);
            if (sceneContent.blocks && Array.isArray(sceneContent.blocks)) {
                sceneContent.blocks.forEach(block => {
                    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                        totalWordCount += block.text.trim().split(/\s+/).length;
                    }
                });
            }
        } catch (e) {
            console.warn("Word count parse error for scene:", scene.title, e);
        }
        return totalWordCount;
    }, 0);
}


/**
 * Creates a new, empty backup file structure.
 * @param {string} title The project title.
 * @param {string} description The project description.
 * @param {string} [uniqueCode] A unique code for the project. If not provided, one is generated.
 * @returns {object} A complete, valid backup file object.
 */
export function createNewBackupStructure(title, description, uniqueCode) {
    const now = Date.now();
    const code = uniqueCode || Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
    return {
        version: 4,
        code: code,
        title: title,
        description: description,
        show_table_of_contents: true,
        apply_automatic_indentation: false,
        last_update_date: now,
        last_backup_date: now,
        revisions: [{
            number: 1,
            date: now,
            book_progresses: [{
                year: new Date().getFullYear(),
                month: new Date().getMonth() + 1,
                day: new Date().getDate(),
                word_count: 0
            }],
            statuses: [{ code: '1', title: 'Todo', color: -2697255, ranking: 1 }],
            scenes: [],
            sections: []
        }]
    };
}
