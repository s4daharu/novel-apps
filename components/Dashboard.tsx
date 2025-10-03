import React from 'react';
import { ToolCard } from './ToolCard';
import { Tool } from '../types';

interface DashboardProps {
  tools: Record<string, Tool>;
}

export const Dashboard: React.FC<DashboardProps> = ({ tools }) => {
    const navigate = (toolId: string) => {
        window.location.hash = `#tool-${toolId}`;
    };

    const toolOrder: string[] = [
        'novelSplitter', 'splitter', 'zipEpub', 'createBackupFromZip', 
        'mergeBackup', 'augmentBackupWithZip', 'findReplaceBackup'
    ];

    const orderedTools = toolOrder.map(id => tools[id]).filter(Boolean);

    return (
        <section id="dashboardApp" className="min-h-screen p-4 md:p-8 animate-fade-in">
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pt-8">
                    {orderedTools.map((tool, index) => (
                        <ToolCard 
                            key={tool.id}
                            tool={tool}
                            onLaunch={() => navigate(tool.id)}
                            className={index === 0 ? 'md:col-span-2 lg:col-span-3' : ''}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
};
