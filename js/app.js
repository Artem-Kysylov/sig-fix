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
import { loginWithGoogle, logoutUser, refreshUserSession } from './auth.js';

// ─── Paddle v3 setup ─────────────────────────────────────────────────────────

// Функция надежной загрузки Paddle SDK
const loadPaddleSDK = () => {
  return new Promise((resolve, reject) => {
    if (typeof window.Paddle !== 'undefined') {
      resolve(window.Paddle);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.onload = () => resolve(window.Paddle);
    script.onerror = () => reject(new Error('Failed to load Paddle SDK.'));
    document.head.appendChild(script);
  });
};

// Главная функция инициализации
const initializePaymentSystem = async () => {
  try {
    await loadPaddleSDK();
    Paddle.Initialize({
      token: 'live_79cb52b9998500671a080604000',
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          handleCheckoutCompleted();
        }
      },
    });
    console.log('✅ Paddle Live Mode successfully initialized via dynamic import.');
  } catch (error) {
    console.error('❌ Paddle init error:', error);
  }
};

// Запускаем инициализацию при старте приложения
initializePaymentSystem();

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
  lifetimeAccessBtn:    null,
  proLifetimeBadge:     null,

  // Header auth
  headerUserMenu:       document.getElementById('header-user-menu'),
  headerUserAvatar:     document.getElementById('header-user-avatar'),
  headerSignOutBtn:     document.getElementById('header-sign-out'),
  headerSignInBtn:      document.getElementById('header-signin-btn'),
  headerUserBlock:      document.getElementById('header-user-block'),
  headerUserEmail:      document.getElementById('header-user-email'),
  headerLogoutBtn:      document.getElementById('header-logout-btn'),
  
  // Pricing buttons
  buyAnnualBtn:         document.getElementById('buy-annual-btn'),
  buyLifetimeBtn:       document.getElementById('buy-lifetime-btn'),
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

// ─── Export paywall ──────────────────────────────────────────────────────────

const showExportPaywallModal = () => {
  // Create modal HTML
  const modal = document.createElement('div');
  modal.className = 'limit-modal';
  modal.innerHTML = `
    <div class="limit-modal__backdrop"></div>
    <div class="limit-modal__content">
      <div class="limit-modal__icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2"/>
          <circle cx="12" cy="16" r="1"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h3 class="limit-modal__title">Your signature is ready!</h3>
      <p class="limit-modal__text">Unlock <strong>Lifetime Pro ($14)</strong> to copy the Outlook-safe HTML or Rich Text directly to your clipboard.</p>
      <div class="limit-modal__actions">
        <button class="limit-modal__btn limit-modal__btn--primary" id="modal-upgrade-btn">
          Unlock Pro ($14)
        </button>
        <button class="limit-modal__btn limit-modal__btn--secondary" id="modal-close-btn">
          Maybe Later
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners
  const upgradeBtn = modal.querySelector('#modal-upgrade-btn');
  const closeBtn = modal.querySelector('#modal-close-btn');
  const backdrop = modal.querySelector('.limit-modal__backdrop');
  
  const closeModal = () => {
    modal.classList.add('limit-modal--closing');
    setTimeout(() => {
      if (modal.parentNode) {
        document.body.removeChild(modal);
      }
    }, 300);
  };
  
  upgradeBtn.addEventListener('click', () => {
    initiateUpgradeFlow();
    closeModal();
  });
  closeBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Animate in
  setTimeout(() => {
    modal.classList.add('limit-modal--show');
  }, 10);
};

const initiateUpgradeFlow = async (priceId = 'pri_01kttyhjhn7z90jmbt2mxyhyxr') => {
  let user = window.user;

  if (!user) {
    try {
      user = await loginWithGoogle();
    } catch (error) {
      console.error('Google sign-in failed:', error);
      showNotification('Sign-in was cancelled or failed', 'error');
      return;
    }
  }

  openPaddleCheckout(priceId, user);
};

const updateCopyButtonsUI = () => {
  const { copyHtmlBtn, copyRichBtn } = els;
  if (!copyHtmlBtn || !copyRichBtn) return;

  const isProUser = window.user?.isPro === true;

  if (isProUser) {
    copyHtmlBtn.innerHTML = 'Copy Outlook-Safe Code';
    copyRichBtn.innerHTML = 'Copy Rich Text';
  } else {
    copyHtmlBtn.innerHTML = '🔒 Copy Outlook-Safe Code [PRO]';
    copyRichBtn.innerHTML = '🔒 Copy Rich Text [PRO]';
  }
};

const updateAuthUI = (user) => {
  const { headerSignInBtn, headerUserBlock, headerUserEmail } = els;
  const pricingRestoreLinks = document.querySelectorAll('.pricing-restore-link');

  if (user) {
    if (headerSignInBtn) headerSignInBtn.style.display = 'none';
    if (headerUserBlock) headerUserBlock.style.display = 'flex';
    if (headerUserEmail) headerUserEmail.textContent = user.email;
    pricingRestoreLinks.forEach((el) => { el.style.display = 'none'; });
  } else {
    if (headerSignInBtn) headerSignInBtn.style.display = 'inline-block';
    if (headerUserBlock) headerUserBlock.style.display = 'none';
    pricingRestoreLinks.forEach((el) => { el.style.display = 'block'; });
  }
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
  // Check Pro status - paywall for export
  const isProUser = window.user?.isPro === true;

  if (!isProUser) {
    showExportPaywallModal();
    return;
  }

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

const applyProAccess = (user) => {
  if (!user) return;
  window.user = { ...user, isPro: true };
  document.dispatchEvent(new CustomEvent('authChanged', { detail: window.user }));
};

const handleCheckoutCompleted = async () => {
  if (window.user) {
    applyProAccess(window.user);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const user = await refreshUserSession();
      if (user?.isPro) {
        showNotification('Welcome to Pro! Lifetime access activated.', 'success');
        return;
      }
    } catch (error) {
      console.error('Failed to refresh user after checkout:', error);
    }

    await delay(1000);
  }

  if (window.user && !window.user.isPro) {
    applyProAccess(window.user);
  }

  showNotification('Welcome to Pro! Lifetime access activated.', 'success');
};

// ─── Pro pricing UI ──────────────────────────────────────────────────────────

const PRO_BTN_ACTIVE_TEXT = 'Pro lifetime activated';
const PRO_BTN_DEFAULT_TEXT = 'Get Lifetime Access';

const updateProPricingUI = (user) => {
  const lifetimeBtn = els.buyLifetimeBtn;
  const annualBtn = els.buyAnnualBtn;
  const badge = els.proLifetimeBadge;

  const isPro = user?.isPro === true;

  if (lifetimeBtn) {
    lifetimeBtn.textContent = isPro ? PRO_BTN_ACTIVE_TEXT : 'Get Lifetime Access';
    lifetimeBtn.disabled = isPro;
    lifetimeBtn.classList.toggle('lp-pricing-cta--activated', isPro);
    lifetimeBtn.setAttribute('aria-disabled', isPro ? 'true' : 'false');
  }

  if (annualBtn) {
    annualBtn.textContent = isPro ? PRO_BTN_ACTIVE_TEXT : 'Get Annual Access';
    annualBtn.disabled = isPro;
    annualBtn.classList.toggle('lp-pricing-cta--activated', isPro);
    annualBtn.setAttribute('aria-disabled', isPro ? 'true' : 'false');
  }

  if (badge) {
    badge.classList.toggle('hidden', !isPro);
    badge.setAttribute('aria-hidden', isPro ? 'false' : 'true');
  }
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

// ─── Paddle checkout ─────────────────────────────────────────────────────────

const openPaddleCheckout = (priceId, user = window.user) => {
  if (typeof window.Paddle === 'undefined') {
    console.error('Cannot open checkout: Paddle SDK is not fully loaded yet.');
    showNotification('Payment system is still loading. Please try again in a moment.', 'warning');
    return;
  }

  if (!user?.email) {
    showNotification('Please sign in to continue', 'warning');
    return;
  }

  if (!priceId) {
    console.error('Cannot open checkout: priceId is required.');
    showNotification('Invalid pricing configuration. Please try again.', 'error');
    return;
  }

  try {
    Paddle.Checkout.open({
      items: [{ priceId: priceId, quantity: 1 }],
      customer: { email: user.email },
      customData: { firebaseUID: user.uid },
      settings: {
        displayMode: 'overlay',
        theme: 'dark',
        locale: 'en',
      },
    });
  } catch (error) {
    console.error('Paddle checkout failed:', error);
    showNotification('Failed to open checkout. Please try again.', 'error');
  }
};

// ─── Pricing CTA — Google auth gate ─────────────────────────────────────────

const handleLifetimeAccessClick = async () => {
  const btn = els.lifetimeAccessBtn;
  if (!btn || window.user?.isPro) return;

  const originalText = btn.textContent;
  let user = window.user;

  if (!user) {
    btn.textContent = 'Connecting...';
    btn.disabled = true;
    try {
      user = await loginWithGoogle();
    } catch (error) {
      console.error('Google sign-in failed:', error);
      showNotification('Sign-in was cancelled or failed', 'error');
      return;
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  btn.textContent = 'Opening...';
  btn.disabled = true;
  try {
    openPaddleCheckout(user);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
};

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const init = () => {
  els.proLifetimeBadge = document.getElementById('pro-lifetime-badge');
  els.headerSignInBtn = document.getElementById('header-signin-btn');
  els.headerUserBlock = document.getElementById('header-user-block');
  els.headerUserEmail = document.getElementById('header-user-email');
  els.headerLogoutBtn = document.getElementById('header-logout-btn');
  els.buyAnnualBtn = document.getElementById('buy-annual-btn');
  els.buyLifetimeBtn = document.getElementById('buy-lifetime-btn');

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

  // Pricing CTAs
  els.buyAnnualBtn?.addEventListener('click', async () => {
    await initiateUpgradeFlow('pri_01kttye192bysjn01nhstb55r5'); // Annual Pro
  });

  els.buyLifetimeBtn?.addEventListener('click', async () => {
    await initiateUpgradeFlow('pri_01kttyhjhn7z90jmbt2mxyhyxr'); // Lifetime Pro
  });

  // Auth event handlers
  els.headerSignInBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error('Header sign-in failed:', error);
      showNotification('Sign-in was cancelled or failed', 'error');
    }
  });

  els.headerLogoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await logoutUser();
    } catch (error) {
      console.error('Sign out failed:', error);
      showNotification('Failed to sign out', 'error');
    }
  });

  document.querySelectorAll('.pricing-signin-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await loginWithGoogle();
      } catch (error) {
        console.error('Pricing sign-in failed:', error);
        showNotification('Sign-in was cancelled or failed', 'error');
      }
    });
  });

  // Header auth + Pro pricing + Copy buttons + Auth UI
  els.headerSignOutBtn?.addEventListener('click', handleSignOut);
  document.addEventListener('authChanged', (e) => {
    updateHeaderAuth(e.detail);
    updateProPricingUI(e.detail);
    updateCopyButtonsUI();
    updateAuthUI(e.detail);
  });
  updateHeaderAuth(window.user);
  updateProPricingUI(window.user);
  updateCopyButtonsUI();
  updateAuthUI(window.user);

  setupDragAndDrop();
  setupFileInput();
  setupKeyboardShortcuts();
  setupMobileHandlers();
};

document.addEventListener('DOMContentLoaded', init);
