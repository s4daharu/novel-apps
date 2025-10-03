import React, { useReducer, useRef } from 'react';
import JSZip from 'jszip';
import { useAppContext } from '../contexts/AppContext';
import { triggerDownload } from '../utils/browserHelpers';

// Types and Initial State
interface ChapterInfo { index: number; title: string; text: string; }
interface State {
    file: File | null; fileName: string; parsedChapters: ChapterInfo[]; selectedIndices: Set<number>;
    config: { mode: 'single' | 'grouped'; pattern: string; startNumber: number; offset: number; groupSize: number; };
    isLoading: boolean; status: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
}
type Action =
    | { type: 'SET_FILE'; payload: { file: File, fileName: string } } | { type: 'CLEAR_FILE' }
    | { type: 'SET_LOADING'; payload: boolean } | { type: 'SET_STATUS'; payload: State['status'] }
    | { type: 'SET_PARSED_CHAPTERS'; payload: ChapterInfo[] } | { type: 'TOGGLE_CHAPTER'; payload: number }
    | { type: 'SELECT_ALL_CHAPTERS' } | { type: 'DESELECT_ALL_CHAPTERS' }
    | { type: 'SET_CONFIG'; payload: Partial<State['config']> };

const initialState: State = {
    file: null, fileName: 'No file selected.', parsedChapters: [], selectedIndices: new Set(),
    config: { mode: 'single', pattern: 'Chapter ', startNumber: 1, offset: 0, groupSize: 4 },
    isLoading: false, status: null,
};

// Reducer
function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'SET_FILE': return { ...initialState, file: action.payload.file, fileName: action.payload.fileName, status: null };
        case 'CLEAR_FILE': return { ...initialState };
        case 'SET_LOADING': return { ...state, isLoading: action.payload };
        case 'SET_STATUS': return { ...state, status: action.payload };
        case 'SET_PARSED_CHAPTERS': return { ...state, parsedChapters: action.payload, selectedIndices: new Set(action.payload.map(c => c.index)) };
        case 'TOGGLE_CHAPTER':
            const newSelection = new Set(state.selectedIndices);
            if (newSelection.has(action.payload)) newSelection.delete(action.payload); else newSelection.add(action.payload);
            return { ...state, selectedIndices: newSelection };
        case 'SELECT_ALL_CHAPTERS': return { ...state, selectedIndices: new Set(state.parsedChapters.map(c => c.index)) };
        case 'DESELECT_ALL_CHAPTERS': return { ...state, selectedIndices: new Set() };
        case 'SET_CONFIG': return { ...state, config: { ...state.config, ...action.payload } };
        default: return state;
    }
}

const EpubSplitter: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, initialState);
    const { showToast } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        dispatch({ type: 'SET_FILE', payload: { file, fileName: file.name } });
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_STATUS', payload: { message: 'Parsing EPUB file...', type: 'info' } });

        try {
            const buffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(buffer);
            const containerXml = await zip.file('META-INF/container.xml')?.async('text');
            if (!containerXml) throw new Error('META-INF/container.xml not found.');
            
            const parser = new DOMParser();
            const containerDoc = parser.parseFromString(containerXml, 'text/xml');
            const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
            if (!opfPath) throw new Error('OPF file path not found in container.xml.');

            const opfContent = await zip.file(opfPath)?.async('text');
            if (!opfContent) throw new Error(`OPF file not found at: ${opfPath}`);
            
            const opfDoc = parser.parseFromString(opfContent, 'text/xml');
            const opfBasePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

            const manifestItems: Record<string, string> = {};
            opfDoc.querySelectorAll('manifest > item').forEach(item => {
                if (item.getAttribute('id') && item.getAttribute('href')) manifestItems[item.getAttribute('id')!] = item.getAttribute('href')!;
            });
            
            const spineItems: string[] = Array.from(opfDoc.querySelectorAll('spine > itemref'))
                .map(itemref => itemref.getAttribute('idref'))
                .map(idref => idref ? manifestItems[idref] : null)
                .filter((href): href is string => !!href && !href.includes('toc') && !href.includes('nav'))
                .map(href => (opfBasePath + href).replace(/\\/g, '/'));

            const tempChapters: Omit<ChapterInfo, 'index'>[] = [];
            
            const extractContent = (body: HTMLElement) => {
                 return Array.from(body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6'))
                    .map(el => el.textContent?.trim())
                    .filter(Boolean)
                    .join('\n\n');
            };

            for (const path of spineItems) {
                const content = await zip.file(path)?.async('text');
                if (!content) continue;
                
                let doc = parser.parseFromString(content, 'application/xhtml+xml');
                if (doc.querySelector("parsererror")) doc = parser.parseFromString(content, 'text/html');

                if (doc.body) {
                    const titleEl = doc.body.querySelector('h1, h2, h3, title');
                    const title = titleEl?.textContent?.trim() || `Chapter ${tempChapters.length + 1}`;
                    const text = extractContent(doc.body);

                    if (text) tempChapters.push({ title, text });
                }
            }
            
            const chapters = tempChapters.map((chap, index) => ({ ...chap, index }));
            dispatch({ type: 'SET_PARSED_CHAPTERS', payload: chapters });
            if (chapters.length > 0) {
                showToast(`Found ${chapters.length} chapters.`);
                dispatch({ type: 'SET_STATUS', payload: null });
            } else {
                 throw new Error('No chapters could be extracted. The EPUB might not have a standard structure.');
            }

        } catch (err: any) {
            showToast(err.message || 'Error parsing EPUB.', true);
            dispatch({ type: 'SET_STATUS', payload: { message: err.message, type: 'error' } });
            if (fileInputRef.current) fileInputRef.current.value = '';
            dispatch({ type: 'CLEAR_FILE' });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    const handleSplit = async () => {
        if (state.selectedIndices.size === 0) { showToast('No chapters selected.', true); return; }
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_STATUS', payload: { message: 'Splitting chapters...', type: 'info' } });
        try {
            const { pattern, startNumber, offset, mode, groupSize } = state.config;
            const chaptersToProcess = state.parsedChapters
                .filter(c => state.selectedIndices.has(c.index))
                .map(c => c.text);

            const usableChaps = chaptersToProcess.slice(offset);
            if (usableChaps.length === 0) throw new Error(`Offset of ${offset} left no chapters to process.`);

            const zip = new JSZip();
            if (mode === 'single') {
                usableChaps.forEach((text, i) => zip.file(`${pattern}${String(startNumber + i).padStart(2, '0')}.txt`, text));
            } else {
                for (let i = 0; i < usableChaps.length; i += groupSize) {
                    const group = usableChaps.slice(i, i + groupSize);
                    const start = startNumber + i; const end = start + group.length - 1;
                    const name = group.length === 1 ? `${pattern}${String(start).padStart(2, '0')}.txt` : `${pattern}${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}.txt`;
                    zip.file(name, group.join('\n\n\n---------------- END ----------------\n\n\n'));
                }
            }
            const blob = await zip.generateAsync({ type: 'blob' });
            triggerDownload(blob, `${pattern.trim()}_chapters.zip`, showToast);
            dispatch({ type: 'SET_STATUS', payload: { message: `Extracted ${usableChaps.length} chapters. Download started.`, type: 'success' } });
        } catch (err: any) {
            showToast(err.message, true);
            dispatch({ type: 'SET_STATUS', payload: { message: err.message, type: 'error' } });
        }
        finally { dispatch({ type: 'SET_LOADING', payload: false }); }
    };
    
    return (
        <div className="max-w-3xl md:max-w-4xl mx-auto p-4 md:p-6 bg-white/70 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-5 animate-fade-in">
             <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-5 text-center">EPUB Chapter Splitter</h1>

            <div className="max-w-md mx-auto">
                <label htmlFor="epub-upload-input" className="inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium bg-violet-600 hover:bg-violet-700 text-white shadow-lg w-full cursor-pointer">Upload EPUB File</label>
                <input type="file" id="epub-upload-input" accept=".epub" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                <div className="mt-2.5 flex items-center justify-center bg-slate-100 dark:bg-slate-700/50 p-2 rounded-md min-h-[40px]">
                    <span className="text-sm text-slate-500 dark:text-slate-300 max-w-[calc(100%-30px)] overflow-hidden text-ellipsis whitespace-nowrap inline-block">{state.fileName}</span>
                    {state.file && <button onClick={() => { if(fileInputRef.current) fileInputRef.current.value = ''; dispatch({ type: 'CLEAR_FILE' }); }} className="bg-transparent border-none text-slate-500 text-2xl font-bold cursor-pointer ml-2 p-1 leading-none transition-colors hover:text-slate-800 dark:hover:text-white" aria-label="Clear EPUB file">&times;</button>}
                </div>
            </div>

            {state.parsedChapters.length > 0 && (
                <div className="mt-6 p-4 bg-slate-100 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600/50">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Select Chapters to Split</h4>
                        <div className="text-sm text-primary-600 dark:text-primary-400">{state.parsedChapters.length} chapters found</div>
                    </div>
                    <div className="mb-4 flex justify-center gap-3">
                        <button onClick={() => dispatch({type: 'SELECT_ALL_CHAPTERS'})} className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-lg">Select All</button>
                        <button onClick={() => dispatch({type: 'DESELECT_ALL_CHAPTERS'})} className="px-3 py-1 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-lg">Deselect All</button>
                    </div>
                    <ul className="max-w-xl mx-auto max-h-48 overflow-y-auto bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg p-3 list-none text-left">
                        {state.parsedChapters.map(chap => (
                            <li key={chap.index} className="flex items-center gap-2 p-1.5 rounded-md transition-colors hover:bg-slate-200 dark:hover:bg-slate-700">
                                <input type="checkbox" id={`chap-${chap.index}`} checked={state.selectedIndices.has(chap.index)} onChange={() => dispatch({type: 'TOGGLE_CHAPTER', payload: chap.index})} className="w-4 h-4 rounded accent-primary-600" />
                                <label htmlFor={`chap-${chap.index}`} className="text-sm flex-1 cursor-pointer">{chap.title}</label>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            
            <div className="max-w-md mx-auto">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Form controls will go here, bound to state.config and dispatching SET_CONFIG */}
                </div>
            </div>
            
            <div className="mt-8 flex justify-center">
                <button onClick={handleSplit} disabled={!state.file || state.isLoading || state.selectedIndices.size === 0} className="px-4 py-2 rounded-lg font-medium bg-primary-600 text-white disabled:opacity-60 disabled:cursor-not-allowed">Split EPUB</button>
            </div>
            
            {state.isLoading && <div className="w-10 h-10 border-4 border-slate-200 dark:border-slate-700 rounded-full border-t-primary-600 animate-spin my-4 mx-auto" role="status"></div>}
            {state.status && <div className={`rounded-xl p-4 mt-5 text-center text-sm ${state.status.type === 'error' ? 'bg-red-50 dark:bg-red-600/10 border border-red-200 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-600/10 border border-green-200 text-green-700 dark:text-green-400'}`}>{state.status.message}</div>}
        </div>
    );
};

export default EpubSplitter;
