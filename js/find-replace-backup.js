/**
 * Browser-compatible Find & Replace Backup functionality (HUD Overhaul)
 */
import { triggerDownload } from './browser-helpers.js';

// --- STATE ---
let frData = null; // The loaded backup file content (as a JS object)
let allMatches = []; // Array of all found matches across the selected scope
let currentMatchIndex = -1; // Index of the currently highlighted match in `allMatches`
let modificationsMade = false; // Flag to enable the download button

const SNIPPET_CONTEXT_LENGTH = 80; // Characters of context before and after match

// --- DOM ELEMENTS ---
// Main containers
const frContainer = document.getElementById('findReplaceBackupApp');
const frUploadArea = document.getElementById('frUploadArea');
const frDownloadContainer = document.getElementById('frDownloadContainer');
const frSnippetPreview = document.getElementById('frSnippetPreview');
// Upload
const frBackupFileInput = document.getElementById('frBackupFile');
// HUD
const frHud = document.getElementById('frHud');
const findPatternInput = document.getElementById('findPattern');
const replaceTextInput = document.getElementById('replaceText');
const frReplaceToggleBtn = document.getElementById('frReplaceToggleBtn');
const frReplaceRow = document.getElementById('frReplaceRow');
const matchCountDisplay = document.getElementById('frMatchCountDisplay');
const findPreviousBtn = document.getElementById('findPreviousBtn');
const findNextBtn = document.getElementById('findNextBtn');
const frDoneBtn = document.getElementById('frDoneBtn');
// HUD Actions
const replaceNextBtn = document.getElementById('replaceNextBtn');
const replaceAllBtn = document.getElementById('replaceAllBtn');
// Options Popover
const frOptionsToggleBtn = document.getElementById('frOptionsToggleBtn');
const frOptionsPopover = document.getElementById('frOptionsPopover');
const frScopeSelect = document.getElementById('frScopeSelect');
const useRegexCheckbox = document.getElementById('useRegexBackup');
const caseSensitiveCheckbox = document.getElementById('frCaseSensitiveCheckbox');
const wholeWordCheckbox = document.getElementById('frWholeWordCheckbox');
// Common
const downloadCurrentFrBackupBtn = document.getElementById('downloadCurrentFrBackupBtn');
let frSpinner = null;
// Review Modal
const frReviewModal = document.getElementById('frReviewModal');
const frCloseReviewModalBtn = document.getElementById('frCloseReviewModalBtn');
const frReviewSelectAll = document.getElementById('frReviewSelectAll');
const frReviewSummaryText = document.getElementById('frReviewSummaryText');
const frReviewList = document.getElementById('frReviewList');
const frCancelReviewBtn = document.getElementById('frCancelReviewBtn');
const frConfirmReplaceAllBtn = document.getElementById('frConfirmReplaceAllBtn');


// --- HELPER FUNCTIONS ---
const escapeHtml = (unsafe) => unsafe.replace(/[&<>"']/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[