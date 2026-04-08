/**
 * keys-tab.js – UPDATE tab: generate local secp256k1 keys, add/remove from DID.
 */

import { html, nothing } from '../imports.js';
import { KEY_VALIDITY_DEFAULT, formatTtl } from '../utils.js';

const SECONDS_PER_YEAR = 365 * 24 * 3600;

/**
 * @param {{
 *   canManage:     boolean,
 *   localKeys:     object[],
 *   didDocument:   object|null,
 *   txPending:     boolean,
 *   keyTtls:       Record<string, number>,
 *   onTtlChange:   (id: string, seconds: number) => void,
 *   onGenerate:    () => void,
 *   onAddKey:      (kp: object) => void,
 *   onRemoveKey:   (kp: object) => void,
 *   onDeleteLocal: (kp: object) => void,
 * }} props
 */
export const KeysTab = ({
  canManage,
  localKeys, didDocument, txPending,
  keyTtls, onTtlChange,
  onGenerate, onAddKey, onRemoveKey, onDeleteLocal,
}) => {
  const docVMs = didDocument?.verificationMethod ?? [];
  const managedPublicKey = didDocument?.id?.split(':').pop()?.toLowerCase();

  // Derive on-chain presence from the live DID document, not from stored flag.
  const isOnChain = (kp) =>
    docVMs.some(vm => {
      if (!vm.publicKeyHex) return false;
      const fullPublicKey = `0x${vm.publicKeyHex.toLowerCase()}`;
      if (fullPublicKey === managedPublicKey && vm.id?.endsWith('#controllerKey')) return false;
      return fullPublicKey === kp.publicKey.toLowerCase();
    });

  // Keys in the DID doc that don't belong to any local key
  const externalVMs = docVMs.filter(
    vm => !vm.blockchainAccountId &&
      !(vm.id?.endsWith('#controllerKey') && `0x${vm.publicKeyHex?.toLowerCase()}` === managedPublicKey) &&
      !localKeys.some(k => k.publicKey.slice(2).toLowerCase() === vm.publicKeyHex?.toLowerCase()),
  );

  return html`
    <div class="card">
      <div class="action-row">
        <div class="card-title card-title-tight">UPDATE · Verification Keys</div>
        <button class="btn btn-primary btn-sm" @click=${onGenerate} .disabled=${txPending}>+ Generate Key</button>
      </div>
      <p class="network-warn-copy">
        Keys are generated locally (secp256k1) and stored in your browser. Add them to your DID document on-chain.
      </p>
      ${!canManage ? html`
        <div class="warn-box">
          Connected wallet is not the current DID controller. You can inspect keys, but on-chain key changes are disabled.
        </div>
      ` : nothing}

      ${localKeys.length === 0
        ? html`<div class="empty-state"><div class="empty-icon">🔑</div><div>No local keys yet.<br>Click "Generate Key" to create one.</div></div>`
        : localKeys.map(kp => {
            const onChain  = isOnChain(kp);
            const ttlSecs  = keyTtls[kp.id] ?? KEY_VALIDITY_DEFAULT;
            return html`
              <div class="key-item ${onChain ? '' : 'danger'}">
                <div class="key-icon">${onChain ? '🔐' : '🔑'}</div>
                <div class="key-body">
                  <div class="key-label">
                    Secp256k1
                    ${onChain
                      ? html`<span class="badge badge-green badge-offset">On-chain</span>`
                      : html`<span class="badge badge-muted badge-offset">Local only</span>`}
                  </div>
                  <div class="key-val" title="${kp.publicKey}">${kp.publicKey}</div>
                  <div class="key-val key-created-at">${new Date(kp.created).toLocaleString()}</div>
                  ${!onChain ? html`
                    <div class="ttl-row key-ttl-row">
                      <label class="ttl-label">TTL (s)</label>
                      <input
                        class="ttl-input"
                        type="number" min="1" step="1"
                        .value=${String(ttlSecs)}
                        @change=${(e) => {
                          const secs = Math.max(1, Math.round(Number(e.target.value) || 1));
                          e.target.value = String(secs);
                          onTtlChange(kp.id, secs);
                        }}
                        .disabled=${txPending}
                      >
                      <span class="ttl-value">${formatTtl(ttlSecs)}</span>
                    </div>
                  ` : nothing}
                </div>
                <div class="key-actions">
                  ${onChain
                    ? html`<button class="btn btn-danger btn-sm" @click=${() => onRemoveKey(kp)} .disabled=${txPending || !canManage}>Remove</button>`
                    : html`<button class="btn btn-primary btn-sm" @click=${() => onAddKey(kp)} .disabled=${txPending || !canManage}>Add to DID</button>`}
                  <button class="btn btn-ghost btn-sm" title="Delete locally" @click=${() => onDeleteLocal(kp)} .disabled=${txPending}>🗑</button>
                </div>
              </div>
            `;
          })
      }

      ${externalVMs.length > 0 ? html`
        <hr class="divider">
        <div class="card-title">External keys (from DID document)</div>
        ${externalVMs.map(vm => html`
          <div class="key-item">
            <div class="key-icon">🔏</div>
            <div class="key-body">
              <div class="key-label">${vm.type} <span class="badge badge-blue badge-offset">External</span></div>
              <div class="key-val" title="${vm.publicKeyHex}">${vm.publicKeyHex ? '0x' + vm.publicKeyHex : vm.blockchainAccountId}</div>
            </div>
            <button class="btn btn-danger btn-sm" .disabled=${true} title="Import the private key locally to remove this key">Remove</button>
          </div>
        `)}
      ` : nothing}
    </div>
  `;
};
