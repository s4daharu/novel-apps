/**
 * Browser-compatible UI helper functions
 */

const toastEl = document.getElementById('toast');
const sidebarEl = document.getElementById('sidebar');



// Tool sections map will be imported from main.js to ensure consistency

// --- Touch Gesture State (simplified for browser) ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let isSwipeInitiatedFromEdge = false;
let isPotentiallySwipingSidebar = false;

const SWIPE_THRESHOLD = 80; // Increased threshold for better swipe detection
const SWIPE_EDGE_THRESHOLD = 60;
const SIDEBAR_SWIPE_CLOSE_THRESHOLD = 80;
const MAX_VERTICAL_SWIPE = 100; // Allow more vertical movement

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

    // Apply initial theme on load
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


export function toggleMenu() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    if (el.classList.contains('translate-x-full')) {
        el.classList.remove('translate-x-full');
        el.classList.add('translate-x-0', 'open');
    } else {
        el.classList.add('translate-x-full');
        el.classList.remove('translate-x-0', 'open');
    }
}

export function handleTouchStart(event) {
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    isSwipeInitiatedFromEdge = false;
    isPotentiallySwipingSidebar = false;

    if (!sidebarEl) return;

    // Check for sidebar swipe (edge gestures)
    if (!sidebarEl.classList.contains('open') && touchStartX > window.innerWidth - SWIPE_EDGE_THRESHOLD) {
        isSwipeInitiatedFromEdge = true;
        isPotentiallySwipingSidebar = true;
    } else if (sidebarEl.classList.contains('open') && touchStartX < sidebarEl.offsetWidth + SIDEBAR_SWIPE_CLOSE_THRESHOLD) {
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

    // Handle sidebar swipe
    if (isPotentiallySwipingSidebar && isSwipeInitiatedFromEdge) {
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
            event.preventDefault();
        }
    }
}

export function handleTouchEnd() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Handle sidebar swipe
    if (isSwipeInitiatedFromEdge && isPotentiallySwipingSidebar && sidebarEl) {
        if (Math.abs(deltaY) < MAX_VERTICAL_SWIPE) {
            if (!sidebarEl.classList.contains('open') && deltaX < -SWIPE_THRESHOLD && touchStartX > window.innerWidth - SWIPE_EDGE_THRESHOLD) {
                toggleMenu();
            } else if (sidebarEl.classList.contains('open') && deltaX > SWIPE_THRESHOLD && touchStartX < sidebarEl.offsetWidth + SIDEBAR_SWIPE_CLOSE_THRESHOLD) {
                toggleMenu();
            }
        }
    }

    // Reset all swipe states
    isSwipeInitiatedFromEdge = false;
    isPotentiallySwipingSidebar = false;
    touchStartX = 0; touchStartY = 0; touchEndX = 0; touchEndY = 0;
}



export function showToast(msg, isError = false) {
    if (!toastEl) {
        console.error("Toast element not found");
        return;
    }
    toastEl.textContent = msg;
    // Apply Tailwind color classes directly instead of relying on @apply-based CSS classes
    toastEl.classList.remove('bg-green-600', 'bg-red-600');
    toastEl.classList.add(isError ? 'bg-red-600' : 'bg-green-600');
    toastEl.style.opacity = '1';
    setTimeout(() => { toastEl.style.opacity = '0'; }, 3000);
}

export function toggleSpinner(spinnerElement, show) {
    if (!spinnerElement) {
        return;
    }
    spinnerElement.style.display = show ? 'block' : 'none';
}

function displayTool(appId, currentToolSectionsMap) {
    const dashboardAppEl = document.getElementById('dashboardApp');
    const appTitleEl = document.getElementById('appTitle');

    if (dashboardAppEl) dashboardAppEl.style.display = 'none';

    let currentTitle = 'Novel-Apps';
    let toolDisplayed = false;

    for (const id in currentToolSectionsMap) {
        const toolInfo = currentToolSectionsMap[id];
        const appElement = document.getElementById(toolInfo.elementId);
        if (appElement) {
            if (id === appId) {
                appElement.style.display = 'block';
                currentTitle = toolInfo.title;
                toolDisplayed = true;
            } else {
                appElement.style.display = 'none';
            }
        }
    }
    if (appTitleEl) appTitleEl.textContent = currentTitle;

    if (sidebarEl && sidebarEl.classList.contains('translate-x-0')) {
        toggleMenu();
    }
    return toolDisplayed;
}

export function showDashboard(fromPopStateUpdate = false, currentToolSectionsMap) {
    const dashboardAppEl = document.getElementById('dashboardApp');
    const appTitleEl = document.getElementById('appTitle');

    if (dashboardAppEl) dashboardAppEl.style.display = 'block';

    for (const id in currentToolSectionsMap) {
        const toolInfo = currentToolSectionsMap[id];
        const appElement = document.getElementById(toolInfo.elementId);
        if (appElement) appElement.style.display = 'none';
    }

    if (appTitleEl) appTitleEl.textContent = 'Novel-Apps';

    if (sidebarEl && sidebarEl.classList.contains('translate-x-0')) {
        toggleMenu();
    }

    // Update bottom navigation active state
    updateBottomNavActiveState('dashboard');

    const targetHash = '#dashboard';
    if (!fromPopStateUpdate && window.location.hash !== targetHash) {
        const historyUrl = window.location.protocol === 'blob:' ? null : targetHash;
        history.pushState({ view: 'dashboard' }, 'Novel-Apps Dashboard', historyUrl);
        console.log("UI: Pushed history state for Dashboard. URL used:", historyUrl === null ? "null (blob)" : historyUrl);
    } else if (fromPopStateUpdate) {
         console.log("UI: Show Dashboard from popstate, hash is:", window.location.hash);
    }
    sessionStorage.removeItem('activeToolId');
}

export function launchAppFromCard(appId, fromPopStateUpdate = false, currentToolSectionsMap) {
    const toolDisplayed = displayTool(appId, currentToolSectionsMap);

    if (!toolDisplayed) {
        console.warn(`Tool with ID '${appId}' not found or failed to launch. Showing dashboard.`);
        showDashboard(fromPopStateUpdate, currentToolSectionsMap);
        if (!fromPopStateUpdate) {
             const targetDashboardHash = '#dashboard';
             const historyUrl = window.location.protocol === 'blob:' ? null : targetDashboardHash;
             if (window.location.hash !== targetDashboardHash && historyUrl !== null) {
                history.replaceState({ view: 'dashboard' }, 'Novel-Apps Dashboard', historyUrl);
             }
        }
        return;
    }

    const toolInfo = currentToolSectionsMap[appId];
    const targetToolHash = `#tool-${appId}`;

    // Update bottom navigation active state
    updateBottomNavActiveState(appId);

    if (!fromPopStateUpdate && window.location.hash !== targetToolHash) {
        if (toolInfo) {
            const historyUrl = window.location.protocol === 'blob:' ? null : targetToolHash;
            history.pushState({ view: 'tool', toolId: appId }, toolInfo.title, historyUrl);
            console.log(`UI: Pushed history state for tool '${appId}'. URL used:`, historyUrl === null ? "null (blob)" : historyUrl);
        } else {
            console.error(`Tool info not found for ${appId} during pushState, though displayTool succeeded.`);
        }
    } else if (fromPopStateUpdate) {
        console.log(`UI: Launch app '${appId}' from popstate, hash is:`, window.location.hash);
    }
    sessionStorage.setItem('activeToolId', appId);
}

// Update bottom navigation active state
export function updateBottomNavActiveState(activeView) {
    const bottomNav = document.getElementById('bottomNav');
    if (!bottomNav) return;

    const navItems = bottomNav.querySelectorAll('.nav-item');
    // Reset all items
    navItems.forEach(item => {
        item.classList.remove('active', 'bg-primary-600', 'text-white', 'shadow-lg');
        const icon = item.querySelector('.nav-icon');
        if (icon) icon.classList.remove('scale-110');
    });

    // Find matching nav item using data attributes
    const activeNavItem = bottomNav.querySelector(`[data-tool-id="${activeView}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active', 'bg-primary-600', 'text-white', 'shadow-lg');
        const icon = activeNavItem.querySelector('.nav-icon');
        if (icon) icon.classList.add('scale-110');
    }
}