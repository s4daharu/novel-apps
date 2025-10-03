import React from 'react';
import { Tool } from '../types';

interface ToolCardProps {
  tool: Tool;
  onLaunch: () => void;
  className?: string;
}

export const ToolCard: React.FC<ToolCardProps> = ({ tool, onLaunch, className }) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onLaunch();
        }
    };

    return (
        <div 
            className={`tool-card group bg-white/60 dark:bg-slate-800/40 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 rounded-xl p-6 hover:bg-slate-50/80 dark:hover:bg-slate-700/60 hover:border-primary-500/50 transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary-500/10 animate-slide-in ${className}`}
            onClick={onLaunch}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
            aria-label={`Launch ${tool.title} tool`}
        >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 text-center group-hover:text-primary-500 dark:group-hover:text-primary-300 transition-colors">{tool.title}</h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed text-center mb-4">
                {tool.description}
            </p>
        </div>
    );
};
