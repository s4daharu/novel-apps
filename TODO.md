# React + TypeScript Conversion TODO

This document tracks the progress of converting the vanilla JavaScript application to a modern React and TypeScript stack.

## Phase 1: Foundation & Component Conversion (Complete)

- [x] Set up React and TypeScript environment using ES modules and an importmap.
- [x] Create the main application shell (`index.html`, `index.tsx`, `App.tsx`).
- [x] Implement a custom hash-based router (`useHashRouter.ts`).
- [x] Create a global `AppContext` for theme management and toast notifications.
- [x] Build the main `Layout`, `Header`, and `Sidebar` components.
- [x] Build the `Dashboard` and reusable `ToolCard` components.
- [x] Create shared utility functions (`backupHelpers.ts`, `browserHelpers.ts`).

## Phase 2: Tool Implementation (Complete)

This phase involved converting each tool from its vanilla JS/HTML implementation into a self-contained React component.

- [x] **Novel Splitter**: `tools/NovelSplitter.tsx` - **COMPLETE**
- [x] **EPUB Splitter**: `tools/EpubSplitter.tsx` - **COMPLETE**
- [x] **ZIP ↔ EPUB Converter**: `tools/ZipEpub.tsx`, `tools/ZipToEpub.tsx`, `tools/EpubToZip.tsx` - **COMPLETE**
- [x] **Create Backup from ZIP**: `tools/CreateBackupFromZip.tsx` - **COMPLETE**
- [x] **Merge Backup Files**: `tools/MergeBackup.tsx` - **COMPLETE**
- [x] **Augment Backup with ZIP**: `tools/AugmentBackupWithZip.tsx` - **COMPLETE**
- [x] **Find & Replace in Backup**: `tools/FindReplaceBackup.tsx` - **COMPLETE**

## Phase 3: Cleanup & Finalization (Complete)

- [x] **Obsolete Files Identified**: The entire `js/` directory and `jszip.min.js` are now obsolete and should be deleted.
- [x] **Update `index.html`**: Cleaned up importmap and removed legacy script fallbacks.
- [x] **Update `service-worker.js`**: Caching rules have been updated for the new React-only application structure.
- [x] **Update `README.md`**: Documentation updated to reflect the new React/TypeScript architecture.
- [x] **Final Code Review**: All tool conversions are complete and placeholders have been replaced with full implementations.

**Project Conversion Complete!** The application is now fully running on React and TypeScript.