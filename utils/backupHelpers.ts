/**
 * Helper functions for creating and manipulating novel backup file structures.
 */

interface TextBlock {
    type: 'text';
    align: 'left';
    text?: string;
}

/**
 * Parses raw text into the structured block format used in backup files.
 * This version correctly handles paragraphs separated by multiple newlines.
 * @param rawText The raw text content of a chapter.
 * @returns An object with a 'blocks' array.
 */
export function parseTextToBlocks(rawText: string): { blocks: TextBlock[] } {
    if (typeof rawText !== 'string') {
        return { blocks: [{ type: 'text', align: 'left', text: '' }] };
    }

    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Split by one or more empty lines to correctly identify paragraphs
    const paragraphs = normalizedText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

    if (paragraphs.length === 0) {
        // Handle cases where the input is empty or just whitespace
        return { blocks: [{ type: 'text', align: 'left', text: rawText.trim() ? rawText : '' }] };
    }

    const blocks: TextBlock[] = paragraphs.map(p => ({ type: 'text', align: 'left', text: p }));
    
    return { blocks };
}


/**
 * Calculates the total word count from an array of scenes.
 * @param scenes Array of scene objects from a backup file.
 * @returns The total word count.
 */
export function calculateWordCount(scenes: { text: string }[]): number {
    if (!scenes || !Array.isArray(scenes)) return 0;
    
    return scenes.reduce((totalWordCount, scene) => {
        try {
            // Scene text is a stringified JSON object
            const sceneContent: { blocks: TextBlock[] } = JSON.parse(scene.text);
            if (sceneContent.blocks && Array.isArray(sceneContent.blocks)) {
                sceneContent.blocks.forEach(block => {
                    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                        // Split by any sequence of whitespace characters
                        totalWordCount += block.text.trim().split(/\s+/).length;
                    }
                });
            }
        } catch (e) {
            console.warn("Word count parse error for a scene:", e);
        }
        return totalWordCount;
    }, 0);
}


/**
 * Creates a new, empty backup file structure.
 * @param title The project title.
 * @param description The project description.
 * @param uniqueCode A unique code for the project. If not provided, one is generated.
 * @returns A complete, valid backup file object.
 */
export function createNewBackupStructure(title: string, description: string, uniqueCode?: string) {
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
            scenes: [] as any[],
            sections: [] as any[]
        }]
    };
}