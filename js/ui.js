import { COPY_LABELS } from './constants.js';

/**
 * @typedef {'success' | 'error' | 'warning' | 'info'} NotificationType
 * @typedef {'html' | 'rich'} CopyType
 * @typedef {'raw' | 'fixed' | null} PreviewStatus
 */

// ─── Notifications ──────────────────────────────────────────────────────────

const NOTIFICATION_COLORS = {
  success: 'bg-green-600',
  error:   'bg-red-600',
  warning: 'bg-yellow-600',
  info:    'bg-blue-600',
};

/**
 * Shows a temporary toast in the top-right corner that slides in and
 * auto-removes itself after 3 seconds.
 * @param {string} message
 * @param {NotificationType} type
 */
export const showNotification = (message, type = 'info') => {
  const el = document.createElement('div');
  el.className = [
    'fixed top-4 right-4 px-6 py-3 rounded-lg text-white font-medium z-50',
    'transform translate-x-full transition-transform duration-300',
    NOTIFICATION_COLORS[type] ?? NOTIFICATION_COLORS.info,
  ].join(' ');
  el.textContent = message;

  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transform = 'translateX(0)';
  });

  setTimeout(() => {
    el.style.transform = 'translateX(calc(100% + 1rem))';
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, 3000);
};

// ─── Loading state ──────────────────────────────────────────────────────────

/**
 * @param {{ fixButton: HTMLButtonElement; fixButtonText: HTMLElement; fixButtonLoader: HTMLElement }} els
 * @param {boolean} isLoading
 */
export const setLoadingState = ({ fixButton, fixButtonText, fixButtonLoader }, isLoading) => {
  fixButton.disabled = isLoading;
  fixButton.classList.toggle('loading', isLoading);
  fixButtonText.classList.toggle('hidden', isLoading);
  fixButtonLoader.classList.toggle('hidden', !isLoading);
};

// ─── Copy buttons ────────────────────────────────────────────────────────────

/**
 * @param {{ copyHtmlBtn: HTMLButtonElement; copyRichBtn: HTMLButtonElement }} els
 * @param {boolean} enabled
 */
export const setCopyButtonsEnabled = ({ copyHtmlBtn, copyRichBtn }, enabled) => {
  [copyHtmlBtn, copyRichBtn].forEach((btn) => {
    btn.disabled = !enabled;
    btn.classList.toggle('text-white/60', !enabled);
    btn.classList.toggle('text-white', enabled);
  });
};

/**
 * Briefly flashes a copy button with a success label, then restores it.
 * @param {HTMLButtonElement} button
 * @param {CopyType} type
 */
export const flashCopySuccess = (button, type) => {
  const { success, active } = COPY_LABELS[type];
  button.textContent = success;
  button.classList.add('bg-green-600');

  setTimeout(() => {
    button.textContent = active;
    button.classList.remove('bg-green-600');
  }, 2000);
};

// ─── Preview status badge ────────────────────────────────────────────────────

const PREVIEW_STATUS_CONFIG = {
  raw:   { label: '⚠ Raw Input',    classes: 'bg-yellow-500 text-white' },
  fixed: { label: '✓ Outlook-safe', classes: 'bg-green-600 text-white'  },
};

/**
 * Updates the small badge inside the Outlook fake header.
 * Pass null to hide it entirely.
 * @param {HTMLElement | null} el
 * @param {PreviewStatus} status
 */
export const setPreviewStatus = (el, status) => {
  if (!el) return;

  const cfg = status ? PREVIEW_STATUS_CONFIG[status] : null;

  if (!cfg) {
    el.textContent = '';
    el.className = 'hidden';
    return;
  }

  el.textContent = cfg.label;
  el.className = `text-xs px-2 py-0.5 rounded-full font-medium ${cfg.classes}`;
};

// ─── HTML indentation ────────────────────────────────────────────────────────

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Applies basic indentation to an HTML string for human-readable display.
 * @param {string} html
 * @returns {string}
 */
const formatHtml = (html) => {
  if (!html || !html.trim()) return html;

  let depth = 0;

  try {
    const formatted = html
      .replace(/>\s*</g, '>\n<')
      .split('\n')
      .map((raw) => raw.trim())
      .filter(Boolean)
      .map((line) => {
        const isClose     = /^<\/[a-z]/i.test(line);
        const tagMatch    = line.match(/^<([a-z][a-z0-9-]*)/i);
        const tag         = tagMatch ? tagMatch[1].toLowerCase() : null;
        const isSelfClose = /\/>$/.test(line) || (tag !== null && VOID_TAGS.has(tag));
        const isComment   = /^<!--/.test(line);

        if (isClose) depth = Math.max(0, depth - 1);
        const indented = '  '.repeat(depth) + line;
        if (tag && !isClose && !isSelfClose && !isComment) depth += 1;

        return indented;
      })
      .join('\n');

    return formatted.trim() ? formatted : html;
  } catch {
    return html;
  }
};

// ─── Syntax highlighting ─────────────────────────────────────────────────────

/**
 * Escapes HTML special characters so the browser renders the string as
 * plain text rather than interpreting it as markup.
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = (str) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Highlights attribute values inside an already-escaped tag attribute string.
 * @param {string} attrs
 * @returns {string}
 */
const highlightAttributes = (attrs) =>
  attrs
    .replace(
      /=&quot;((?:[^&]|&(?!quot;))*)?&quot;/g,
      '=<span class="token-value">&quot;$1&quot;</span>'
    )
    .replace(
      / ([a-zA-Z_:][\w.:$-]*)(?==)/g,
      ' <span class="token-attr">$1</span>'
    );

/**
 * Highlights a single escaped line of HTML code.
 * @param {string} line
 * @returns {string}
 */
const highlightLine = (line) => {
  const trimmed = line.trim();

  if (trimmed.startsWith('&lt;!--') && trimmed.includes('--&gt;')) {
    return line.replace(
      /(&lt;!--[\s\S]*?--&gt;)/,
      '<span class="token-comment">$1</span>'
    );
  }

  const tagPattern = /^(\s*)(&lt;)(\/?)([a-zA-Z][a-zA-Z0-9-]*)(.*?)(\/?)(&gt;)(\s*)$/;
  const tagMatch = line.match(tagPattern);

  if (!tagMatch) return line;

  const [, indent, open, slash, tagName, attrs, selfClose, close, trailing] = tagMatch;

  return [
    indent,
    open,
    slash,
    `<span class="token-tag">${tagName}</span>`,
    highlightAttributes(attrs),
    selfClose,
    close,
    trailing,
  ].join('');
};

/**
 * Applies syntax highlighting to an escaped, formatted HTML string.
 * @param {string} escaped
 * @returns {string}
 */
const highlightHtmlSyntax = (escaped) =>
  escaped.split('\n').map(highlightLine).join('\n');

/**
 * Full pipeline: indent → escape → highlight.
 * Returns safe HTML ready for innerHTML insertion into #code-output.
 * @param {string} html
 * @returns {string}
 */
const renderHighlightedCode = (html) => {
  if (!html || !html.trim()) return '';

  const formatted = formatHtml(html);
  const source    = formatted && formatted.trim() ? formatted : html;
  const escaped   = escapeHtml(source);

  return highlightHtmlSyntax(escaped);
};

// ─── Result display ──────────────────────────────────────────────────────────

/**
 * Writes content to both output panels simultaneously:
 *   - signaturePreview: innerHTML — renders the HTML visually
 *   - codeOutput: innerHTML — escaped + syntax-highlighted source code
 *
 * @param {{ signaturePreview: HTMLElement; codeOutput: HTMLElement }} els
 * @param {string} content
 */
export const displayResults = ({ signaturePreview, codeOutput }, content) => {
  signaturePreview.innerHTML = content;
  signaturePreview.classList.remove('empty:hidden');

  codeOutput.innerHTML = renderHighlightedCode(content);
};

/**
 * @param {{ signaturePreview: HTMLElement; codeOutput: HTMLElement }} els
 */
export const clearResults = ({ signaturePreview, codeOutput }) => {
  signaturePreview.innerHTML = '';
  signaturePreview.classList.add('empty:hidden');
  codeOutput.innerHTML = '';
};

// ─── Fix button ──────────────────────────────────────────────────────────────

/**
 * @param {HTMLButtonElement} fixButton
 * @param {boolean} hasContent
 */
export const updateFixButton = (fixButton, hasContent) => {
  fixButton.disabled = !hasContent;
  fixButton.classList.toggle('btn-glow', hasContent);
};
