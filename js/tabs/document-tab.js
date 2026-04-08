/**
 * document-tab.js – READ tab: show the DID document as syntax-highlighted JSON.
 */

import { html } from '../imports.js';
import { syntaxHighlight } from '../utils.js';

/**
 * @param {{
 *   didDocument: object|null,
 *   resolving:   boolean,
 *   txPending:   boolean,
 *   onResolve:   () => void,
 * }} props
 */
export const DocumentTab = ({ didDocument, resolving, txPending, onResolve }) => html`
  <div class="card">
    <div class="action-row">
      <div class="card-title card-title-tight">READ · DID Document</div>
      <button class="btn btn-ghost btn-sm" @click=${onResolve} .disabled=${resolving || txPending}>
        ${resolving
          ? html`<span class="spinner"></span> Resolving…`
          : '↺ Resolve'}
      </button>
    </div>
    ${resolving
      ? html`<div class="resolve-loading"><span class="spinner"></span>&nbsp; Resolving DID document…</div>`
      : didDocument
        ? html`<div class="json-frame-top"><div class="json-wrap" .innerHTML=${syntaxHighlight(didDocument)}></div></div>`
        : html`<div class="empty-state"><div class="empty-icon">📄</div><div>Click Resolve to fetch the DID document.<br>It auto-resolves after each transaction.</div></div>`
    }
  </div>
`;
