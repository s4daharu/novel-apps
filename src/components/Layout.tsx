import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, NavLink } from 'react-router-dom';
import { ThemeToggleButton } from './ThemeToggleButton';
import { toolSectionsMap } from '../pages/ToolWrapper';
import { Button } from './ui/Button';
import { Menu, X, BookOpen, Home } from 'lucide-react';
import { cn } from '../utils/cn';

export const Layout: React.FC = () => {
    const [isMenuOpen, setMenuOpen] = useState(false);
    const location = useLocation();

    // Close menu on route change
    useEffect(() => setMenuOpen(false), [location]);

    // Prevent body scroll when menu is open on mobile
    useEffect(() => {
        if (isMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isMenuOpen]);

    const toolOrder = ['splitter', 'augmentBackupWithZip', 'zipEpub', 'createBackupFromZip', 'mergeBackup', 'findReplaceBackup', 'backupOrganizer', 'novelSplitter'];

    const NavItem = ({ to, icon: Icon, children }: { to: string, icon?: React.ElementType, children: React.ReactNode }) => (
        <NavLink
            to={to}
            className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium",
                isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
        >
            {Icon && <Icon className="h-4 w-4" />}
            {children}
        </NavLink>
    );

    return (
        <div className="min-h-screen bg-background flex flex-col md:flex-row">
            {/* Mobile Header */}
            <header className="md:hidden sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-14 items-center justify-between px-4">
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setMenuOpen(!isMenuOpen)}>
                            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </Button>
                        <span className="font-bold">Novel Apps</span>
                    </div>
                    <ThemeToggleButton />
                </div>
            </header>

            {/* Sidebar (Desktop) */}
            <aside className="hidden md:flex flex-col w-64 border-r bg-card h-screen sticky top-0 z-30">
                <div className="h-14 flex items-center px-4 border-b">
                    <BookOpen className="h-6 w-6 text-primary mr-2" />
                    <span className="font-bold text-lg">Novel Apps</span>
                </div>
                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    <NavItem to="/" icon={Home}>Dashboard</NavItem>
                    <div className="pt-4 pb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Tools
                    </div>
                    {toolOrder.map(id => toolSectionsMap[id] && (
                        <NavItem key={id} to={`/tool/${id}`}>
                            {toolSectionsMap[id].title}
                        </NavItem>
                    ))}
                </div>
                <div className="p-4 border-t flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">v1.7.0</span>
                    <ThemeToggleButton />
                </div>
            </aside>

            {/* Mobile Sidebar Overlay */}
            {isMenuOpen && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setMenuOpen(false)}>
                    <div className="fixed inset-y-0 left-0 z-50 h-full w-3/4 max-w-sm bg-background border-r p-6 shadow-lg animate-slide-in-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-8">
                            <span className="font-bold text-lg flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" />
                                Novel Apps
                            </span>
                            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(false)}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        <nav className="space-y-1">
                            <NavItem to="/" icon={Home}>Dashboard</NavItem>
                            <div className="pt-4 pb-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Tools
                            </div>
                            {toolOrder.map(id => toolSectionsMap[id] && (
                                <NavItem key={id} to={`/tool/${id}`}>
                                    {toolSectionsMap[id].title}
                                </NavItem>
                            ))}
                        </nav>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 w-full md:w-auto md:min-w-0 bg-secondary/10 relative">
                <Outlet />
            </main>
        </div>
    );
};
