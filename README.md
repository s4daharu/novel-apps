# Novel-Apps - Browser Version

A comprehensive set of tools for novelists and writers, built with React and Vite, and deployable on GitHub Pages.

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
- ✅ Modern ES modules and React
- ✅ Responsive design for all screen sizes
- ✅ PWA support for offline functionality

## Local Development

This project uses Vite for a fast development experience.

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to the local URL (e.g., `http://localhost:5173`).

## GitHub Pages Deployment

This project is configured for automatic deployment to GitHub Pages using GitHub Actions. The workflow will automatically build the project and deploy the static assets.

1. Go to your repository on GitHub.
2. Navigate to **Settings** → **Pages**.
3. Under "Build and deployment", set the **Source** to **GitHub Actions**.
4. The site will be automatically built and deployed on every push to the `main` branch.

## File Structure

```
├── dist/                   # Build output for deployment
├── public/                 # Static assets (icons, fonts)
├── src/                    # Source code
│   ├── components/         # React components
│   ├── contexts/           # React contexts
│   ├── pages/              # Page components
│   ├── tools/              # Tool logic components
│   ├── utils/              # Helper functions and types
│   ├── App.tsx             # Main App component
│   ├── main.tsx            # Application entry point
│   ├── index.css           # Main stylesheet
│   └── service-worker.ts   # Custom service worker logic
├── .github/workflows/      # CI/CD workflows
├── index.html              # Main HTML template
├── package.json            # Project dependencies and scripts
└── vite.config.ts          # Vite configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request
