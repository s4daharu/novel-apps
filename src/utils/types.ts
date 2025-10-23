import React from 'react';

export type ToastMessage = {
  id: number;
  message: string;
  isError: boolean;
};

export type AppContextType = {
  showToast: (message: string, isError?: boolean) => void;
  showSpinner: () => void;
  hideSpinner: () => void;
};

export type Status = {
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
};

export type BackupScene = {
    code: string;
    title: string;
    text: string;
    ranking: number;
    status: string;
    originalTitle?: string;
};

export type BackupSection = {
    code: string;
    title: string;
    synopsis: string;
    ranking: number;
    section_scenes: { code: string; ranking: number }[];
    originalTitle?: string;
};

export type BackupRevision = {
    number: number;
    date: number;
    book_progresses: { year: number; month: number; day: number; word_count: number }[];
    statuses: { code: string; title: string; color: number; ranking: number }[];
    scenes: BackupScene[];
    sections: BackupSection[];
};

export type BackupData = {
    version: number;
    code: string;
    title: string;
    description: string;
    cover?: string | null;
    show_table_of_contents: boolean;
    apply_automatic_indentation: boolean;
    last_update_date: number;
    last_backup_date: number;
    revisions: BackupRevision[];
};

// Types for Find & Replace tool
export type FrMatch = {
  sceneCode: string;
  sceneTitle: string;
  index: number;
  length: number;
  text: string;
};

export type FrReviewItem = FrMatch & {
  id: number;
  context: React.ReactNode;
};

// Types for Backup Organizer tool
export type BackupOrganizerFileInfo = {
    fullPath: string;
    originalName: string;
    folderPath: string;
    zipEntry: any; // from JSZip
    size: number;
    dateObject: Date;
    fileType: string;
    // For .nov files
    seriesName?: string;
    timestamp?: number;
    jsonData?: BackupData;
};
