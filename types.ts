import React from 'react';

export type Theme = 'light' | 'dark';

export interface Tool {
    id: string;
    title: string;
    description: string;
    component: React.LazyExoticComponent<React.FC<any>>;
}

export interface ToastMessage {
    id: number;
    message: string;
    isError: boolean;
}
