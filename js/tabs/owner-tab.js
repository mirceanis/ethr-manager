/**
 * owner-tab.js – UPDATE/DELETE tab: transfer DID ownership or deactivate.
 */

import { html, nothing } from '../imports.js';

/**
 * @param {{
 *   managedIdentity:     string,
 *   didDocument:         object|null,
 *   account:             string|null,
 *   canManage:           boolean,
 *   txPending:           boolean,
 *   newOwner:            string,
 *   onNewOwnerChange:    (v: string) => void,
 *   onTransfer:          () => void,
 *   onDeactivate:        () => void,
 * }} props
 */
export const OwnerTab = ({
  managedIdentity,
  didDocument, account, txPending,
  canManage,
  newOwner, onNewOwnerChange, onTransfer, onDeactivate,
}) => {
  const identityLabel = managedIdentity.length > 42 ? 'Managed Public Key' : 'Managed Identity';
  const currentOwner =
    didDocument?.verificationMethod?.[0]?.blockchainAccountId?.split(':').pop() ?? account ?? '';

  return html`
    <div class="card">
      <div class="card-title">UPDATE · DID Ownership</div>
      <div class="owner-section">
        <div class="form-label">${identityLabel}</div>
        <div class="owner-addr">${managedIdentity}</div>
      </div>
      <div class="owner-section">
        <div class="form-label">Current Owner</div>
        <div class="owner-addr">${currentOwner}</div>
      </div>
      ${!canManage ? html`
        <div class="warn-box">
          Connected wallet is not the current DID controller. Connect ${currentOwner || 'the owner'} to transfer ownership or deactivate this DID.
        </div>
      ` : nothing}
      <div class="form-group">
        <label class="form-label">New Owner Address</label>
        <input class="form-input" placeholder="0x…"
          .value=${newOwner}
          @input=${e => onNewOwnerChange(e.target.value)}>
      </div>
      <button class="btn btn-primary"
        @click=${onTransfer}
        .disabled=${txPending || !canManage || !newOwner.trim()}>
        ${txPending ? html`<span class="spinner"></span> Pending…` : 'Transfer Ownership'}
      </button>
    </div>

    <div class="card card-danger">
      <div class="card-title">DELETE · Deactivate DID</div>
      <div class="warn-box">
        ⚠ Deactivating transfers ownership to the null address (0x0000000000000000000000000000000000000000),
        making the DID permanently unresolvable and unmanageable.
        This is the closest equivalent to deletion in the did:ethr method
        and is irreversible.
      </div>
      <button class="btn btn-danger" @click=${onDeactivate} .disabled=${txPending || !canManage}>
        ${txPending ? html`<span class="spinner"></span> Pending…` : '☠ Deactivate DID'}
      </button>
    </div>
  `;
};
