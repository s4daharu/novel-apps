/**
 * Browser-compatible UI helper functions
 */

let toastEl = null;
let sidebarEl = null;

// --- Touch Gesture State (simplified for browser) ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let isSwipeInitiatedFromEdge = false;
let isPotentiallySwipingSidebar = false;

const SWIPE_THRESHOLD = 80;
const SWIPE_EDGE_THRESHOLD = 60;
const SIDEBAR_SWIPE_CLOSE_THRESHOLD = 80;
const MAX_VERTICAL_SWIPE = 100;

export function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const lookup = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, (c) => lookup[c]);
}

export function initializeTheme() {
    const themeToggles = document.querySelectorAll('.theme-toggle-btn');
    const sunIcons = document.querySelectorAll('.sun-icon');
    const moonIcons = document.querySelectorAll('.moon-icon');

    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            sunIcons.forEach(icon => icon.classList.remove('hidden'));
            moonIcons.forEach(icon => icon.classList.add('hidden'));
        } else {
            document.documentElement.classList.remove('dark');
            sunIcons.forEach(icon => icon.classList.add('hidden'));
            moonIcons.forEach(icon => icon.classList.remove('hidden'));
        }
    };

    const toggleTheme = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    };

    themeToggles.forEach(btn => btn.addEventListener('click', toggleTheme));

    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (prefersDark) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }
}

export function initializeTooltips() {
    document.body.addEventListener('click', (e) => {
        const trigger = e.target.closest('.tooltip-trigger');
        document.querySelectorAll('.tooltip-trigger.active').forEach(activeTrigger => {
            if (activeTrigger !== trigger) activeTrigger.classList.remove('active');
        });
        if (trigger) {
            e.stopPropagation();
            trigger.classList.toggle('active');
        }
    });

    document.body.addEventListener('keydown', (e) => {
        if (e.target.matches('.tooltip-trigger') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.target.click();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.tooltip-trigger.active').forEach(trigger => trigger.classList.remove('active'));
        }
    });
}

export function toggleMenu() {
    sidebarEl = sidebarEl || document.getElementById('sidebar');
    if (!sidebarEl) return;
    sidebarEl.classList.toggle('translate-x-full');
    sidebarEl.classList.toggle('translate-x-0');
    sidebarEl.classList.toggle('open');
}

export function handleTouchStart(event) {
    if (event.target.closest('button, a, input, select, textarea, [role="button"]')) {
        isPotentiallySwipingSidebar = false;
        isSwipeInitiatedFromEdge = false;
        return;
    }
    sidebarEl = sidebarEl || document.getElementById('sidebar');
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isSwipeInitiatedFromEdge = false;
    isPotentiallySwipingSidebar = false;

    if (!sidebarEl) return;

    if (!sidebarEl.classList.contains('open') && touchStartX > window.innerWidth - SWIPE_EDGE_THRESHOLD) {
        isSwipeInitiatedFromEdge = true;
        isPotentiallySwipingSidebar = true;
    } else if (sidebarEl.classList.contains('open') && touchStartX < sidebarEl.offsetWidth) {
        isSwipeInitiatedFromEdge = true;
        isPotentiallySwipingSidebar = true;
    }
}

export function handleTouchMove(event) {
    if (!isPotentiallySwipingSidebar || event.touches.length === 0) return;
    const touch = event.touches[0];
    touchEndX = touch.clientX;
    touchEndY = touch.clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    if (isPotentiallySwipingSidebar && isSwipeInitiatedFromEdge && Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        event.preventDefault();
    }
}

export function handleTouchEnd() {
    sidebarEl = sidebarEl || document.getElementById('sidebar');
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (isSwipeInitiatedFromEdge && isPotentiallySwipingSidebar && sidebarEl) {
        if (Math.abs(deltaY) < MAX_VERTICAL_SWIPE) {
            if (!sidebarEl.classList.contains('open') && deltaX < -SWIPE_THRESHOLD && touchStartX > window.innerWidth - SWIPE_EDGE_THRESHOLD) {
                toggleMenu();
            } else if (sidebarEl.classList.contains('open') && deltaX > SWIPE_THRESHOLD && touchStartX < sidebarEl.offsetWidth) {
                toggleMenu();
            }
        }
    }
    isSwipeInitiatedFromEdge = false;
    isPotentiallySwipingSidebar = false;
    touchStartX = touchStartY = touchEndX = touchEndY = 0;
}

export function showToast(msg, isError = false) {
    toastEl = toastEl || document.getElementById('toast');
    if (!toastEl) {
        console.error("Toast element not found");
        return;
    }
    toastEl.textContent = msg;
    toastEl.classList.remove('bg-green-600', 'bg-red-600');
    toastEl.classList.add(isError ? 'bg-red-600' : 'bg-green-600');
    toastEl.style.opacity = '1';
    setTimeout(() => { toastEl.style.opacity = '0'; }, 3000);
}

export function toggleSpinner(spinnerElement, show) {
    if (!spinnerElement) return;
    spinnerElement.classList.toggle('hidden', !show);
}

async function loadToolIntoContainer(toolId, currentToolSectionsMap, initializeToolCallback) {
    const toolInfo = currentToolSectionsMap[toolId];
    if (!toolInfo || !toolInfo.htmlPath) {
        console.error(`No HTML path defined for tool: ${toolId}`);
        return false;
    }

    try {
        const response = await fetch(toolInfo.htmlPath);
        if (!response.ok) throw new Error(`Failed to load tool HTML: ${response.statusText}`);
        const html = await response.text();
        
        const toolContainer = document.getElementById('tool-container-host');
        toolContainer.innerHTML = html;

        // Ensure the main tool container is visible after loading
        const toolAppElement = document.getElementById(toolInfo.elementId);
        if (toolAppElement) {
            toolAppElement.classList.remove('hidden');
        }

        // Initialize the tool's JavaScript logic after its HTML is in the DOM
        await initializeToolCallback(toolId);
        return true;
    } catch (error) {
        console.error(`Error loading tool ${toolId}:`, error);
        showToast(`Failed to load tool: ${toolInfo.title}`, true);
        return false;
    }
}

export function showDashboard(fromPopStateUpdate = false, currentToolSectionsMap) {
    const dashboardAppEl = document.getElementById('dashboardApp');
    const appTitleEl = document.getElementById('appTitle');
    const toolContainer = document.getElementById('tool-container-host');

    if (dashboardAppEl) dashboardAppEl.classList.remove('hidden');
    if (toolContainer) toolContainer.innerHTML = '';
    if (appTitleEl) appTitleEl.textContent = 'Novel-Apps';

    sidebarEl = sidebarEl || document.getElementById('sidebar');
    if (sidebarEl && sidebarEl.classList.contains('open')) {
        toggleMenu();
    }

    const targetHash = '#dashboard';
    if (!fromPopStateUpdate && window.location.hash !== targetHash) {
        history.pushState({ view: 'dashboard' }, 'Novel-Apps Dashboard', targetHash);
    }
    sessionStorage.removeItem('activeToolId');
}

export async function launchAppFromCard(appId, fromPopStateUpdate = false, currentToolSectionsMap, initializeToolCallback) {
    const dashboardAppEl = document.getElementById('dashboardApp');
    const appTitleEl = document.getElementById('appTitle');
    const toolInfo = currentToolSectionsMap[appId];

    if (!toolInfo) {
        console.warn(`Tool with ID '${appId}' not found. Showing dashboard.`);
        showDashboard(fromPopStateUpdate, currentToolSectionsMap);
        return;
    }

    if (dashboardAppEl) dashboardAppEl.classList.add('hidden');
    if (appTitleEl) appTitleEl.textContent = toolInfo.title;

    const success = await loadToolIntoContainer(appId, currentToolSectionsMap, initializeToolCallback);

    if (!success) {
        showDashboard(fromPopStateUpdate, currentToolSectionsMap);
        return;
    }

    sidebarEl = sidebarEl || document.getElementById('sidebar');
    if (sidebarEl && sidebarEl.classList.contains('open')) {
        toggleMenu();
    }
    
    const targetToolHash = `#tool-${appId}`;
    if (!fromPopStateUpdate && window.location.hash !== targetToolHash) {
        history.pushState({ view: 'tool', toolId: appId }, toolInfo.title, targetToolHash);
    }
    sessionStorage.setItem('activeToolId', appId);
}