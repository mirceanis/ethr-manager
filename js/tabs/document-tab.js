/**
 * document-tab.js – READ tab: show the DID document as syntax-highlighted JSON.
 */

import { html, nothing } from '../imports.js';
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
      <div class="card-title" style="margin-bottom:0">READ · DID Document</div>
      <button class="btn btn-ghost btn-sm" @click=${onResolve} .disabled=${resolving || txPending}>
        ${resolving
          ? html`<span class="spinner"></span> Resolving…`
          : '↺ Resolve'}
      </button>
    </div>
    ${resolving
      ? html`<div style="padding:40px;text-align:center;color:var(--muted);font-family:var(--mono);font-size:13px"><span class="spinner"></span>&nbsp; Resolving DID document…</div>`
      : didDocument
        ? html`<div style="margin-top:20px"><div class="json-wrap" .innerHTML=${syntaxHighlight(didDocument)}></div></div>`
        : html`<div class="empty-state"><div class="empty-icon">📄</div><div>Click Resolve to fetch the DID document.<br>It auto-resolves after each transaction.</div></div>`
    }
  </div>
`;
