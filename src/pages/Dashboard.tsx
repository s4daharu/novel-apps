
import React from 'react';
import { Link } from 'react-router-dom';

const toolCardData = [
  { id: 'splitter', title: 'EPUB Chapter Splitter', desc: 'Divide EPUB files into individual or grouped chapter text files with precision control.', size: 'full' },
  { id: 'augmentBackupWithZip', title: 'Augment Backup with ZIP', desc: 'Expand existing novel backups by adding new chapters from ZIP files seamlessly.' },
  { id: 'zipEpub', title: 'ZIP ↔ EPUB', desc: 'Convert between ZIP files and EPUB format with bidirectional support and customization.' },
  { id: 'createBackupFromZip', title: 'Create Backup from ZIP', desc: 'Generate structured novel backup files directly from ZIP archives containing text chapters.' },
  { id: 'mergeBackup', title: 'Merge Backup Files', desc: 'Combine multiple novel backup files into a single, organized backup with smart conflict resolution.' },
  { id: 'findReplaceBackup', title: 'Find & Replace in Backup', desc: 'Perform powerful find and replace operations within novel backup files with regex support and preview.' },
  { id: 'novelSplitter', title: 'Novel Splitter', desc: 'Advanced tool to split, edit, and package .txt novels into chapters, with export to ZIP or themed EPUB.', size: 'full' },
];

export const Dashboard: React.FC = () => {
    return (
        <section id="dashboardApp" className="min-h-screen p-4 md:p-8 animate-fade-in">
            <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pt-8">
                    {toolCardData.map(card => (
                        <Link key={card.id} to={`/tool/${card.id}`}
                           className={`tool-card group bg-white/60 dark:bg-slate-800/40 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 rounded-xl p-6 hover:bg-slate-50/80 dark:hover:bg-slate-700/60 hover:border-primary-500/50 transition-all duration-300 cursor-pointer hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary-500/10 animate-slide-in ${card.size === 'full' ? 'md:col-span-2 lg:col-span-3' : ''}`}
                           role="button"
                           aria-label={`Launch ${card.title}`}>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 text-center group-hover:text-primary-500 dark:group-hover:text-primary-300 transition-colors">{card.title}</h2>
                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed text-center mb-4">
                                {card.desc}
                            </p>
                        </Link>
                    ))}
                </div>
            </div>
        </section>
    );
};