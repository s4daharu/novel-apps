// This app uses a global JSZip variable from the jszip.min.js script in index.html

export function initializeNovelSplitter(showAppToast, toggleAppSpinner) {
    const JSZip = window.JSZip;
    
    // =================================================================
    // DOM REFERENCES
    // =================================================================
    const D = {
      // Views
      setupView: document.getElementById('setupView'),
      editorView: document.getElementById('editorView'),

      // Setup View
      fileInput: document.getElementById('fileInput'),
      coverInput: document.getElementById('coverInput'),
      fileDropZone: document.getElementById('fileDropZone'),
      coverDropZone: document.getElementById('coverDropZone'),
      chapterPatternSelect: document.getElementById('chapterPattern'),
      customRegexContainer: document.getElementById('customRegexContainer'),
      customRegexInput: document.getElementById('customRegexInput'),
      encodingSelect: document.getElementById('encodingSelect'),
      fileNameInfo: document.getElementById('fileNameInfo'),
      coverNameInfo: document.getElementById('coverNameInfo'),
      processBtn: document.getElementById('processBtn'),
      statusDiv: document.getElementById('status'),
      matchPreview: document.getElementById('matchPreview'),
      metaTitle: document.getElementById('metaTitle'),
      metaAuthor: document.getElementById('metaAuthor'),
      epubTheme: document.getElementById('epubTheme'),
      cleanupRulesContainer: document.getElementById('cleanupRulesContainer'),
      addRuleBtn: document.getElementById('addRuleBtn'),

      // Editor View
      backBtn: document.getElementById('backBtn'),
      downloadZipBtn: document.getElementById('downloadZipBtn'),
      downloadEpubBtn: document.getElementById('downloadEpubBtn'),
      chapterList: document.getElementById('chapterList'),
      chapterContent: document.getElementById('chapterContent'),
      splitChapterBtn: document.getElementById('splitChapterBtn'),
      saveChapterBtn: document.getElementById('saveChapterBtn'),
      fullscreenBtn: document.getElementById('fullscreenBtn'),
      findInput: document.getElementById('findInput'),
      replaceInput: document.getElementById('replaceInput'),
      replaceAllBtn: document.getElementById('replaceAllBtn'),

      // Progress Bar
      progressContainer: document.getElementById('progressContainer'),
      progressBar: document.getElementById('progressBar'),
      progressText: document.getElementById('progressText'),
      
      // UX Elements
      restoreBanner: document.getElementById('restoreBanner'),
      restoreSessionBtn: document.getElementById('restoreSessionBtn'),
      dismissSessionBtn: document.getElementById('dismissSessionBtn'),
      tooltip: document.getElementById('tooltip'),
    };

    // =================================================================
    // STATE MANAGEMENT & PERSISTENCE
    // =================================================================
    const SESSION_STORAGE_KEY = 'novelSplitterSession';
    let state;

    function getInitialState() {
      return {
        fileContent: '',
        fileName: '',
        coverFile: null,
        chapters: [],
        selectedChapterId: null,
        isDirty: false,
        meta: { title: '', author: '', theme: 'modern' },
        cleanupRules: [],
        chapterPattern: 'auto',
        customRegex: '',
        encoding: 'auto',
      };
    }

    function saveState() {
      try {
        const stateToSave = JSON.stringify(state);
        localStorage.setItem(SESSION_STORAGE_KEY, stateToSave);
      } catch (e) {
        console.error("Failed to save session state:", e);
        setStatus('Could not save session. Your browser might be in private mode or storage is full.', 'error');
      }
    }

    function loadStateFromStorage() {
      const savedState = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedState) {
        try {
          state = JSON.parse(savedState);
          return true;
        } catch (e) {
          console.error("Failed to parse saved state:", e);
          localStorage.removeItem(SESSION_STORAGE_KEY);
          return false;
        }
      }
      return false;
    }

    function clearStateAndStorage() {
      state = getInitialState();
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }

    function checkForUnsavedSession() {
      const savedStateJSON = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedStateJSON) {
        try {
          const savedState = JSON.parse(savedStateJSON);
          if (savedState.fileName || savedState.chapters.length > 0) {
            D.restoreBanner.style.display = 'block';
          }
        } catch {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      }
    }

    function restoreSession() {
        if (loadStateFromStorage()) {
            if (state.chapters.length > 0) {
                showView('editor');
                selectChapter(state.selectedChapterId ?? (state.chapters[0]?.id || null));
            } else {
                showView('setup');
                updateSetupViewFromState();
            }
            showAppToast('Session restored.');
        } else {
            showAppToast('Could not restore session.', true);
        }
        D.restoreBanner.style.display = 'none';
    }


    // =================================================================
    // HELPERS
    // =================================================================
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    async function base64ToCoverFile(coverData) {
        if (!coverData) return null;
        const res = await fetch(`data:${coverData.type};base64,${coverData.content}`);
        const blob = await res.blob();
        return new File([blob], coverData.name, { type: coverData.type });
    }
    function readFileAsArrayBuffer(file){
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsArrayBuffer(file);
      });
    }
    function downloadFile(blob, filename){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }
    function escapeHtml(s){
      const d = document.createElement('div');
      d.innerText = s;
      return d.innerHTML;
    }
    function getCoverExtension(mime){
      const map = {'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'};
      return map[mime] || 'img';
    }
    function safeFilename(name){
      return String(name || '')
        .replace(/[\u0000-\u001f]/g, '')
        .replace(/[\\\/:*?"<>|]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 180) || 'untitled';
    }
    async function decodeText(buffer, encoding) {
      if (encoding === 'auto') {
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
        catch (e) { /* ignore and try next */ }

        try { return new TextDecoder('gbk', { fatal: true }).decode(buffer); }
        catch (e) { /* ignore and try next */ }

        try { return new TextDecoder('big5', { fatal: true }).decode(buffer); }
        catch (e) { /* ignore and try next */ }
        
        setStatus('Auto-detection failed; file might be in an unsupported encoding. Displaying with UTF-8.', 'error');
        return new TextDecoder('utf-8').decode(buffer);
      } else {
        return new TextDecoder(encoding, { fatal: false }).decode(buffer);
      }
    }
    const CHAPTER_TEMPLATES = {
      chinese: /^\s*第\s*([0-9]+)\s*章[\.。:\s]?.*$/im,
      chinese_numeral: /^\s*第\s*([一二三四五六七八九十百千零〇]+)\s*章.*$/im,
      chapter: /^\s*Chapter\s*([0-9]+)\b.*$/im,
      ch: /^\s*Ch(?:apter)?\.?\s*([0-9]+)\b.*$/im,
      titledot: /^\s*([^\r\n]{1,120})\.\s*\d+\s*$/uim,
      parenfullwidth: /^\s*（\s*\d+\s*\.?\s*）\s*$/uim
    };

    // =================================================================
    // UI & VIEW MANAGEMENT
    // =================================================================
    function showView(view) {
        D.setupView.style.display = view === 'setup' ? 'block' : 'none';
        D.editorView.style.display = view === 'editor' ? 'block' : 'none';
    }
    function setStatus(msg, type){
      D.statusDiv.textContent = msg;
      D.statusDiv.className = 'status small'; // Reset classes
      if(type) D.statusDiv.classList.add(type);
    }
    function showProgress(){ D.progressContainer.style.display = 'block'; updateProgress(0,''); }
    function hideProgress(){ D.progressContainer.style.display = 'none'; }
    function updateProgress(pct, msg){
      const v = Math.max(0, Math.min(100, Math.round(pct)));
      D.progressBar.style.width = v + '%';
      D.progressText.textContent = v + '%' + (msg ? (' – ' + msg) : '');
      D.progressBar.setAttribute('aria-valuenow', String(v));
      D.progressText.setAttribute('aria-label', `${v}% ${msg}`);
    }
    function setupTooltips() {
        document.querySelectorAll('#novelSplitterApp .tooltip-trigger').forEach(trigger => {
            trigger.addEventListener('mouseenter', (e) => {
                const target = e.target;
                D.tooltip.textContent = target.dataset.tooltip || '';
                const rect = target.getBoundingClientRect();
                D.tooltip.style.display = 'block';
                D.tooltip.style.left = `${rect.left}px`;
                D.tooltip.style.top = `${rect.bottom + 5}px`;
            });
            trigger.addEventListener('mouseleave', () => {
                D.tooltip.style.display = 'none';
            });
        });
    }

    function updateSetupViewFromState() {
      D.fileNameInfo.textContent = state.fileName ? `Loaded: ${state.fileName}` : 'Or drag and drop file here';
      D.coverNameInfo.textContent = state.coverFile?.name ? `Cover: ${state.coverFile.name}` : 'Or drag and drop image here';
      D.processBtn.disabled = !state.fileContent;
      D.encodingSelect.value = state.encoding;
      D.chapterPatternSelect.value = state.chapterPattern;
      D.customRegexInput.value = state.customRegex;
      D.metaTitle.value = state.meta.title;
      D.metaAuthor.value = state.meta.author;
      D.epubTheme.value = state.meta.theme;
      
      D.cleanupRulesContainer.innerHTML = '';
      state.cleanupRules.forEach(renderCleanupRule);

      D.customRegexContainer.style.display = state.chapterPattern === 'custom' ? 'block' : 'none';
      showMatchPreview();
    }

    // =================================================================
    // PROCESSING & SPLITTING
    // =================================================================
    function detectPattern(lines) {
      for(const key in CHAPTER_TEMPLATES){
        const rx = CHAPTER_TEMPLATES[key];
        let c = 0;
        for(let i=0;i<Math.min(lines.length, 400); i++){
          if(rx.test(lines[i])){ c++; if(c>1) return {key, rx}; }
        }
      }
      return null;
    }

    function getActiveRegexInfo() {
        const selected = D.chapterPatternSelect.value;
        if (selected === 'custom') {
            const pattern = D.customRegexInput.value;
            if (!pattern) return { rx: null, key: 'custom', error: 'Please enter a custom Regex pattern.' };
            try {
                return { rx: new RegExp(pattern, 'im'), key: 'custom' };
            } catch (e) {
                return { rx: null, key: 'custom', error: `Invalid Regex: ${e.message}` };
            }
        }
        if (selected === 'auto') {
            const lines = (state.fileContent || '').split(/\r?\n/);
            const detected = detectPattern(lines);
            if (detected) {
                D.chapterPatternSelect.value = detected.key; // QOL improvement
                return detected;
            }
            return { rx: null, key: 'auto', error: 'Auto-detect found no repeated heading pattern in first 400 lines.' };
        }
        return { rx: CHAPTER_TEMPLATES[selected] || null, key: selected };
    }

    function getExampleMatches(rx, lines) {
      const arr = [];
      for(let i=0;i<Math.min(lines.length, 500); i++){
        if(rx.test(lines[i])) arr.push(lines[i].trim());
        if(arr.length>=5) break;
      }
      return arr;
    }

    function showMatchPreview() {
      if(!state.fileContent) { D.matchPreview.style.display = 'none'; return; }
      const lines = state.fileContent.split(/\r?\n/);
      const info = getActiveRegexInfo();
      D.matchPreview.style.display = 'block';

      if('error' in info && info.error){
        D.matchPreview.textContent = info.error;
        return;
      }
      if(!info.rx){
        D.matchPreview.textContent = 'No pattern selected or detected.';
        return;
      }

      const matches = getExampleMatches(info.rx, lines);
      if (matches.length) {
        let prefix = '';
        if (info.key === 'auto' && info.rx) {
            const detectedKey = Object.keys(CHAPTER_TEMPLATES).find(k => CHAPTER_TEMPLATES[k] === info.rx);
            prefix = `Auto-detected: ${detectedKey}. `;
        }
        D.matchPreview.textContent = `${prefix}Matches: ${matches.join(' | ')}`;
      } else {
        D.matchPreview.textContent = 'No matches found for this pattern in the first 500 lines.';
      }
    }

    function applyCleanupRules(text) {
        let processedText = text;
        state.cleanupRules.forEach(pattern => {
            if (pattern) {
                try {
                    const regex = new RegExp(pattern, 'gim');
                    processedText = processedText.replace(regex, '');
                } catch (e) {
                    console.warn(`Invalid cleanup regex: ${pattern}`, e);
                }
            }
        });
        return processedText;
    }

    function splitChapters(text) {
      const cleanedText = applyCleanupRules(text);
      const lines = String(cleanedText).split(/\r?\n/);
      const info = getActiveRegexInfo();
      
      if ('error' in info && info.error) {
        setStatus(info.error, 'error');
        return null;
      }

      const rx = info.rx;
      let currentChapters = [];
      let current = null;
      const pushCurrent = () => { if(current) currentChapters.push(current); };

      if(!rx){
        currentChapters.push({ title: 'synopsis', content: cleanedText.trim() });
      } else {
        let preface = [];
        for(const raw of lines){
          const line = String(raw || '');
          if(rx.test(line)){
            pushCurrent();
            current = { title: line.trim(), content: '' };
          } else {
            if(!current) {
              preface.push(line);
            } else {
              current.content += (current.content ? '\n' : '') + line;
            }
          }
        }
        pushCurrent();
        const prefaceContent = preface.join('\n').trim();
        if (prefaceContent) {
            currentChapters.unshift({ title: 'synopsis', content: prefaceContent });
        }
      }
      return currentChapters.map((ch, i) => ({ ...ch, id: i }));
    }

    // =================================================================
    // EDITOR LOGIC
    // =================================================================
    function renderEditor() {
        D.chapterList.innerHTML = '';
        state.chapters.forEach((chapter, index) => {
            const li = document.createElement('li');
            li.dataset.id = String(chapter.id);
            li.draggable = true;
            if (chapter.id === state.selectedChapterId) {
                li.classList.add('selected');
            }

            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.value = chapter.title;
            titleInput.className = 'chapter-title';
            titleInput.addEventListener('change', e => {
                chapter.title = e.target.value;
                saveState();
            });

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'chapter-actions';

            const mergeBtn = document.createElement('button');
            mergeBtn.textContent = 'Merge ↑';
            mergeBtn.title = 'Merge this chapter up into the one above it';
            mergeBtn.dataset.action = 'merge';
            if (index === 0) mergeBtn.disabled = true;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Del';
            deleteBtn.title = 'Delete this chapter';
            deleteBtn.dataset.action = 'delete';
            
            actionsDiv.append(mergeBtn, deleteBtn);
            li.append(titleInput, actionsDiv);
            D.chapterList.appendChild(li);
        });
    }

    function selectChapter(id) {
        if (state.isDirty) {
            if (!confirm('You have unsaved changes. Are you sure you want to switch chapters?')) {
                return;
            }
        }
        state.selectedChapterId = id;
        const chapter = state.chapters.find(c => c.id === id);
        if (chapter) {
            D.chapterContent.value = chapter.content;
            D.splitChapterBtn.disabled = false;
            D.saveChapterBtn.disabled = true;
            state.isDirty = false;
            D.chapterContent.placeholder = "Select a chapter to view its content...";
        } else {
            D.chapterContent.value = '';
            D.splitChapterBtn.disabled = true;
            D.saveChapterBtn.disabled = true;
            D.chapterContent.placeholder = "Select a chapter to begin editing. You can split chapters, merge them, and reorder the list by dragging.";
        }
        renderEditor();
    }

    function saveCurrentChapter() {
        if (state.selectedChapterId !== null) {
            const chapter = state.chapters.find(c => c.id === state.selectedChapterId);
            if (chapter) {
                chapter.content = D.chapterContent.value;
                state.isDirty = false;
                D.saveChapterBtn.disabled = true;
                saveState();
                showAppToast('Changes saved!');
            }
        }
    }

    function renderCleanupRule(pattern) {
        const ruleItem = document.createElement('div');
        ruleItem.className = 'rule-item';
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter regex pattern to remove...';
        input.value = pattern;

        input.addEventListener('change', () => {
            const index = Array.from(D.cleanupRulesContainer.children).indexOf(ruleItem);
            if (index > -1) {
                state.cleanupRules[index] = input.value.trim();
            }
        });

        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.className = 'small-btn';
        removeBtn.onclick = () => {
            const index = Array.from(D.cleanupRulesContainer.children).indexOf(ruleItem);
            if (index > -1) {
                state.cleanupRules.splice(index, 1);
            }
            ruleItem.remove();
        };
        ruleItem.append(input, removeBtn);
        D.cleanupRulesContainer.appendChild(ruleItem);
    }

    // =================================================================
    // EXPORT LOGIC
    // =================================================================
    function getEpubStyles(theme) {
        switch(theme) {
            case 'classic': return `body{font-family:serif, "Times New Roman", Times;} p{margin:0 0 0.75em 0; text-indent:0; white-space: pre-wrap;}`;
            case 'minimal': return `body{margin:5px;} p{margin-bottom:1em; text-indent:0; white-space: pre-wrap;}`;
            case 'modern': default: return `body{font-family:sans-serif,"Helvetica Neue",Helvetica,Arial;} p{margin:0 0 1em; text-indent:0; white-space: pre-wrap;}`;
        }
    }

    async function createZipDownload(chaptersToExport){
      showProgress();
      updateProgress(5, 'Preparing ZIP…');
      const zip = new JSZip();
      const BOM = "\uFEFF"; // UTF-8 Byte Order Mark
      const base = safeFilename((state.fileName || 'novel').replace(/\.txt$/i, ''));
      const total = chaptersToExport.length;
      for(let i=0;i<total;i++){
        const ch = chaptersToExport[i];
        const namePart = (i === 0 && ch.title.toLowerCase() === 'synopsis') ? 'synopsis' : (ch.title || `chapter${i}`);
        const index = String(i).padStart(3, '0');
        const fname = `${index}_${safeFilename(namePart)}.txt`;
        zip.file(fname, BOM + (ch.content || ''));
        updateProgress(10 + (i/total)*80, `Adding ${fname}`);
        await new Promise(r => setTimeout(r, 0));
      }
      updateProgress(95, 'Generating ZIP…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      downloadFile(blob, `${base}_chapters.zip`);
      updateProgress(100, 'Done');
      setTimeout(hideProgress, 500);
    }

    async function createEpubDownload(chaptersToExport) {
        showProgress(); updateProgress(5, 'Preparing EPUB...');
        const zip = new JSZip();
        const base = safeFilename((state.fileName || 'novel').replace(/\.txt$/i, ''));
        const bookId = crypto.randomUUID();
        const titleMeta = state.meta.title.trim() || base;
        const authorMeta = state.meta.author.trim() || 'Unknown Author';
        const lang = 'en';
        const modifiedDate = new Date().toISOString().split('T')[0];

        zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
        zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
        const oebps = zip.folder('OEBPS');
        oebps.file('style.css', getEpubStyles(state.meta.theme));

        let coverHref = null;
        let coverMediaType = null;
        const coverFile = await base64ToCoverFile(state.coverFile);
        if (coverFile) {
            const ext = getCoverExtension(coverFile.type);
            coverHref = `cover.${ext}`;
            coverMediaType = coverFile.type || 'image/jpeg';
            oebps.file(coverHref, await readFileAsArrayBuffer(coverFile));
        }
        
        const manifestItems = [];
        const spineItems = [];
        const navListItems = [];
        
        for (let i = 0; i < chaptersToExport.length; i++) {
            const ch = chaptersToExport[i];
            const id = `chap${i}`;
            const href = `text/${id}.xhtml`;
            const body = (ch.content || '').split(/\r?\n/).map(line => `<p>${escapeHtml(line)}</p>`).join('\n  ');
            const xhtml = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8" /><title>${escapeHtml(ch.title)}</title><link rel="stylesheet" type="text/css" href="../style.css" /></head><body><h2>${escapeHtml(ch.title)}</h2>${body}</body></html>`;
            oebps.file(href, xhtml);
            manifestItems.push({ id, href, type: 'application/xhtml+xml' });
            spineItems.push(id);
            navListItems.push(`<li><a href="${href}">${escapeHtml(ch.title)}</a></li>`);
            updateProgress(10 + (i / chaptersToExport.length) * 60, `Adding ${ch.title}`);
            await new Promise(r => setTimeout(r, 0));
        }

        manifestItems.push({ id: 'css', href: 'style.css', type: 'text/css' });
        if (coverHref && coverMediaType) {
            manifestItems.push({ id: 'cover', href: coverHref, type: coverMediaType, prop: 'cover-image' });
        }

        const navXhtml = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><title>Table of Contents</title></head><body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navListItems.join('\n      ')}</ol></nav></body></html>`;
        oebps.file('nav.xhtml', navXhtml);
        manifestItems.push({ id: 'nav', href: 'nav.xhtml', type: 'application/xhtml+xml', prop: 'nav' });

        const opf = `<?xml version="1.0" encoding="utf-8"?><package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier><dc:title>${escapeHtml(titleMeta)}</dc:title><dc:creator id="creator">${escapeHtml(authorMeta)}</dc:creator><dc:language>${lang}</dc:language><meta property="dcterms:modified">${modifiedDate}</meta>${coverHref ? '<meta name="cover" content="cover"/>' : ''}</metadata><manifest>${manifestItems.map(m => `<item id="${m.id}" href="${m.href}" media-type="${m.type}"${m.prop ? ` properties="${m.prop}"` : ''}/>`).join('\n    ')}</manifest><spine>${spineItems.map(id => `<itemref idref="${id}"/>`).join('\n    ')}</spine></package>`;
        oebps.file('package.opf', opf);

        updateProgress(95, 'Packaging EPUB…');
        const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadFile(blob, `${base}.epub`);
        updateProgress(100, 'Done');
        setTimeout(hideProgress, 500);
    }

    // =================================================================
    // EVENT HANDLERS
    // =================================================================
    async function handleFileInput(f) {
      if(!f){ setStatus('No file selected', 'error'); return; }
      if(!(f.type === 'text/plain' || /\.txt$/i.test(f.name))){
        setStatus('Please choose a .txt file.', 'error');
        return;
      }
      toggleAppSpinner(true);
      try{
        const buffer = await readFileAsArrayBuffer(f);
        state.fileContent = await decodeText(buffer, state.encoding);
        state.fileName = f.name || 'novel.txt';
        D.fileNameInfo.textContent = `Loaded: ${state.fileName}`;
        setStatus(`Loaded: ${state.fileName}`, 'success');
        D.processBtn.disabled = false;
        showMatchPreview();
      }catch(err){
        console.error(err);
        setStatus('Failed to read file.', 'error');
      } finally {
        toggleAppSpinner(false);
      }
    }

    async function handleCoverInput(f) {
      if(f){
        if(!String(f.type || '').startsWith('image/')){
          setStatus('Cover must be an image file.', 'error');
          state.coverFile = null;
          D.coverNameInfo.textContent = 'Or drag and drop image here';
          return;
        }
        state.coverFile = {
          name: f.name,
          type: f.type,
          content: await fileToBase64(f)
        };
        D.coverNameInfo.textContent = `Cover: ${state.coverFile.name}`;
        setStatus(`Cover loaded: ${state.coverFile.name}`, 'success');
      } else {
        state.coverFile = null;
        D.coverNameInfo.textContent = 'Or drag and drop image here';
      }
    }

    function onProcessBtnClick() {
      if(!state.fileContent){ setStatus('Select a .txt file first.', 'error'); return; }
      setStatus(`Processing…`);
      const result = splitChapters(state.fileContent);
      if (!result) return;
      
      state.chapters = result;
      state.selectedChapterId = state.chapters.length > 0 ? state.chapters[0].id : null;
      state.isDirty = false;
      
      saveState();
      showView('editor');
      selectChapter(state.selectedChapterId);
    }

    function onBackBtnClick() {
        if (state.isDirty) {
            if (!confirm('You have unsaved changes. Are you sure you want to go back? All edits will be lost.')) {
                return;
            }
        }
        window.location.hash = '#dashboard';
    }

    // Drag and drop for reordering
    let draggedItem = null;
    let dropIndicator = null;
    function setupDragDrop() {
        D.chapterList.addEventListener('dragstart', (e) => {
            draggedItem = e.target.closest('li');
        });
        D.chapterList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('li');
            if (target && target !== draggedItem) {
                document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
                const rect = target.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                dropIndicator = e.clientY < midpoint ? 'top' : 'bottom';
                target.classList.add(dropIndicator === 'top' ? 'drag-over-top' : 'drag-over-bottom');
            }
        });
        D.chapterList.addEventListener('dragleave', (e) => {
            e.target.closest('li')?.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        D.chapterList.addEventListener('drop', (e) => {
            e.preventDefault();
            document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
            const target = e.target.closest('li');
            if (target && draggedItem && target !== draggedItem) {
                const fromId = parseInt(draggedItem.dataset.id, 10);
                const toId = parseInt(target.dataset.id, 10);
                const fromIndex = state.chapters.findIndex(c => c.id === fromId);
                let toIndex = state.chapters.findIndex(c => c.id === toId);
                if (dropIndicator === 'bottom') toIndex++;
                
                const [movedItem] = state.chapters.splice(fromIndex, 1);
                state.chapters.splice(toIndex, 0, movedItem);
                
                saveState();
                renderEditor();
            }
            draggedItem = null;
            dropIndicator = null;
        });
    }
    
    // Final init logic for the module
    state = getInitialState();
    
    D.fileInput.addEventListener('change', (e) => handleFileInput(e.target.files?.[0]));
    D.coverInput.addEventListener('change', (e) => handleCoverInput(e.target.files?.[0]));
    setupDropZone(D.fileDropZone, D.fileInput, handleFileInput);
    setupDropZone(D.coverDropZone, D.coverInput, handleCoverInput);
    D.chapterPatternSelect.addEventListener('change', () => {
      state.chapterPattern = D.chapterPatternSelect.value;
      D.customRegexContainer.style.display = state.chapterPattern === 'custom' ? 'block' : 'none';
      showMatchPreview();
    });
    D.customRegexInput.addEventListener('input', () => {
      state.customRegex = D.customRegexInput.value;
      showMatchPreview();
    });
    D.encodingSelect.addEventListener('change', () => state.encoding = D.encodingSelect.value);
    D.metaTitle.addEventListener('input', () => state.meta.title = D.metaTitle.value);
    D.metaAuthor.addEventListener('input', () => state.meta.author = D.metaAuthor.value);
    D.epubTheme.addEventListener('change', () => state.meta.theme = D.epubTheme.value);
    D.addRuleBtn.addEventListener('click', () => {
      state.cleanupRules.push('');
      renderCleanupRule('');
    });
    D.processBtn.addEventListener('click', onProcessBtnClick);

    D.backBtn.addEventListener('click', onBackBtnClick);
    D.downloadZipBtn.addEventListener('click', () => { if (state.isDirty) saveCurrentChapter(); createZipDownload(state.chapters); });
    D.downloadEpubBtn.addEventListener('click', () => { if (state.isDirty) saveCurrentChapter(); createEpubDownload(state.chapters); });
    D.chapterList.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li) return;
      const id = parseInt(li.dataset.id, 10);
      if (isNaN(id)) return;

      if (e.target.tagName === 'BUTTON') {
          const index = state.chapters.findIndex(c => c.id === id);
          if (index === -1) return;
          const action = e.target.dataset.action;
          
          if (action === 'delete') {
              if (confirm(`Are you sure you want to delete "${state.chapters[index].title}"?`)) {
                  state.chapters.splice(index, 1);
                  if (id === state.selectedChapterId) selectChapter(null); else renderEditor();
                  saveState();
              }
          } else if (action === 'merge') {
              if (index > 0) {
                  const targetChapter = state.chapters[index-1];
                  targetChapter.content += '\n\n' + state.chapters[index].content;
                  state.chapters.splice(index, 1);
                  if (id === state.selectedChapterId) selectChapter(targetChapter.id); else renderEditor();
                  saveState();
              }
          }
      } else if (e.target.tagName !== 'INPUT') {
          selectChapter(id);
      }
    });
    setupDragDrop();
    D.chapterContent.addEventListener('input', () => { state.isDirty = true; D.saveChapterBtn.disabled = false; });
    D.saveChapterBtn.addEventListener('click', saveCurrentChapter);
    D.splitChapterBtn.addEventListener('click', () => {
      if (state.selectedChapterId === null) return;
      const splitPos = D.chapterContent.selectionStart;
      const index = state.chapters.findIndex(c => c.id === state.selectedChapterId);
      if (index === -1) return;

      const currentChapter = state.chapters[index];
      const part1 = currentChapter.content.substring(0, splitPos);
      const part2 = currentChapter.content.substring(splitPos);
      if (part2.trim() === '') { alert("Cannot split at the end of the chapter."); return; }

      currentChapter.content = part1;
      if (!/\(Part \d+\)$/i.test(currentChapter.title)) currentChapter.title += ' (Part 1)';
      
      const newId = Math.max(0, ...state.chapters.map(c => c.id)) + 1;
      const newChapter = {
          id: newId,
          title: `${currentChapter.title.replace(/\(Part \d+\)$/i, '')} (Part 2)`.trim(),
          content: part2
      };
      state.chapters.splice(index + 1, 0, newChapter);
      D.chapterContent.value = part1;
      state.isDirty = false;
      D.saveChapterBtn.disabled = true;
      saveState();
      renderEditor();
    });
    D.fullscreenBtn.addEventListener('click', () => {
      document.body.classList.toggle('fullscreen-editor');
      D.fullscreenBtn.textContent = document.body.classList.contains('fullscreen-editor') ? 'Exit Fullscreen' : 'Fullscreen';
    });
    D.replaceAllBtn.addEventListener('click', () => {
      const findText = D.findInput.value;
      if (!findText) return;
      const replaceText = D.replaceInput.value;
      const originalText = D.chapterContent.value;
      const newText = originalText.split(findText).join(replaceText);
      if (originalText !== newText) {
        D.chapterContent.value = newText;
        state.isDirty = true;
        D.saveChapterBtn.disabled = false;
      }
    });

    D.restoreSessionBtn.addEventListener('click', restoreSession);
    D.dismissSessionBtn.addEventListener('click', () => {
      clearStateAndStorage();
      D.restoreBanner.style.display = 'none';
    });
    window.addEventListener('beforeunload', (e) => {
        if (state.isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    checkForUnsavedSession();
    setupTooltips();
    function setupDropZone(zone, input, handler) {
        if (!zone || !input || !handler) return;
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('drag-over'); });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer?.files?.[0];
            if (file) {
                input.files = e.dataTransfer.files;
                handler(file);
            }
        });
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    }
}