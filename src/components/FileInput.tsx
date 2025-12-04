
import React, { useState, useRef, useCallback } from 'react';

interface FileInputProps {
    onFileSelected: (files: FileList) => void;
    onFileCleared?: () => void;
    inputId: string;
    label: string;
    accept: string;
    multiple?: boolean;
}

export const FileInput: React.FC<FileInputProps> = ({ onFileSelected, onFileCleared, inputId, label, accept, multiple = false }) => {
    const [fileInfo, setFileInfo] = useState<string | React.ReactNode>('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback((files: FileList | null) => {
        if (files && files.length > 0) {
            if (files.length === 1) {
                setFileInfo(files[0].name);
            } else {
                setFileInfo(
                    <div className="text-left text-sm">
                        <span className="font-semibold">{files.length} files selected:</span>
                        <ul className="list-disc list-inside mt-1 max-h-24 overflow-y-auto">
                            {Array.from(files).map((file: File, index) => <li key={index} className="truncate">{file.name}</li>)}
                        </ul>
                    </div>
                );
            }
            onFileSelected(files);
        } else {
            setFileInfo('');
            onFileCleared?.();
        }
    }, [onFileSelected, onFileCleared]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        processFiles(e.target.files);
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            // Validate file types if accept is specified
            const acceptTypes = accept.split(',').map(t => t.trim().toLowerCase());
            const validFiles = Array.from(files).filter(file => {
                const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
                const mimeType = file.type.toLowerCase();
                return acceptTypes.some(type =>
                    type === ext ||
                    type === mimeType ||
                    (type.endsWith('/*') && mimeType.startsWith(type.replace('/*', '/')))
                );
            });

            if (validFiles.length > 0) {
                // Create a new FileList-like object
                const dt = new DataTransfer();
                validFiles.forEach(f => dt.items.add(f));
                processFiles(dt.files);
            }
        }
    }, [accept, processFiles]);

    const handleClear = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setFileInfo('');
        onFileCleared?.();
    };

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative transition-all duration-200 ${isDragOver ? 'scale-[1.02]' : ''}`}
        >
            <label
                htmlFor={inputId}
                className={`inline-flex items-center justify-center px-4 py-3 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 w-full cursor-pointer border-2 border-dashed ${isDragOver
                        ? 'bg-primary-100 dark:bg-primary-900/30 border-primary-500 text-primary-700 dark:text-primary-300'
                        : 'bg-violet-600 hover:bg-violet-700 text-white border-transparent'
                    }`}
            >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {isDragOver ? 'Drop files here' : label}
            </label>
            <input type="file" id={inputId} accept={accept} multiple={multiple} className="hidden" onChange={handleFileChange} ref={fileInputRef} />
            {fileInfo && (
                <div className="mt-2.5 flex items-center justify-between bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md min-h-[40px] text-slate-500 dark:text-slate-300">
                    <div className="max-w-[calc(100%-30px)] overflow-hidden text-ellipsis whitespace-nowrap text-sm">{fileInfo}</div>
                    <button type="button" onClick={handleClear} className="bg-transparent border-none text-slate-500 text-2xl font-bold cursor-pointer ml-2 p-1 leading-none transition-colors hover:text-slate-800 dark:hover:text-white" aria-label="Clear file">&times;</button>
                </div>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 text-center">
                or drag and drop files here
            </p>
        </div>
    );
};
