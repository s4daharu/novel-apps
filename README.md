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

This is a pure static HTML, CSS, and JavaScript application. There is no build step required.

1. Clone the repository.
2. Serve the files locally using any static file server:
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve .

   # Using PHP
   php -S localhost:8000
   ```
3. Open your browser and navigate to the local URL (e.g., `http://localhost:8000`).

## GitHub Pages Deployment

This project is configured for automatic deployment to GitHub Pages using GitHub Actions.

1. Go to your repository on GitHub.
2. Navigate to **Settings** → **Pages**.
3. Under "Build and deployment", set the **Source** to **GitHub Actions**.
4. The site will be automatically deployed on every push to the `main` branch and will be available at `https://<your-username>.github.io/<repository-name>/`.

## File Structure

```
├── index.html              # Main HTML file
├── js/                     # JavaScript modules
│   ├── index.js           # Entry point
│   ├── main.js            # Main application logic
│   └── ...                # Other tool scripts
├── icons/                  # App icons
├── jszip.min.js           # JSZip library for file operations
├── manifest.json          # PWA manifest
└── service-worker.js      # Service worker for PWA features
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
4. Test locally
5. Submit a pull request

## License

This project maintains the same license as the original mobile version.

## Support

For issues and questions:
1. Check the GitHub Issues page
2. Create a new issue with detailed information
3. Include browser information and steps to reproduce any problems
