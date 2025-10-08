
import { BackupScene, BackupData } from './types';

export const parseTextToBlocks = (rawText: string): { blocks: Array<{ type: string; align: string; text?: string }> } => {
    const normalizedText = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const contentSegments = normalizedText.split(/\n{2,}/).map(s => s.trim()).filter(s => s !== '');
    const blocks: Array<{ type: string; align: string; text?: string }> = [];

    for (let i = 0; i < contentSegments.length; i++) {
        blocks.push({ type: 'text', align: 'left', text: contentSegments[i] });
        if (i < contentSegments.length - 1) {
           blocks.push({ type: 'text', align: 'left' });
        }
    }

    if (contentSegments.length === 0) {
        if (rawText.trim() === '' && rawText.length > 0) {
            blocks.push({ type: 'text', align: 'left' });
        } else {
            blocks.push({ type: 'text', align: 'left', text: '' });
        }
    }
    return { blocks };
}

export const calculateWordCount = (scenes: BackupScene[]): number => {
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

export const createNewBackupStructure = (title: string, description: string, uniqueCode?: string): BackupData => {
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
};
