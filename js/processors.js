// ─── CSS parsing utilities ─────────────────────────────────────────────────

/**
 * Parse a declarations block ("color: red; font-size: 14px") into an object.
 * @param {string} str
 * @returns {Record<string, string>}
 */
const parseDeclarations = (str) => {
  const result = {};
  str.split(';').forEach((decl) => {
    const colon = decl.indexOf(':');
    if (colon === -1) return;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const val  = decl.slice(colon + 1).trim();
    if (prop) result[prop] = val;
  });
  return result;
};

/**
 * Serialize a declarations object back to a CSS string.
 * @param {Record<string, string>} map
 * @returns {string}
 */
const serializeDeclarations = (map) =>
  Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([p, v]) => `${p}: ${v}`)
    .join('; ');

/** @param {Element} el @returns {Record<string, string>} */
const getStyleMap = (el) => parseDeclarations(el.getAttribute('style') || '');

/** @param {Element} el @param {Record<string, string>} map */
const setStyleMap = (el, map) => {
  const css = serializeDeclarations(map);
  if (css) el.setAttribute('style', css);
  else     el.removeAttribute('style');
};

/**
 * Parse a raw CSS string into an array of {selector, declarations} rules.
 * Skips pseudo-classes, @-rules, and comment blocks.
 * @param {string} cssText
 * @returns {Array<{selector: string, declarations: string}>}
 */
const parseCssRules = (cssText) => {
  const rules = [];

  const stripped = cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@[a-z][^{;]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/@[^;]+;/g, '');

  const rulePattern = /([^{}@]+)\{([^{}]*)\}/g;
  let match;
  while ((match = rulePattern.exec(stripped)) !== null) {
    const declarations = match[2].trim();
    if (!declarations) continue;
    match[1].split(',').forEach((rawSel) => {
      const selector = rawSel.trim();
      if (selector && !selector.includes(':') && !selector.startsWith('@')) {
        rules.push({ selector, declarations });
      }
    });
  }

  return rules;
};

// ─── Step 1: Inline <style> rules into style="" attributes ────────────────

/**
 * Finds every <style> element in the document, parses its CSS rules, and
 * applies matching declarations directly to matched elements as inline styles.
 * Existing inline declarations always win over stylesheet rules.
 * Removes all <style> elements after inlining.
 * @param {Document} doc
 */
const inlineCssFromStyleTags = (doc) => {
  const styleEls = Array.from(doc.querySelectorAll('style'));
  if (!styleEls.length) return;

  const allRules = styleEls.flatMap((el) => parseCssRules(el.textContent || ''));

  allRules.forEach(({ selector, declarations }) => {
    let targets;
    try {
      targets = Array.from(doc.querySelectorAll(selector));
    } catch {
      return;
    }
    targets.forEach((el) => {
      const fromSheet = parseDeclarations(declarations);
      const fromAttr  = getStyleMap(el);
      setStyleMap(el, { ...fromSheet, ...fromAttr });
    });
  });

  styleEls.forEach((el) => el.remove());
};

// ─── Step 2: Convert flex containers to <table> layouts ───────────────────

const FLEX_ONLY_PROPS = new Set([
  'display', 'flex-direction', 'flex-wrap',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis',
  'gap', 'row-gap', 'column-gap',
  'align-items', 'align-content', 'align-self',
  'justify-content', 'justify-items', 'justify-self',
  'place-items', 'place-content', 'order',
]);

/** @param {string|undefined} val @returns {number} */
const parsePx = (val) => {
  const n = parseInt(val || '0', 10);
  return isNaN(n) ? 0 : n;
};

/**
 * Converts a single flex row container into a <table><tr><td> structure.
 * Column-direction flex is left for removeUnsupportedProperties to handle.
 * @param {Element} flexEl
 */
const convertFlexElement = (flexEl) => {
  const style     = getStyleMap(flexEl);
  const direction = (style['flex-direction'] || 'row').trim();

  if (direction !== 'row') return;

  const children = Array.from(flexEl.children);
  if (!children.length) return;

  const doc    = flexEl.ownerDocument;
  const gap    = parsePx(style['gap'] || style['column-gap']);
  const align  = style['align-items'] || 'center';
  const valign = { 'flex-start': 'top', center: 'middle', 'flex-end': 'bottom' }[align] ?? 'middle';

  const table = doc.createElement('table');
  table.setAttribute('cellpadding', '0');
  table.setAttribute('cellspacing', '0');
  table.setAttribute('border', '0');
  table.setAttribute('role', 'presentation');

  const containerStyles = Object.fromEntries(
    Object.entries(style).filter(([k]) => !FLEX_ONLY_PROPS.has(k))
  );
  if (Object.keys(containerStyles).length) {
    table.setAttribute('style', serializeDeclarations(containerStyles));
  }

  const tr = doc.createElement('tr');

  children.forEach((child, idx) => {
    const td = doc.createElement('td');
    td.setAttribute('valign', valign);

    const childStyle = getStyleMap(child);
    const explicitW  = parsePx(childStyle['width']);
    if (explicitW) td.setAttribute('width', String(explicitW));

    if (gap > 0 && idx < children.length - 1) {
      setStyleMap(td, { 'padding-right': `${gap}px` });
    }

    td.appendChild(child);
    tr.appendChild(td);
  });

  const tbody = doc.createElement('tbody');
  tbody.appendChild(tr);
  table.appendChild(tbody);

  flexEl.replaceWith(table);
};

/**
 * Converts all flex row containers in the document to tables.
 * Uses reverse document order so innermost elements are processed first,
 * which correctly handles nested flex layouts in a single pass.
 * @param {Document} doc
 */
const convertAllFlexToTables = (doc) => {
  Array.from(doc.querySelectorAll('[style]'))
    .filter((el) => /display\s*:\s*flex/.test(el.getAttribute('style') || ''))
    .reverse()
    .forEach(convertFlexElement);
};

// ─── Step 3: Fix <img> — add required HTML attributes, remove unsupported ──

/**
 * Ensures every image has explicit width/height attributes (required for
 * stable rendering in Outlook), sets border="0" to prevent IE borders,
 * and removes CSS properties Outlook cannot render on images.
 * @param {Document} doc
 */
const fixImages = (doc) => {
  doc.querySelectorAll('img').forEach((img) => {
    const style = getStyleMap(img);

    const w = parsePx(style['width']);
    const h = parsePx(style['height']);
    if (w && !img.getAttribute('width'))  img.setAttribute('width',  String(w));
    if (h && !img.getAttribute('height')) img.setAttribute('height', String(h));

    img.setAttribute('border', '0');

    delete style['border-radius'];
    delete style['object-fit'];
    delete style['object-position'];
    style['display'] = 'block';

    setStyleMap(img, style);
  });
};

// ─── Step 4: Remove/replace CSS properties Outlook does not support ────────

const OUTLOOK_UNSUPPORTED_PROPS = new Set([
  'border-radius', 'box-shadow', 'text-shadow',
  'gap', 'row-gap', 'column-gap',
  'flex-direction', 'flex-wrap', 'flex',
  'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-self', 'align-content',
  'justify-content', 'justify-items', 'justify-self',
  'grid', 'grid-template-columns', 'grid-template-rows',
  'grid-column', 'grid-row', 'grid-area',
  'object-fit', 'object-position',
  'transition', 'animation', 'transform', 'filter',
  'max-height', 'min-height', 'min-width',
  'pointer-events', 'cursor', 'user-select',
  'backdrop-filter',
]);

/**
 * Walks every styled element and:
 * - converts remaining display:flex to display:block
 * - promotes max-width → width when no width is set
 * - replaces margin:auto centering with the align attribute
 * - removes all properties in OUTLOOK_UNSUPPORTED_PROPS
 * @param {Document} doc
 */
const removeUnsupportedProperties = (doc) => {
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = getStyleMap(el);

    if (style['display'] === 'flex') {
      style['display'] = 'block';
    }

    if (style['max-width'] && !style['width']) {
      style['width'] = style['max-width'];
    }
    delete style['max-width'];
    delete style['min-width'];

    const margin = (style['margin'] || '').trim();
    if (margin === 'auto' || margin === '0 auto' || /^0\s+auto$/.test(margin)) {
      delete style['margin'];
      const tag = el.tagName.toLowerCase();
      if (['table', 'div', 'p'].includes(tag)) {
        el.setAttribute('align', 'center');
      }
    }

    OUTLOOK_UNSUPPORTED_PROPS.forEach((prop) => delete style[prop]);

    setStyleMap(el, style);
  });
};

// ─── Step 5: Serialize to Outlook-safe HTML string ─────────────────────────

/**
 * Serializes the document body to a clean HTML string wrapped in MSO
 * conditional comments, which instruct Outlook to use the table-based
 * layout instead of its own rendering quirks.
 * @param {Document} doc
 * @returns {string}
 */
const serializeSignature = (doc) => {
  Array.from(doc.body.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE && !n.textContent.trim())
    .forEach((n) => n.remove());

  const inner = doc.body.innerHTML.trim();

  return [
    '<!--[if mso]><table role="presentation" cellspacing="0" cellpadding="0" border="0" align="left"><tr><td><![endif]-->',
    inner,
    '<!--[if mso]></td></tr></table><![endif]-->',
  ].join('\n');
};

// ─── Public processor functions ────────────────────────────────────────────

/**
 * Full AI Transpiler pipeline:
 * 1. Parse content into a DOM tree
 * 2. Inline all <style> CSS into style attributes
 * 3. Convert flex row layouts to <table> structures
 * 4. Fix image attributes for Outlook rendering
 * 5. Remove/replace unsupported CSS properties
 * 6. Serialize with MSO conditional wrappers
 *
 * @param {string} content Raw HTML (may contain <style>, flexbox, border-radius etc.)
 * @returns {Promise<string>} Outlook-safe HTML
 */
export const runAiTranspiler = async (content) => {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(content, 'text/html');

  inlineCssFromStyleTags(doc);
  convertAllFlexToTables(doc);
  fixImages(doc);
  removeUnsupportedProperties(doc);

  return serializeSignature(doc);
};

/**
 * Outlook Cleaner: takes table-based HTML that uses forbidden CSS properties
 * and makes it Outlook-safe.
 *
 * Regex pass first (fast, literal replacements):
 *   - max-width: Xunit → width: Xunit
 *   - box-shadow: ... → (removed)
 *   - border-radius: ... → (removed)
 *
 * DOM pass second (structural fixes):
 *   - margin: 0 auto on tables → align="center" attribute
 *   - any remaining unsupported properties
 *
 * @param {string} content Table-based HTML with forbidden CSS properties
 * @returns {Promise<string>} Cleaned Outlook-safe HTML
 */
export const runOutlookCleaner = async (content) => {
  let cleaned = content;

  // Regex pass — literal CSS property replacements inside style attributes
  cleaned = cleaned.replace(/max-width\s*:\s*([^;!"]+)/gi, 'width: $1');
  cleaned = cleaned.replace(/min-width\s*:[^;!"']*/gi, '');
  cleaned = cleaned.replace(/box-shadow\s*:[^;!"']*/gi, '');
  cleaned = cleaned.replace(/border-radius\s*:[^;!"']*/gi, '');
  cleaned = cleaned.replace(/text-shadow\s*:[^;!"']*/gi, '');

  // DOM pass — handle structural fixes that regex can't safely do inline
  const parser = new DOMParser();
  const doc    = parser.parseFromString(cleaned, 'text/html');

  fixImages(doc);
  removeUnsupportedProperties(doc);

  return serializeSignature(doc);
};

const SIGNATURE_BOUNDARY_PATTERNS = [
  /^--\s*$/,
  /^с уважением[,.]?\s*$/i,
  /^с уважением$/i,
  /^best regards[,.]?\s*$/i,
  /^kind regards[,.]?\s*$/i,
  /^sincerely[,.]?\s*$/i,
  /^cheers[,.]?\s*$/i,
  /^thanks[,.]?\s*$/i,
  /^thank you[,.]?\s*$/i,
  /^regards[,.]?\s*$/i,
  /^best[,.]?\s*$/i,
];

const SIGNATURE_DISCARD_PATTERNS = [
  /^(from|to|cc|bcc|subject|sent|date|отправитель|кому|тема):\s/i,
  /^[_\-=*]{4,}$/,
  /^this (email|message) (is|and)/i,
  /^if you (have received|are not)/i,
  /^данное письмо/i,
];

/**
 * Signature Extractor: finds the signature block within a raw email body
 * by detecting common closing phrases, strips noise (headers, separators,
 * legal disclaimers), then wraps plain-text lines in styled <p> tags.
 * If the extracted block already contains HTML, returns it as-is.
 *
 * @param {string} rawEmail Full email text (may include headers, body, signature)
 * @returns {Promise<string>} Extracted signature as HTML
 */
export const runSignatureExtractor = async (rawEmail) => {
  const lines = rawEmail.split('\n');
  let boundaryIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (SIGNATURE_BOUNDARY_PATTERNS.some((rx) => rx.test(trimmed))) {
      boundaryIdx = i + 1;
      break;
    }
  }

  // Fallback: if no closing phrase was found, treat the entire input as the
  // signature rather than returning an error. This handles cases where the
  // user pastes raw signature HTML or a plain-text block without a separator.
  const startIdx = boundaryIdx !== -1 ? boundaryIdx : 0;

  const sigLines = lines
    .slice(startIdx)
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !SIGNATURE_DISCARD_PATTERNS.some((rx) => rx.test(t));
    });

  if (!sigLines.length) {
    const EMPTY_STYLE = 'font-family: Arial, sans-serif; font-size: 13px; color: #6b7280; margin: 0;';
    return `<p style="${EMPTY_STYLE}">No signature content found in the provided text.</p>`;
  }

  const containsHtml = sigLines.some((line) => /<[a-z][^>]*>/i.test(line));

  // If the extracted block already contains HTML tags, return it as-is so
  // the Outlook Live View renders it correctly.
  if (containsHtml) {
    return sigLines.join('\n').trim();
  }

  // Plain text — wrap each line in a styled <p> so the result is valid HTML
  // ready for both the preview and the code output panel.
  const BASE_STYLE = 'font-family: Arial, Inter, sans-serif; font-size: 13px; line-height: 1.5; color: #374151; margin: 2px 0;';
  const BOLD_STYLE = 'font-family: Arial, Inter, sans-serif; font-size: 14px; font-weight: 700; line-height: 1.5; color: #111827; margin: 0 0 4px;';

  return sigLines
    .map((line, idx) => {
      const text  = line.trim();
      const style = idx === 0 ? BOLD_STYLE : BASE_STYLE;
      return `<p style="${style}">${text}</p>`;
    })
    .join('\n');
};

/**
 * Routes content to the correct processor based on active mode.
 * @param {'ai' | 'cleaner' | 'extractor'} mode
 * @param {string} content
 * @returns {Promise<string>}
 */
export const processContent = async (mode, content) => {
  const processors = {
    ai:        runAiTranspiler,
    cleaner:   runOutlookCleaner,
    extractor: runSignatureExtractor,
  };

  const processor = processors[mode];
  return processor ? processor(content) : content;
};
