# Novel-Apps - Browser Version

A comprehensive set of tools for novelists and writers, converted to run entirely in the browser and deployable on GitHub Pages.

## Features

- **EPUB Chapter Splitter**: Extract chapters from EPUB files into individual text files
- **ZIP to EPUB Converter**: Convert ZIP files containing text chapters into EPUB format
- **EPUB to ZIP Converter**: Extract chapters from EPUB files into a ZIP of text files
- **Backup File Management**: Create, extend, merge, and manipulate novel backup files
- **Find & Replace**: Perform search and replace operations within backup files
- **Augment Backup with ZIP**: Add chapters from ZIP files to existing backups

## Browser Compatibility

This version is fully compatible with modern browsers and includes:
- ✅ Standard browser file upload/download APIs
- ✅ JSZip for file compression/decompression
- ✅ Modern ES modules
- ✅ Responsive design for all screen sizes
- ✅ Touch gesture support for mobile devices

## Local Development

### Prerequisites
- Node.js 18 or higher
- npm

### Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
1. Build the project:
   ```bash
   npm run build
   ```

2. Serve the files locally (using any static file server):
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Using PHP
   php -S localhost:8000
   ```

3. Open your browser and navigate to `http://localhost:8000`

## GitHub Pages Deployment

This project includes automatic deployment to GitHub Pages via GitHub Actions.

### Manual Deployment

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to GitHub Pages**:
   - Go to your repository on GitHub
   - Navigate to Settings → Pages
   - Set Source to "Deploy from a branch"
   - Select "gh-pages" branch
   - Save changes

3. **Enable GitHub Pages**:
   - The site will be available at `https://yourusername.github.io/repository-name/`

### Automatic Deployment

The project includes a GitHub Actions workflow that automatically builds and deploys to GitHub Pages when you push to the `main` branch.

## File Structure

```
├── index.html              # Main HTML file
├── index.css               # Styles
├── js/                     # JavaScript modules
│   ├── index.js           # Entry point
│   ├── main.js            # Main application logic
│   ├── ui-helpers.js      # UI helper functions
│   ├── browser-helpers.js # Browser-compatible file operations
│   └── epub-splitter.js   # EPUB processing functionality
├── icons/                  # App icons
├── jszip.min.js           # JSZip library for file operations
├── manifest.json          # PWA manifest
├── service-worker.js      # Service worker for PWA features
├── build.js               # Build script
└── package.json           # Dependencies and scripts
```

## Key Changes from Mobile Version

- **Removed Capacitor dependencies**: Replaced with standard browser APIs
- **Removed Google GenAI**: Not needed for core functionality
- **Converted TypeScript to JavaScript**: All `.ts` files converted to `.js`
- **Updated build process**: Simple static file copying instead of Vite
- **Browser file operations**: Uses standard File API instead of native file system
- **Maintained all core functionality**: All tools work identically in browser

## Browser Limitations

- File operations are limited to user-initiated uploads/downloads
- Large file processing may be slower than native apps
- Some mobile-specific features (haptics, native file pickers) are not available
- Service worker functionality may be limited compared to mobile PWA

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with `npm run build`
5. Submit a pull request

## License

This project maintains the same license as the original mobile version.

## Support

For issues and questions:
1. Check the GitHub Issues page
2. Create a new issue with detailed information
3. Include browser information and steps to reproduce any problems