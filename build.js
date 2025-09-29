#!/usr/bin/env node

/**
 * Simple build script for GitHub Pages deployment
 * Copies all necessary files to a dist directory
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = 'dist';

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Files to copy directly
const filesToCopy = [
    'index.html',
    'index.css',
    'jszip.min.js',
    'manifest.json',
    'service-worker.js'
];

// Copy files
filesToCopy.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`Copying ${file}...`);
        fs.copyFileSync(file, path.join(distDir, file));
    } else {
        console.warn(`Warning: ${file} not found, skipping...`);
    }
});

// Copy icons directory
const iconsDir = 'icons';
if (fs.existsSync(iconsDir)) {
    console.log('Copying icons directory...');
    copyDirectory(iconsDir, path.join(distDir, iconsDir));
}

// Copy js directory
const jsDir = 'js';
if (fs.existsSync(jsDir)) {
    console.log('Copying js directory...');
    copyDirectory(jsDir, path.join(distDir, jsDir));
}

console.log('Build completed successfully!');
console.log('Files are ready in the dist/ directory for GitHub Pages deployment.');

function copyDirectory(source, destination) {
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    const files = fs.readdirSync(source);

    files.forEach(file => {
        const sourcePath = path.join(source, file);
        const destPath = path.join(destination, file);

        if (fs.statSync(sourcePath).isDirectory()) {
            copyDirectory(sourcePath, destPath);
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
    });
}
