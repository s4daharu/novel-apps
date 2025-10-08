
import React, { useState, useRef } from 'react';

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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            if (files.length === 1) {
                setFileInfo(files[0].name);
            } else {
                 setFileInfo(
                    <div className="text-left text-sm">
                        <span className="font-semibold">{files.length} files selected:</span>
                        <ul className="list-disc list-inside mt-1 max-h-24 overflow-y-auto">
                            {/* FIX: Explicitly type the 'file' parameter to 'File' to resolve the type inference error. */}
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
    };

    const handleClear = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setFileInfo('');
        onFileCleared?.();
    };

    return (
        <div>
            <label htmlFor={inputId} className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:ring-offset-slate-100 w-full cursor-pointer">
                {label}
            </label>
            <input type="file" id={inputId} accept={accept} multiple={multiple} className="hidden" onChange={handleFileChange} ref={fileInputRef} />
            {fileInfo && (
                <div className="mt-2.5 flex items-center justify-between bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md min-h-[40px] text-slate-500 dark:text-slate-300">
                    <div className="max-w-[calc(100%-30px)] overflow-hidden text-ellipsis whitespace-nowrap text-sm">{fileInfo}</div>
                    <button type="button" onClick={handleClear} className="bg-transparent border-none text-slate-500 text-2xl font-bold cursor-pointer ml-2 p-1 leading-none transition-colors hover:text-slate-800 dark:hover:text-white" aria-label="Clear file">&times;</button>
                </div>
            )}
        </div>
    );
};
