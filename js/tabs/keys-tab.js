/**
 * keys-tab.js – UPDATE tab: generate local secp256k1 keys, add/remove from DID.
 */

import { html, nothing } from '../imports.js';
import { KEY_VALIDITY_DEFAULT, formatTtl } from '../utils.js';

const SECONDS_PER_YEAR = 365 * 24 * 3600;

/**
 * @param {{
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
  localKeys, didDocument, txPending,
  keyTtls, onTtlChange,
  onGenerate, onAddKey, onRemoveKey, onDeleteLocal,
}) => {
  const docVMs = didDocument?.verificationMethod ?? [];

  // Derive on-chain presence from the live DID document, not from stored flag.
  const isOnChain = (kp) =>
    docVMs.some(vm => vm.publicKeyHex?.toLowerCase() === kp.publicKey.slice(2).toLowerCase());

  // Keys in the DID doc that don't belong to any local key
  const externalVMs = docVMs.filter(
    vm => !vm.blockchainAccountId &&
      !localKeys.some(k => k.publicKey.slice(2).toLowerCase() === vm.publicKeyHex?.toLowerCase()),
  );

  return html`
    <div class="card">
      <div class="action-row">
        <div class="card-title" style="margin-bottom:0">UPDATE · Verification Keys</div>
        <button class="btn btn-primary btn-sm" @click=${onGenerate} .disabled=${txPending}>+ Generate Key</button>
      </div>
      <p style="font-family:var(--mono);font-size:12px;color:var(--muted);margin-bottom:20px;line-height:1.7">
        Keys are generated locally (secp256k1) and stored in your browser. Add them to your DID document on-chain.
      </p>

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
                      ? html`<span class="badge badge-green" style="margin-left:8px">On-chain</span>`
                      : html`<span class="badge badge-muted" style="margin-left:8px">Local only</span>`}
                  </div>
                  <div class="key-val" title="${kp.publicKey}">${kp.publicKey}</div>
                  <div class="key-val" style="margin-top:3px;font-size:10px">${new Date(kp.created).toLocaleString()}</div>
                  ${!onChain ? html`
                    <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
                      <label style="font-size:11px;color:var(--muted);font-family:var(--mono)">TTL (s)</label>
                      <input
                        type="number" min="1" step="1"
                        .value=${String(ttlSecs)}
                        @change=${(e) => {
                          const secs = Math.max(1, Math.round(Number(e.target.value) || 1));
                          e.target.value = String(secs);
                          onTtlChange(kp.id, secs);
                        }}
                        style="width:140px;padding:3px 6px;font-family:var(--mono);font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)"
                        .disabled=${txPending}
                      >
                      <span style="font-size:11px;color:var(--muted);font-family:var(--mono)">${formatTtl(ttlSecs)}</span>
                    </div>
                  ` : nothing}
                </div>
                <div class="key-actions">
                  ${onChain
                    ? html`<button class="btn btn-danger btn-sm" @click=${() => onRemoveKey(kp)} .disabled=${txPending}>Remove</button>`
                    : html`<button class="btn btn-primary btn-sm" @click=${() => onAddKey(kp)} .disabled=${txPending}>Add to DID</button>`}
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
              <div class="key-label">${vm.type} <span class="badge badge-blue" style="margin-left:8px">External</span></div>
              <div class="key-val" title="${vm.publicKeyHex}">${vm.publicKeyHex ? '0x' + vm.publicKeyHex : vm.blockchainAccountId}</div>
            </div>
            <button class="btn btn-danger btn-sm" .disabled=${true} title="Import the private key locally to remove this key">Remove</button>
          </div>
        `)}
      ` : nothing}
    </div>
  `;
};
