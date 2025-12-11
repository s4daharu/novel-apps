import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../utils/cn';

interface PageHeaderProps {
    title: string;
    description?: string;
    className?: string;
    backUrl?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, className, backUrl = "/" }) => {
    const navigate = useNavigate();

    return (
        <div className={cn("flex flex-col space-y-2 pb-6 pt-2", className)}>
            <div className="flex items-center space-x-4">
                <Button variant="ghost" size="icon" onClick={() => navigate(backUrl)} className="shrink-0">
                    <ArrowLeft className="h-5 w-5" />
                    <span className="sr-only">Back</span>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl font-display text-foreground">{title}</h1>
                    {description && <p className="text-muted-foreground mt-1 hidden md:block">{description}</p>}
                </div>
            </div>
            {description && <p className="text-muted-foreground md:hidden px-1">{description}</p>}
        </div>
    );
};
