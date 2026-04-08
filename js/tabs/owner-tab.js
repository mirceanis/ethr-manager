/**
 * owner-tab.js – UPDATE/DELETE tab: transfer DID ownership or deactivate.
 */

import { html, nothing } from '../imports.js';

/**
 * @param {{
 *   didDocument:         object|null,
 *   account:             string|null,
 *   txPending:           boolean,
 *   newOwner:            string,
 *   onNewOwnerChange:    (v: string) => void,
 *   onTransfer:          () => void,
 *   onDeactivate:        () => void,
 * }} props
 */
export const OwnerTab = ({
  didDocument, account, txPending,
  newOwner, onNewOwnerChange, onTransfer, onDeactivate,
}) => {
  const currentOwner =
    didDocument?.verificationMethod?.[0]?.blockchainAccountId?.split(':').pop() ?? account ?? '';

  return html`
    <div class="card">
      <div class="card-title">UPDATE · DID Ownership</div>
      <div style="margin-bottom:20px">
        <div class="form-label">Current Owner</div>
        <div class="owner-addr">${currentOwner}</div>
      </div>
      <div class="form-group">
        <label class="form-label">New Owner Address</label>
        <input class="form-input" placeholder="0x…"
          .value=${newOwner}
          @input=${e => onNewOwnerChange(e.target.value)}>
      </div>
      <button class="btn btn-primary"
        @click=${onTransfer}
        .disabled=${txPending || !newOwner.trim()}>
        ${txPending ? html`<span class="spinner"></span> Pending…` : 'Transfer Ownership'}
      </button>
    </div>

    <div class="card" style="border-color:#3d1515">
      <div class="card-title" style="color:var(--red)">DELETE · Deactivate DID</div>
      <div class="warn-box">
        ⚠ Deactivating transfers ownership to the burn address (0x…dEaD),
        making the DID permanently unresolvable and unmanageable.
        This is the closest equivalent to deletion in the did:ethr method
        and is irreversible.
      </div>
      <button class="btn btn-danger" @click=${onDeactivate} .disabled=${txPending}>
        ${txPending ? html`<span class="spinner"></span> Pending…` : '☠ Deactivate DID'}
      </button>
    </div>
  `;
};
