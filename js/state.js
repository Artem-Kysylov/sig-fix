/**
 * @typedef {'ai' | 'cleaner' | 'extractor'} AppMode
 * @typedef {'preview' | 'code'} OutputTab
 *
 * @typedef {Object} AppState
 * @property {AppMode}   currentMode
 * @property {OutputTab} currentTab
 * @property {boolean}   hasContent
 * @property {string}    processedContent
 */

/** @type {AppState} */
const state = {
  currentMode: 'ai',
  currentTab: 'preview',
  hasContent: false,
  processedContent: '',
};

/** @returns {Readonly<AppState>} */
export const getState = () => Object.freeze({ ...state });

/** @param {Partial<AppState>} updates */
export const setState = (updates) => {
  Object.assign(state, updates);
};
