
import React from 'react';
import { Status } from '../utils/types';

export const StatusMessage: React.FC<{ status: Status | null }> = ({ status }) => {
    if (!status) return null;

    const baseClasses = 'rounded-xl p-4 mt-5 text-center text-sm';
    const typeClasses = {
        success: 'bg-green-50 dark:bg-green-600/10 border border-green-200 dark:border-green-500/30 text-green-700 dark:text-green-400',
        error: 'bg-red-50 dark:bg-red-600/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400',
        warning: 'bg-yellow-50 dark:bg-yellow-400/10 border border-yellow-200 dark:border-yellow-500/30 text-yellow-800 dark:text-yellow-300',
        info: 'bg-blue-50 dark:bg-blue-400/10 border border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300'
    };

    return (
        <div className={`${baseClasses} ${typeClasses[status.type]}`} role="alert">
            {status.message}
        </div>
    );
};
