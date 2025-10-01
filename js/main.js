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

// Extend toolSectionsMap with HTML component paths
export const toolSectionsMap = {
    'splitter': { elementId: 'splitterApp', title: 'EPUB Chapter Splitter', htmlPath: 'js/components/splitter.html' },
    'zipEpub': { elementId: 'zipEpubApp', title: 'ZIP ↔ EPUB', htmlPath: 'js/components/zipEpub.html' },
    'zipToEpub': { elementId: 'zipToEpubApp', title: 'ZIP to EPUB', htmlPath: 'js/components/zip-to-epub.html' },
    'epubToZip': { elementId: 'epubToZipApp', title: 'EPUB to ZIP', htmlPath: 'js/components/epub-to-zip.html' },
    'createBackupFromZip': { elementId: 'createBackupFromZipApp', title: 'Create Backup from ZIP', htmlPath: 'js/components/create-backup-from-zip.html' },
    'mergeBackup': { elementId: 'mergeBackupApp', title: 'Merge Backup Files', htmlPath: 'js/components/merge-backup.html' },
    'augmentBackupWithZip': { elementId: 'augmentBackupWithZipApp', title: 'Augment Backup with ZIP', htmlPath: 'js/components/augment-backup-with-zip.html' },
    'findReplaceBackup': { elementId: 'findReplaceBackupApp', title: 'Find & Replace in Backup File', htmlPath: 'js/components/find-replace-backup.html' }
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

// Lazy loading for better performance
const toolModules = {
    'splitter': () => import('./epub-splitter.js'),
    'zipToEpub': () => import('./zip-to-epub.js'),
    'epubToZip': () => import('./epub-to-zip.js'),
    'zipEpub': () => Promise.resolve({ initializeZipEpubCombined: initializeZipEpubCombined }),
    'createBackupFromZip': () => import('./create-backup-from-zip.js'),
    'mergeBackup': () => import('./merge-backup.js'),
    'augmentBackupWithZip': () => import('./augment-backup-with-zip.js'),
    'findReplaceBackup': () => import('./find-replace-backup.js')
};

const initializedTools = new Map();

// Initialize a specific tool's JavaScript logic after its HTML has been loaded
export async function initializeTool(toolId) {
    if (initializedTools.has(toolId)) {
        console.log(`Tool ${toolId} already initialized`);
        return;
    }

    if (!toolModules[toolId]) {
        console.warn(`No module found for tool: ${toolId}`);
        return;
    }

    try {
        console.log(`Initializing JS for tool: ${toolId}`);
        const module = await toolModules[toolId]();
        const toolInfo = toolSectionsMap[toolId];

        if (!toolInfo) {
            console.warn(`No tool info found for: ${toolId}`);
            return;
        }

        const initFunction = getToolInitializer(toolId);
        if (initFunction && module[initFunction]) {
            const spinnerId = spinnerIdMap[toolId];
            const spinnerElement = spinnerId ? document.getElementById(spinnerId) : null;

            module[initFunction](showToast, (show) => displaySpinnerElement(spinnerElement, show));
            initializedTools.set(toolId, true);
            console.log(`Successfully initialized JS for tool: ${toolId}`);
        } else {
            console.warn(`No JS initializer found for tool: ${toolId}`);
        }
    } catch (error) {
        console.error(`Failed to initialize JS for tool: ${toolId}`, error);
        showToast(`Failed to load script for ${toolSectionsMap[toolId]?.title || toolId}`, true);
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

// Initialize the combined ZIP ↔ EPUB tool
async function initializeZipEpubCombined() {
    console.log('Initializing combined ZIP ↔ EPUB tool logic');

    const zipToEpubModeBtn = document.getElementById('zipToEpubMode');
    const epubToZipModeBtn = document.getElementById('epubToZipMode');
    const zipEpubHost = document.getElementById('zipEpubHost');
    
    if (!zipToEpubModeBtn || !epubToZipModeBtn || !zipEpubHost) {
        console.error('Combined ZIP ↔ EPUB UI elements not found after load');
        return;
    }

    const savedMode = sessionStorage.getItem('zipEpubMode') || 'zipToEpub';
    let zipToEpubInitialized = false;
    let epubToZipInitialized = false;

    // Function to switch modes and load/initialize sub-tools
    async function switchMode(mode) {
        sessionStorage.setItem('zipEpubMode', mode);

        if (mode === 'zipToEpub') {
            zipToEpubModeBtn.classList.add('bg-primary-600', 'text-white');
            zipToEpubModeBtn.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
            epubToZipModeBtn.classList.remove('bg-primary-600', 'text-white');
            epubToZipModeBtn.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
            
            const zipToEpubInfo = toolSectionsMap['zipToEpub'];
            const html = await (await fetch(zipToEpubInfo.htmlPath)).text();
            zipEpubHost.innerHTML = html;
            
            if (!zipToEpubInitialized) {
                await initializeTool('zipToEpub');
                zipToEpubInitialized = true;
            }

        } else { // epubToZip
            epubToZipModeBtn.classList.add('bg-primary-600', 'text-white');
            epubToZipModeBtn.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
            zipToEpubModeBtn.classList.remove('bg-primary-600', 'text-white');
            zipToEpubModeBtn.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-slate-700', 'dark:text-slate-300');
            
            const epubToZipInfo = toolSectionsMap['epubToZip'];
            const html = await (await fetch(epubToZipInfo.htmlPath)).text();
            zipEpubHost.innerHTML = html;
            
            if (!epubToZipInitialized) {
                await initializeTool('epubToZip');
                epubToZipInitialized = true;
            }
        }
    }

    zipToEpubModeBtn.addEventListener('click', () => switchMode('zipToEpub'));
    epubToZipModeBtn.addEventListener('click', () => switchMode('epubToZip'));

    // Set initial mode
    await switchMode(savedMode);
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
                    uiLaunchAppFromCard(toolId, false, toolSectionsMap, initializeTool);
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
                    uiLaunchAppFromCard(toolId, false, toolSectionsMap, initializeTool);
                }
            }
        });
    });

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
            uiLaunchAppFromCard('zipEpub', fromPopStateUpdate, toolSectionsMap, initializeTool);
            return;
        }

        if (hash.startsWith('#tool-')) {
            const toolId = hash.substring('#tool-'.length);
            if (toolSectionsMap[toolId]) {
                uiLaunchAppFromCard(toolId, fromPopStateUpdate, toolSectionsMap, initializeTool);
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
            uiLaunchAppFromCard(persistedToolId, false, toolSectionsMap, initializeTool);
        } else {
            console.log("MAIN: Initial load, no hash, no persisted tool. Showing dashboard.");
            uiShowDashboard(false, toolSectionsMap);
        }
    }
}
