import { getState, setState } from './state.js';
import { DROPZONE_TEXTS, DEMO_TEMPLATES, MODE_TAB_POSITIONS } from './constants.js';
import { processContent } from './processors.js';
import {
  showNotification,
  setLoadingState,
  setCopyButtonsEnabled,
  displayResults,
  clearResults,
  updateFixButton,
  flashCopySuccess,
  setPreviewStatus,
} from './ui.js';
import { loginWithGoogle, logoutUser } from './auth.js';

// ─── DOM element references ─────────────────────────────────────────────────

const els = {
  // Mode tabs (left panel)
  tabIndicator:     document.getElementById('tab-indicator'),
  tabAI:            document.getElementById('tab-ai'),
  tabCleaner:       document.getElementById('tab-cleaner'),
  tabExtractor:     document.getElementById('tab-extractor'),

  // Input area
  dropzone:         document.getElementById('dropzone'),
  dropzoneTitle:    document.getElementById('dropzone-title'),
  dropzoneSubtitle: document.getElementById('dropzone-subtitle'),
  loadTemplateBtn:  document.getElementById('load-template'),
  inputText:        document.getElementById('input-text'),

  // Action button
  fixButton:        document.getElementById('fix-signature'),
  fixButtonText:    document.getElementById('fix-button-text'),
  fixButtonLoader:  document.getElementById('fix-button-loader'),

  // Output tabs (right panel)
  previewTab:       document.getElementById('preview-tab'),
  codeTab:          document.getElementById('code-tab'),
  outlookPreview:   document.getElementById('outlook-preview'),
  codePreview:      document.getElementById('code-preview'),
  signaturePreview: document.getElementById('signature-preview'),
  codeOutput:       document.getElementById('code-output'),

  // Status badge inside fake Outlook header
  previewStatus:    document.getElementById('preview-status'),

  // Copy buttons
  copyHtmlBtn:          document.getElementById('copy-html'),
  copyRichBtn:          document.getElementById('copy-rich'),

  // Pricing CTA
  lifetimeAccessBtn:    document.getElementById('lifetime-access-btn'),

  // Header auth
  headerUserMenu:       document.getElementById('header-user-menu'),
  headerUserAvatar:     document.getElementById('header-user-avatar'),
  headerSignOutBtn:     document.getElementById('header-sign-out'),
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Processing cancellation token ──────────────────────────────────────────
//
// Each call to processSignature mints a new token by incrementing this
// counter. Switching modes or starting a new run also bumps the counter.
// Every async checkpoint inside processSignature compares its captured
// token to the current value; a mismatch means the result is stale and
// all DOM side-effects are silently dropped.

let activeToken = 0;

const cancelInflightProcessing = () => {
  activeToken += 1;
};

// ─── Mode switching ──────────────────────────────────────────────────────────

const applyModeTab = (mode) => {
  const position = MODE_TAB_POSITIONS[mode];
  els.tabIndicator.style.transform = `translateX(${position * 100}%)`;

  [els.tabAI, els.tabCleaner, els.tabExtractor].forEach((tab) => {
    tab.classList.remove('text-white');
    tab.classList.add('text-white/60');
  });

  const activeTab = document.getElementById(`tab-${mode}`);
  activeTab.classList.remove('text-white/60');
  activeTab.classList.add('text-white');
};

const applyDropzoneText = (mode) => {
  const { title, subtitle, button } = DROPZONE_TEXTS[mode];
  els.dropzoneTitle.textContent    = title;
  els.dropzoneSubtitle.textContent = subtitle;
  els.loadTemplateBtn.textContent  = button;
};

/**
 * Hard-resets the entire workspace to a blank state for the new mode.
 * Cancels any in-flight async processing so its result cannot leak
 * into the new mode's UI.
 */
const switchMode = (mode) => {
  // Cancel any in-flight processSignature before touching the DOM —
  // the token check in the async function will drop stale results.
  cancelInflightProcessing();

  // Update state atomically before any DOM work.
  setState({ currentMode: mode, hasContent: false, processedContent: '' });

  applyModeTab(mode);
  applyDropzoneText(mode);

  // Reset left panel
  els.inputText.value = '';
  showDropzone();

  // Reset right panel — also ensure the loader is off in case a previous
  // run was mid-animation when the mode was switched.
  setLoadingState(els, false);
  clearResults(els);
  setCopyButtonsEnabled(els, false);
  setPreviewStatus(els.previewStatus, null);
  updateFixButton(els.fixButton, false);
};

// ─── Output tab switching ────────────────────────────────────────────────────

const switchOutputTab = (tab) => {
  setState({ currentTab: tab });

  [els.previewTab, els.codeTab].forEach((tabEl) => {
    tabEl.classList.remove('text-white', 'border-outlook-blue');
    tabEl.classList.add('text-white/60', 'border-transparent');
  });

  const activeTabEl = tab === 'preview' ? els.previewTab : els.codeTab;
  activeTabEl.classList.remove('text-white/60', 'border-transparent');
  activeTabEl.classList.add('text-white', 'border-outlook-blue');

  els.outlookPreview.classList.toggle('hidden', tab !== 'preview');
  els.codePreview.classList.toggle('hidden', tab !== 'code');
};

// ─── Dropzone visibility ─────────────────────────────────────────────────────

const hideDropzone = () => {
  els.dropzone.classList.add('hidden');
  els.inputText.classList.remove('hidden');
};

const showDropzone = () => {
  els.dropzone.classList.remove('hidden');
  els.inputText.classList.add('hidden');
};

// ─── Input handling ──────────────────────────────────────────────────────────

const onInputChange = () => {
  const hasContent = els.inputText.value.trim().length > 0;
  setState({ hasContent });
  if (hasContent) hideDropzone();
  updateFixButton(els.fixButton, hasContent);
};

const onInputBlur = () => {
  if (!getState().hasContent) showDropzone();
};

// ─── Template loading ────────────────────────────────────────────────────────

/**
 * Loads the mode-specific demo template and renders the raw (broken) preview
 * so the user can see what the processor will fix.
 */
const loadTestTemplate = () => {
  const { currentMode } = getState();
  const template = DEMO_TEMPLATES[currentMode];

  els.inputText.value = template;
  onInputChange();

  displayResults(els, template);
  setPreviewStatus(els.previewStatus, 'raw');
};

// ─── File handling (drag & drop + hidden <input>) ────────────────────────────

const readHtmlFile = async (file) => {
  if (file.type !== 'text/html' && !file.name.endsWith('.html')) {
    showNotification('Please drop an HTML file', 'warning');
    return;
  }
  try {
    els.inputText.value = await file.text();
    onInputChange();
  } catch {
    showNotification('Error reading file', 'error');
  }
};

const setupDragAndDrop = () => {
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((event) => {
    els.dropzone.addEventListener(event, stop);
    document.body.addEventListener(event, stop);
  });

  ['dragenter', 'dragover'].forEach((event) =>
    els.dropzone.addEventListener(event, () => els.dropzone.classList.add('drag-over'))
  );

  ['dragleave', 'drop'].forEach((event) =>
    els.dropzone.addEventListener(event, () => els.dropzone.classList.remove('drag-over'))
  );

  els.dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) readHtmlFile(file);
  });
};

const setupFileInput = () => {
  const fileInput = document.createElement('input');
  fileInput.type          = 'file';
  fileInput.accept        = '.html,text/html';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) readHtmlFile(file);
  });
};

// ─── Signature processing ────────────────────────────────────────────────────

/**
 * Runs the active processor and updates both output panels.
 *
 * Uses a cancellation token so that if the user switches modes or triggers
 * a second run while this one is still in the async delay / processor
 * phase, the stale result is discarded and no DOM mutation happens.
 */
const processSignature = async () => {
  const { hasContent, currentMode } = getState();

  if (!hasContent) {
    showNotification('Please add some content first', 'warning');
    return;
  }

  // Mint a new token — this automatically cancels any prior in-flight run.
  const token = ++activeToken;

  clearResults(els);
  setCopyButtonsEnabled(els, false);
  setPreviewStatus(els.previewStatus, null);
  setLoadingState(els, true);

  try {
    await delay(500);

    // Check whether a mode switch or a second click invalidated this run.
    if (token !== activeToken) return;

    const input  = els.inputText.value.trim();
    const result = await processContent(currentMode, input);

    // Check again after the (potentially slow) processor returns.
    if (token !== activeToken) return;

    setState({ processedContent: result });
    displayResults(els, result);
    setCopyButtonsEnabled(els, true);
    setPreviewStatus(els.previewStatus, 'fixed');
    showNotification('Signature processed successfully!', 'success');
  } catch (error) {
    if (token !== activeToken) return;
    console.error('Processing error:', error);
    showNotification('Error processing signature', 'error');
  } finally {
    // Only hide the loader if this token is still the active one.
    // If the mode switched mid-run, switchMode already called
    // setLoadingState(els, false), so we must not touch it here.
    if (token === activeToken) {
      setLoadingState(els, false);
    }
  }
};

// ─── Clipboard ───────────────────────────────────────────────────────────────

/**
 * html  — copies the processed HTML as a raw string for pasting into
 *         Outlook's HTML source editor or a code editor.
 *
 * rich  — uses the Clipboard API with the text/html MIME type so the content
 *         can be pasted directly into email client signature settings as
 *         rich text, preserving formatting, links, and embedded images.
 */
const copyToClipboard = async (type) => {
  const { processedContent } = getState();

  if (!processedContent) {
    showNotification('Nothing to copy', 'warning');
    return;
  }

  try {
    if (type === 'html') {
      await navigator.clipboard.writeText(processedContent);
    } else {
      const blob = new Blob([processedContent], { type: 'text/html' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })]);
    }

    const button = type === 'html' ? els.copyHtmlBtn : els.copyRichBtn;
    flashCopySuccess(button, type);
  } catch (error) {
    console.error('Copy failed:', error);
    showNotification('Copy failed. Please select and copy manually.', 'error');
  }
};

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────

const setupKeyboardShortcuts = () => {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (getState().hasContent) processSignature();
    }
  });
};

// ─── Mobile: prevent double-tap zoom ────────────────────────────────────────

const setupMobileHandlers = () => {
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
};

// ─── Header auth UI ──────────────────────────────────────────────────────────

const updateHeaderAuth = (user) => {
  const { headerUserMenu, headerUserAvatar } = els;
  if (!headerUserMenu || !headerUserAvatar) return;

  if (user) {
    headerUserAvatar.src = user.photoURL ?? '';
    headerUserAvatar.alt = user.displayName ?? user.email ?? 'User avatar';
    headerUserMenu.classList.remove('hidden');
    headerUserMenu.setAttribute('aria-hidden', 'false');
    return;
  }

  headerUserAvatar.src = '';
  headerUserAvatar.alt = '';
  headerUserMenu.classList.add('hidden');
  headerUserMenu.setAttribute('aria-hidden', 'true');
};

const handleSignOut = async () => {
  try {
    await logoutUser();
  } catch (error) {
    console.error('Sign out failed:', error);
    showNotification('Failed to sign out', 'error');
  }
};

// ─── Pricing CTA — Google auth gate ─────────────────────────────────────────

const handleLifetimeAccessClick = async (e) => {
  e.preventDefault();

  if (!window.user) {
    const btn = els.lifetimeAccessBtn;
    const originalText = btn.textContent;
    btn.textContent = 'Connecting...';

    try {
      const loggedUser = await loginWithGoogle();
      btn.textContent = originalText;
      alert(`Authenticated as ${loggedUser.email}. Next step: Paddle Checkout!`);
    } catch {
      btn.textContent = originalText;
    }
  } else {
    alert(`Already authenticated as ${window.user.email}. Triggering Paddle...`);
  }
};

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const init = () => {
  // Left panel: mode tabs
  els.tabAI.addEventListener('click',        () => switchMode('ai'));
  els.tabCleaner.addEventListener('click',   () => switchMode('cleaner'));
  els.tabExtractor.addEventListener('click', () => switchMode('extractor'));

  // Right panel: output tabs
  els.previewTab.addEventListener('click', () => switchOutputTab('preview'));
  els.codeTab.addEventListener('click',    () => switchOutputTab('code'));

  // Input area
  els.inputText.addEventListener('input', onInputChange);
  els.inputText.addEventListener('focus', hideDropzone);
  els.inputText.addEventListener('blur',  onInputBlur);

  els.loadTemplateBtn.addEventListener('click', loadTestTemplate);

  els.dropzone.addEventListener('click', () => {
    hideDropzone();
    els.inputText.focus();
  });

  // Action + copy
  els.fixButton.addEventListener('click',    processSignature);
  els.copyHtmlBtn.addEventListener('click', () => copyToClipboard('html'));
  els.copyRichBtn.addEventListener('click', () => copyToClipboard('rich'));

  // Pricing CTA
  els.lifetimeAccessBtn?.addEventListener('click', handleLifetimeAccessClick);

  // Header auth
  els.headerSignOutBtn?.addEventListener('click', handleSignOut);
  document.addEventListener('authChanged', (e) => updateHeaderAuth(e.detail));
  updateHeaderAuth(window.user);

  setupDragAndDrop();
  setupFileInput();
  setupKeyboardShortcuts();
  setupMobileHandlers();
};

document.addEventListener('DOMContentLoaded', init);
