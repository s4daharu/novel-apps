import React, { useEffect, useRef, useCallback, ReactNode } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    /** Optional footer content (buttons, etc.) */
    footer?: ReactNode;
    /** Max width class, defaults to 'max-w-md' */
    maxWidth?: string;
    /** Whether clicking outside closes the modal, defaults to true */
    closeOnOverlayClick?: boolean;
}

/**
 * Accessible Modal component with:
 * - Focus trapping
 * - Escape key to close
 * - aria-labelledby and aria-describedby
 * - Scroll lock when open
 * - Animation support
 */
export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    maxWidth = 'max-w-md',
    closeOnOverlayClick = true
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);
    const titleId = useRef(`modal-title-${Math.random().toString(36).substr(2, 9)}`);
    const descId = useRef(`modal-desc-${Math.random().toString(36).substr(2, 9)}`);

    // Handle escape key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    }, [onClose]);

    // Focus trap
    const handleTabKey = useCallback((e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !modalRef.current) return;

        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            // Store current focus
            previousActiveElement.current = document.activeElement as HTMLElement;

            // Add event listeners
            document.addEventListener('keydown', handleKeyDown);
            document.addEventListener('keydown', handleTabKey);

            // Lock scroll
            document.body.style.overflow = 'hidden';

            // Focus first focusable element in modal
            setTimeout(() => {
                const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                firstFocusable?.focus();
            }, 0);
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keydown', handleTabKey);
            document.body.style.overflow = '';

            // Restore focus
            if (!isOpen && previousActiveElement.current) {
                previousActiveElement.current.focus();
            }
        };
    }, [isOpen, handleKeyDown, handleTabKey]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={closeOnOverlayClick ? onClose : undefined}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId.current}
            aria-describedby={descId.current}
        >
            <div
                ref={modalRef}
                className={`bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full ${maxWidth} transform transition-all`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2
                        id={titleId.current}
                        className="text-lg font-bold text-slate-900 dark:text-white"
                    >
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        aria-label="Close modal"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div id={descId.current} className="p-4">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="flex justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

// Utility button components for modal footers
export const ModalCancelButton: React.FC<{ onClick: () => void; children?: ReactNode }> = ({
    onClick,
    children = 'Cancel'
}) => (
    <button
        onClick={onClick}
        className="px-4 py-2 rounded-lg font-medium bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 transition-colors"
    >
        {children}
    </button>
);

export const ModalConfirmButton: React.FC<{
    onClick: () => void;
    children?: ReactNode;
    variant?: 'primary' | 'danger';
    disabled?: boolean;
}> = ({
    onClick,
    children = 'Confirm',
    variant = 'primary',
    disabled = false
}) => (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-primary-600 hover:bg-primary-700'
                }`}
        >
            {children}
        </button>
    );
