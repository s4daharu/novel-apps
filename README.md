# Novel-Apps - React & TypeScript Version

A comprehensive set of tools for novelists and writers, rebuilt with React and TypeScript to run entirely in the browser and deployable on GitHub Pages.

## Features

- **Novel Splitter**: Advanced tool to split, edit, and package .txt novels into chapters, with export to ZIP or themed EPUB.
- **EPUB Chapter Splitter**: Extract chapters from EPUB files into individual text files.
- **ZIP to EPUB Converter**: Convert ZIP files containing text chapters into EPUB format.
- **EPUB to ZIP Converter**: Extract chapters from EPUB files into a ZIP of text files.
- **Backup File Management**: Create, extend, merge, and find/replace within novel backup files.
- **Modern Tech Stack**: Built with React 19, TypeScript, and Tailwind CSS for a maintainable and performant experience.

## Browser Compatibility

This version is fully compatible with modern browsers and includes:
- ✅ Standard browser file upload/download APIs
- ✅ JSZip for file compression/decompression
- ✅ Modern ES modules with React loaded via CDN
- ✅ Responsive design for all screen sizes
- ✅ Touch gesture support for mobile devices
- ✅ PWA support for offline use

## Local Development

This project uses React and TypeScript. To run it locally, you need a development server that can transpile TSX/JSX on the fly.

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server using `esbuild`:
    ```bash
    npm run dev
    ```
4.  Open your browser and navigate to `http://localhost:8000`. The server will automatically rebuild when you make changes.

## GitHub Pages Deployment

This project is configured for automatic deployment to GitHub Pages using GitHub Actions. The workflow will automatically transpile the TypeScript code and deploy the static assets.

1. Go to your repository on GitHub.
2. Navigate to **Settings** → **Pages**.
3. Under "Build and deployment", set the **Source** to **GitHub Actions**.
4. The site will be automatically deployed on every push to the `main` branch and will be available at `https://<your-username>.github.io/<repository-name>/`.

## File Structure

```
├── index.html              # Main HTML shell for the React app
├── index.tsx               # Entry point for the React application
├── App.tsx                 # Root React component with routing
├── components/             # Reusable UI components (Layout, Sidebar, etc.)
├── contexts/               # React Context providers (AppContext)
├── hooks/                  # Custom React hooks (useHashRouter)
├── tools/                  # Main component for each tool
├── utils/                  # Shared helper functions
├── types.ts                # TypeScript type definitions
├── icons/                  # App icons
├── manifest.json           # PWA manifest
└── service-worker.js       # Service worker for PWA features
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## License

This project is available under the Apache 2.0 license.

## Support

For issues and questions:
1. Check the GitHub Issues page
2. Create a new issue with detailed information
3. Include browser information and steps to reproduce any problems