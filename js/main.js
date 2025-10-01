/**
 * Main application entry point - Browser compatible version
 */

import {
    toggleMenu as uiToggleMenu,
    launchAppFromCard as uiLaunchAppFromCard,
    showDashboard as uiShowDashboard,
    showToast,
    toggleSpinner as displaySpinnerElement,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    initializeTheme,
    initializeTooltips
} from './ui-helpers.js';

import { triggerDownload } from './browser-helpers.js';
import { initializeEpubSplitter } from './epub-splitter.js';
import { initializeZipToEpub } from './zip-to-epub.js';
import { initializeEpubToZip } from './epub-to-zip.js';
import { initializeCreateBackupFromZip } from './create-backup-from-zip.js';
import { initializeMergeBackup } from './merge-backup.js';
import { initializeAugmentBackupWithZip } from './augment-backup-with-zip.js';
import { initializeFindReplaceBackup } from './find-replace-backup.js';

// Extend toolSectionsMap from ui-helpers
export const toolSectionsMap = {
    'splitter': { elementId: 'splitterApp', title: 'EPUB Chapter Splitter' },
    'zipEpub': { elementId: 'zipEpubApp', title: 'ZIP ↔ EPUB' },
    'createBackupFromZip': { elementId: 'createBackupFromZipApp', title: 'Create Backup from ZIP' },
    'mergeBackup': { elementId: 'mergeBackupApp', title: 'Merge Backup Files' },
    'augmentBackupWithZip': { elementId: 'augmentBackupWithZipApp', title: 'Augment Backup with ZIP' },
    'findReplaceBackup': { elementId: 'findReplaceBackupApp', title: 'Find & Replace in Backup File' }
};

// Bottom navigation tool mapping for mobile
export const bottomNavTools = {
    'splitter': 'splitter',
    'createBackupFromZip': 'createBackupFromZip',
    'augmentBackupWithZip': 'augmentBackupWithZip'
};

// PWA functions removed as requested

function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
        const swUrl = new URL('service-worker.js', window.location.href).href;
        navigator.serviceWorker.register(swUrl)
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    }
}



// Add CSS for performance optimizations
const style = document.createElement('style');
style.textContent = `
    /* Performance optimizations */
    .tool-section {
        will-change: transform, opacity;
    }

    .tool-card {
        will-change: transform;
    }

    /* Reduce motion for users who prefer it */
    @media (prefers-reduced-motion: reduce) {
        * {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
        }
    }
`;
document.head.appendChild(style);

// Preload critical tools for mobile-first experience
function preloadCriticalTools() {
    // Preload the most commonly used tools
    const criticalTools = ['splitter', 'createBackupFromZip', 'augmentBackupWithZip'];

    criticalTools.forEach(toolId => {
        if (toolModules[toolId]) {
            toolModules[toolId]().then(module => {
                console.log(`Preloaded tool: ${toolId}`);
            }).catch(error => {
                console.warn(`Failed to preload tool: ${toolId}`, error);
            });
        }
    });
}

// Spinner element ID mapping for each tool
const spinnerIdMap = {
    'splitter': 'spinnerSplitter',
    'zipToEpub': 'spinnerZipToEpub',
    'epubToZip': 'spinnerEpubToZip',
    'createBackupFromZip': 'spinnerCreateBackupFromZip',
    'mergeBackup': 'spinnerMergeBackup',
    'augmentBackupWithZip': 'spinnerAugmentBackup',
    'findReplaceBackup': 'spinnerFindReplaceBackup',
    'zipEpub': 'spinnerZipToEpub' // Combined tool uses ZIP to EPUB spinner
};

// Initialize a specific tool with lazy loading
async function initializeTool(toolId) {
    if (initializedTools.has(toolId)) {
        console.log(`Tool ${toolId} already initialized`);
        return;
    }

    if (!toolModules[toolId]) {
        console.warn(`No module found for tool: ${toolId}`);
        return;
    }

    try {
        console.log(`Initializing tool: ${toolId}`);
        const module = await toolModules[toolId]();
        const toolInfo = toolSectionsMap[toolId];

        if (!toolInfo) {
            console.warn(`No tool info found for: ${toolId}`);
            return;
        }

        // Initialize the tool with its specific function
        const initFunction = getToolInitializer(toolId);
        if (initFunction && module[initFunction]) {
            const spinnerId = spinnerIdMap[toolId];
            const spinnerElement = spinnerId ? document.getElementById(spinnerId) : null;

            module[initFunction](showToast, (show) => displaySpinnerElement(spinnerElement, show));
            initializedTools.set(toolId, true);
            console.log(`Successfully initialized tool: ${toolId}`);
        } else {
            console.warn(`No initializer found for tool: ${toolId}`);
        }
    } catch (error) {
        console.error(`Failed to initialize tool: ${toolId}`, error);
        showToast(`Failed to load ${toolSectionsMap[toolId]?.title || toolId}`, true);
    }
}

// Get the appropriate initializer function name for each tool
function getToolInitializer(toolId) {
    const initializers = {
        'splitter': 'initializeEpubSplitter',
        'zipToEpub': 'initializeZipToEpub',
        'epubToZip': 'initializeEpubToZip',
        'zipEpub': 'initializeZipEpubCombined',
        'createBackupFromZip': 'initializeCreateBackupFromZip',
        'mergeBackup': 'initializeMergeBackup',
        'augmentBackupWithZip': 'initializeAugmentBackupWithZip',
        'findReplaceBackup': 'initializeFindReplaceBackup'
    };

    return initializers[toolId];
}

// Setup intersection observer for lazy loading
function setupLazyLoading() {
    // Lazy load tools when they come into view
    const toolSections = document.querySelectorAll('.tool-section:not(#dashboardApp)');

    if ('IntersectionObserver' in window) {
        const toolObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const toolElement = entry.target;
                    const toolId = Object.keys(toolSectionsMap).find(id =>
                        toolSectionsMap[id].elementId === toolElement.id
                    );

                    if (toolId && !initializedTools.has(toolId)) {
                        initializeTool(toolId);
                        toolObserver.unobserve(toolElement);
                    }
                }
            });
        }, {
            rootMargin: '50px',
            threshold: 0.1
        });

        toolSections.forEach(section => {
            toolObserver.observe(section);
        });
    } else {
        // Fallback for browsers without IntersectionObserver
        console.log('IntersectionObserver not supported, initializing all tools');
        Object.keys(toolSectionsMap).forEach(toolId => {
            if (!initializedTools.has(toolId)) {
                initializeTool(toolId);
            }
        });
    }
}

// Performance monitoring
function initializePerformanceMonitoring() {
    // Monitor Core Web Vitals
    if ('PerformanceObserver' in window) {
        // Largest Contentful Paint
        const lcpObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            console.log('LCP:', lastEntry.startTime);
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay
        const fidObserver = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach(entry => {
                console.log('FID:', entry.processingStart - entry.startTime);
            });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift
        const clsObserver = new PerformanceObserver((list) => {
            let clsValue = 0;
            const entries = list.getEntries();
            entries.forEach(entry => {
                if (!entry.hadRecentInput) {
                    clsValue += entry.value;
                }
            });
            console.log('CLS:', clsValue);
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
    }
}

// Initialize performance monitoring
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePerformanceMonitoring);
} else {
    initializePerformanceMonitoring();
}

// Lazy loading for better performance
const toolModules = {
    'splitter': () => import('./epub-splitter.js'),
    'zipToEpub': () => import('./zip-to-epub.js'),
    'epubToZip': () => import('./epub-to-zip.js'),
    'zipEpub': () => Promise.resolve({
        initializeZipEpubCombined: initializeZipEpubCombined
    }),
    'createBackupFromZip': () => import('./create-backup-from-zip.js'),
    'mergeBackup': () => import('./merge-backup.js'),
    'augmentBackupWithZip': () => import('./augment-backup-with-zip.js'),
    'findReplaceBackup': () => import('./find-replace-backup.js')
};

const initializedTools = new Map();

// Initialize the combined ZIP ↔ EPUB tool
async function initializeZipEpubCombined() {
    console.log('Initializing combined ZIP ↔ EPUB tool');

    // Get the combined tool container and host
    const zipEpubApp = document.getElementById('zipEpubApp');
    const zipEpubHost = document.getElementById('zipEpubHost');

    if (!zipEpubApp || !zipEpubHost) {
        console.error('Combined ZIP ↔ EPUB tool containers not found');
        return;
    }

    // Get the existing tool sections
    const zipToEpubApp = document.getElementById('zipToEpubApp');
    const epubToZipApp = document.getElementById('epubToZipApp');

    if (!zipToEpubApp || !epubToZipApp) {
        console.error('Individual tool sections not found');
        return;
    }

    // Move the existing sections into the host container
    zipEpubHost.appendChild(zipToEpubApp);
    zipEpubHost.appendChild(epubToZipApp);

    // Get mode switch buttons
    const zipToEpubModeBtn = document.getElementById('zipToEpubMode');
    const epubToZipModeBtn = document.getElementById('epubToZipMode');

    if (!zipToEpubModeBtn || !epubToZipModeBtn) {
        console.error('Mode switch buttons not found');
        return;
    }

    // Get mode preference from sessionStorage or default to ZIP → EPUB
    const savedMode = sessionStorage.getItem('zipEpubMode') || 'zipToEpub';
    let currentMode = savedMode;
    let zipToEpubInitialized = false;
    let epubToZipInitialized = false;

    // Function to switch modes
    async function switchMode(mode) {
        if (mode === 'zipToEpub') {
            // Show ZIP to EPUB, hide EPUB to ZIP
            zipToEpubApp.classList.remove('hidden');
            epubToZipApp.classList.add('hidden');

            // Update button states
            zipToEpubModeBtn.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300', 'hover:bg-slate-300', 'dark:hover:bg-slate-600');
            zipToEpubModeBtn.classList.add('bg-primary-600', 'text-white');
            epubToZipModeBtn.classList.remove('bg-primary-600', 'text-white');
            epubToZipModeBtn.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300', 'hover:bg-slate-300', 'dark:hover:bg-slate-600');

            currentMode = 'zipToEpub';

            // Initialize ZIP to EPUB if not already done
            if (!zipToEpubInitialized) {
                try {
                    const mod = await import('./zip-to-epub.js');
                    mod.initializeZipToEpub(showToast, (show) => displaySpinnerElement(document.getElementById('spinnerZipToEpub'), show));
                    zipToEpubInitialized = true;
                    console.log('ZIP to EPUB tool initialized');
                } catch (error) {
                    console.error('Failed to initialize ZIP to EPUB tool:', error);
                }
            }
        } else {
            // Show EPUB to ZIP, hide ZIP to EPUB
            zipToEpubApp.classList.add('hidden');
            epubToZipApp.classList.remove('hidden');

            // Update button states
            epubToZipModeBtn.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300', 'hover:bg-slate-300', 'dark:hover:bg-slate-600');
            epubToZipModeBtn.classList.add('bg-primary-600', 'text-white');
            zipToEpubModeBtn.classList.remove('bg-primary-600', 'text-white');
            zipToEpubModeBtn.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300', 'hover:bg-slate-300', 'dark:hover:bg-slate-600');

            currentMode = 'epubToZip';

            // Initialize EPUB to ZIP if not already done
            if (!epubToZipInitialized) {
                try {
                    const mod = await import('./epub-to-zip.js');
                    mod.initializeEpubToZip(showToast, (show) => displaySpinnerElement(document.getElementById('spinnerEpubToZip'), show));
                    epubToZipInitialized = true;
                    console.log('EPUB to ZIP tool initialized');
                } catch (error) {
                    console.error('Failed to initialize EPUB to ZIP tool:', error);
                }
            }
        }

        // Save mode preference
        sessionStorage.setItem('zipEpubMode', currentMode);
    }

    // Set initial mode
    switchMode(currentMode);

    // Add event listeners for mode switching
    zipToEpubModeBtn.addEventListener('click', () => switchMode('zipToEpub'));
    epubToZipModeBtn.addEventListener('click', () => switchMode('epubToZip'));

    console.log('Combined ZIP ↔ EPUB tool initialized successfully');
}

export function initializeApp() {
    registerServiceWorker();
    initializeTheme();
    initializeTooltips();
    
    // Event delegation for all major UI actions
    document.body.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const toolId = target.dataset.toolId;

        switch (action) {
            case 'toggleMenu':
                uiToggleMenu();
                break;
            case 'showDashboard':
                uiShowDashboard(false, toolSectionsMap);
                break;
            case 'launchApp':
                if (toolId) {
                    uiLaunchAppFromCard(toolId, false, toolSectionsMap);
                }
                break;
        }
    });

    // Add keyboard support for tool cards for accessibility
    document.querySelectorAll('.tool-card[data-action="launchApp"]').forEach(card => {
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const toolId = card.dataset.toolId;
                if (toolId) {
                    uiLaunchAppFromCard(toolId, false, toolSectionsMap);
                }
            }
        });
    });

    // Preload critical tools for mobile-first experience
    preloadCriticalTools();

    // Add intersection observer for lazy loading. This will handle initialization
    // when a tool becomes visible, which is the single source of truth.
    setupLazyLoading();

    // Add touch gesture listeners for mobile navigation
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    function routeApp(fromPopStateUpdate) {
        const hash = window.location.hash;
        console.log(`Routing based on hash: '${hash}', fromPopStateUpdate: ${fromPopStateUpdate}`);

        // Handle legacy hash redirects
        if (hash === '#tool-zipToEpub' || hash === '#tool-epubToZip') {
            const newHash = '#tool-zipEpub';
            if (!fromPopStateUpdate) {
                const historyUrl = window.location.protocol === 'blob:' ? null : newHash;
                if (historyUrl !== null) {
                    history.replaceState({ view: 'tool', toolId: 'zipEpub' }, 'ZIP ↔ EPUB', historyUrl);
                }
            }
            uiLaunchAppFromCard('zipEpub', fromPopStateUpdate, toolSectionsMap);
            return;
        }

        if (hash.startsWith('#tool-')) {
            const toolId = hash.substring('#tool-'.length);
            if (toolSectionsMap[toolId]) {
                uiLaunchAppFromCard(toolId, fromPopStateUpdate, toolSectionsMap);
            } else {
                console.warn(`Invalid tool ID in hash: ${toolId}. Defaulting to dashboard.`);
                uiShowDashboard(fromPopStateUpdate, toolSectionsMap);
                if (!fromPopStateUpdate) {
                    const targetDashboardHash = '#dashboard';
                    const historyUrl = window.location.protocol === 'blob:' ? null : targetDashboardHash;
                     if (window.location.hash !== targetDashboardHash && historyUrl !== null) {
                        history.replaceState({ view: 'dashboard' }, 'Novel-Apps Dashboard', historyUrl);
                     }
                }
            }
        } else if (hash === '#dashboard' || hash === '') {
            uiShowDashboard(fromPopStateUpdate, toolSectionsMap);
            if (hash === '' && !fromPopStateUpdate) {
                const targetDashboardHash = '#dashboard';
                const historyUrl = window.location.protocol === 'blob:' ? null : targetDashboardHash;
                if (historyUrl !== null) {
                    history.pushState({ view: 'dashboard' }, 'Novel-Apps Dashboard', historyUrl);
                }
            }
        } else {
            console.warn(`Unknown hash: ${hash}. Defaulting to dashboard.`);
            uiShowDashboard(fromPopStateUpdate, toolSectionsMap);
            if (!fromPopStateUpdate) {
                const targetDashboardHash = '#dashboard';
                const historyUrl = window.location.protocol === 'blob:' ? null : targetDashboardHash;
                if (window.location.hash !== targetDashboardHash && historyUrl !== null) {
                   history.replaceState({ view: 'dashboard' }, 'Novel-Apps Dashboard', historyUrl);
                }
            }
        }
    }

    window.addEventListener('popstate', (event) => {
        console.log("MAIN: Popstate event. State:", event.state, "Current Hash:", window.location.hash);
        routeApp(true);
    });

    // Initial routing logic
    if (window.location.protocol === 'blob:') {
        console.log("MAIN: Initial load from blob URL. Showing dashboard directly.");
        uiShowDashboard(true, toolSectionsMap);
    } else if (window.location.hash) {
        console.log("MAIN: Initial load with hash:", window.location.hash);
        routeApp(true);
    } else {
        const persistedToolId = sessionStorage.getItem('activeToolId');
        if (persistedToolId && toolSectionsMap[persistedToolId]) {
            console.log(`MAIN: Initial load, no hash, persisted tool: ${persistedToolId}`);
            uiLaunchAppFromCard(persistedToolId, false, toolSectionsMap);
        } else {
            console.log("MAIN: Initial load, no hash, no persisted tool. Showing dashboard.");
            uiShowDashboard(false, toolSectionsMap);
        }
    }
}
