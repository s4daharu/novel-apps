import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { ArrowRight, FileText, FolderArchive, Layers, Search, Split, BookOpen, PenTool } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { cn } from '../utils/cn';

const toolCardData = [
    { id: 'splitter', title: 'EPUB Chapter Splitter', desc: 'Divide EPUB files into individual or grouped chapter text files with precision control.', icon: Split },
    { id: 'augmentBackupWithZip', title: 'Augment Backup with ZIP', desc: 'Expand existing novel backups by adding new chapters from ZIP files seamlessly.', icon: Layers },
    { id: 'zipEpub', title: 'ZIP ↔ EPUB', desc: 'Convert between ZIP files and EPUB format with bidirectional support and customization.', icon: FolderArchive },
    { id: 'createBackupFromZip', title: 'Create Backup from ZIP', desc: 'Generate structured novel backup files directly from ZIP archives containing text chapters.', icon: FolderArchive },
    { id: 'mergeBackup', title: 'Merge Backup Files', desc: 'Combine multiple novel backup files into a single, organized backup with smart conflict resolution.', icon: Layers },
    { id: 'findReplaceBackup', title: 'Find & Replace in Backup', desc: 'Perform powerful find and replace operations within novel backup files with regex support.', icon: Search },
    { id: 'backupOrganizer', title: 'Backup Organizer', desc: 'Inspect, sort, and manage complex ZIP archives. Intelligently groups novel backups.', icon: BookOpen, featured: true },
    { id: 'novelSplitter', title: 'Novel Splitter', desc: 'Advanced tool to split, edit, and package .txt novels into chapters, with export to ZIP or themed EPUB.', icon: PenTool, featured: true },
];

export const Dashboard: React.FC = () => {
    const [searchQuery, setSearchQuery] = React.useState('');

    const filteredTools = toolCardData.filter(tool =>
        tool.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <section className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl font-display">Tool Dashboard</h1>
                    <p className="text-muted-foreground mt-2 max-w-2xl">
                        A suite of powerful utilities for novel management, EPUB processing, and backup organization.
                    </p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Search tools..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTools.map((card) => {
                    const Icon = card.icon;
                    return (
                        <Link key={card.id} to={`/tool/${card.id}`} className={cn("group block h-full", card.featured ? "md:col-span-2 lg:col-span-2" : "")}>
                            <Card className="h-full hover:shadow-lg transition-all duration-300 border-transparent hover:border-primary/20 bg-card hover:bg-card/50 relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                            <Icon className="h-6 w-6 text-primary" />
                                        </div>
                                        {card.featured && <Badge variant="secondary">Featured</Badge>}
                                    </div>
                                    <CardTitle className="mt-4 group-hover:text-primary transition-colors flex items-center gap-2">
                                        {card.title}
                                        <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                    </CardTitle>
                                    <CardDescription className="line-clamp-3">
                                        {card.desc}
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    )
                })}
            </div>

            {filteredTools.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-muted-foreground">No tools found matching "{searchQuery}"</p>
                </div>
            )}
        </section>
    );
};
