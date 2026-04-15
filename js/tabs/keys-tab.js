/**
 * keys-tab.js – UPDATE tab: generate local secp256k1 keys, add/remove from DID.
 */

import { html, nothing } from '../imports.js';
import { KEY_VALIDITY_DEFAULT, formatTtl } from '../utils.js';
import {
  KEY_TYPE_OPTIONS,
  getAllowedRelationships,
  getRelationshipLabel,
  getKeyTypeLabel,
  getVerificationRelationships,
  isLocalKeyOnDidDocument,
  keyMatchesVerificationMethod,
} from '../keys.js';

/**
 * @param {{
 *   canManage:     boolean,
 *   localKeys:     object[],
 *   didDocument:   object|null,
 *   txPending:     boolean,
 *   newKeyType:    string,
 *   newKeyRelationship: string,
 *   onNewKeyTypeChange: (value: string) => void,
 *   onNewKeyRelationshipChange: (value: string) => void,
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
  newKeyType, newKeyRelationship,
  onNewKeyTypeChange, onNewKeyRelationshipChange,
  keyTtls, onTtlChange,
  onGenerate, onAddKey, onRemoveKey, onDeleteLocal,
}) => {
  const docVMs = didDocument?.verificationMethod ?? [];
  const allowedRelationships = getAllowedRelationships(newKeyType);

  // Derive on-chain presence from the live DID document, not from stored flag.
  const isOnChain = (kp) => isLocalKeyOnDidDocument(didDocument, kp);

  // Keys in the DID doc that don't belong to any local key
  const externalVMs = docVMs.filter(
    vm => !vm.blockchainAccountId &&
      !localKeys.some(k => keyMatchesVerificationMethod(k, vm, didDocument)),
  );

  return html`
    <div class="card">
      <div class="action-row">
        <div class="card-title card-title-tight">UPDATE · Verification Keys</div>
        <button class="btn btn-primary btn-sm" @click=${onGenerate} .disabled=${txPending}>+ Generate Key</button>
      </div>
      <p class="network-warn-copy">
        Keys are generated locally and stored in your browser. Add them to your DID document with the verification relationship you need.
      </p>
      ${!canManage ? html`
        <div class="warn-box">
          Connected wallet is not the current DID controller. You can inspect keys, but on-chain key changes are disabled.
        </div>
      ` : nothing}

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Key Type</label>
          <select class="form-input" .value=${newKeyType} @change=${e => onNewKeyTypeChange(e.target.value)} .disabled=${txPending}>
            ${KEY_TYPE_OPTIONS.map(type => html`<option value=${type}>${getKeyTypeLabel(type)}</option>`) }
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Verification Relationship</label>
          <select class="form-input" .value=${newKeyRelationship} @change=${e => onNewKeyRelationshipChange(e.target.value)} .disabled=${txPending}>
            ${allowedRelationships.map(relationship => html`<option value=${relationship}>${getRelationshipLabel(relationship)}</option>`)}
          </select>
        </div>
      </div>

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
                    ${getKeyTypeLabel(kp.type)}
                    ${onChain
                      ? html`<span class="badge badge-green badge-offset">On-chain</span>`
                      : html`<span class="badge badge-muted badge-offset">Local only</span>`}
                    <span class="badge badge-blue badge-offset">${getRelationshipLabel(kp.relationship)}</span>
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
              <div class="key-label">
                ${vm.type}
                <span class="badge badge-blue badge-offset">External</span>
                ${getVerificationRelationships(didDocument, vm).map(relationship => html`
                  <span class="badge badge-muted badge-offset">${getRelationshipLabel(relationship)}</span>
                `)}
              </div>
              <div class="key-val" title="${vm.publicKeyHex || vm.publicKeyBase58 || vm.blockchainAccountId}">${vm.publicKeyHex ? '0x' + vm.publicKeyHex : (vm.publicKeyBase58 || vm.blockchainAccountId)}</div>
            </div>
            <button class="btn btn-danger btn-sm" .disabled=${true} title="Import the private key locally to remove this key">Remove</button>
          </div>
        `)}
      ` : nothing}
    </div>
  `;
};
