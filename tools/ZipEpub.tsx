import React, { useState, useEffect, lazy, Suspense } from 'react';

const ZipToEpub = lazy(() => import('./ZipToEpub'));
const EpubToZip = lazy(() => import('./EpubToZip'));

type Mode = 'zipToEpub' | 'epubToZip';

const Spinner = () => (
    <div className="flex justify-center items-center h-48">
        <div className="w-8 h-8 border-4 border-slate-200 dark:border-slate-700 rounded-full border-t-primary-600 animate-spin" role="status">
            <span className="sr-only">Loading...</span>
        </div>
    </div>
);

const ZipEpub: React.FC = () => {
  const [mode, setMode] = useState<Mode>('zipToEpub');

  useEffect(() => {
    const savedMode = sessionStorage.getItem('zipEpubMode') as Mode;
    if (savedMode) {
      setMode(savedMode);
    }
  }, []);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    sessionStorage.setItem('zipEpubMode', newMode);
  };

  const baseButtonClasses = "flex items-center px-6 py-3 rounded-lg font-medium shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 hover:scale-105";
  const activeButtonClasses = "bg-primary-600 text-white focus:ring-primary-500 hover:bg-primary-700";
  const inactiveButtonClasses = "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 focus:ring-slate-500 hover:bg-slate-300 dark:hover:bg-slate-600";

  return (
    <div className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in tool-section">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">ZIP ↔ EPUB Converter</h1>

      <div className="max-w-md mx-auto mb-6">
        <label className="text-center block mb-4 text-slate-800 dark:text-slate-200">Conversion Direction:</label>
        <div className="flex justify-center gap-3 mt-2">
          <button
            onClick={() => handleModeChange('zipToEpub')}
            className={`${baseButtonClasses} ${mode === 'zipToEpub' ? activeButtonClasses : inactiveButtonClasses}`}
          >
            <span>ZIP → EPUB</span>
          </button>
          <button
            onClick={() => handleModeChange('epubToZip')}
            className={`${baseButtonClasses} ${mode === 'epubToZip' ? activeButtonClasses : inactiveButtonClasses}`}
          >
            <span>EPUB → ZIP</span>
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-3">Choose your conversion direction</p>
      </div>

      <div id="zipEpubHost">
        <Suspense fallback={<Spinner />}>
            {mode === 'zipToEpub' ? <ZipToEpub /> : <EpubToZip />}
        </Suspense>
      </div>
    </div>
  );
};

export default ZipEpub;
