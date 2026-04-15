/**
 * keys-tab.js – UPDATE tab: generate local secp256k1 keys, add/remove from DID.
 */

import { html, nothing } from '../imports.js';
import { ethers } from '../imports.js';
import { KEY_VALIDITY_DEFAULT, formatTtl } from '../utils.js';
import {
  KEY_TYPE_OPTIONS,
  ALL_RELATIONSHIPS,
  getAllowedRelationships,
  getRelationshipLabel,
  getRelationshipAttrSegment,
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
 *   rawKeyType:    string,
 *   rawKeyValue:   string,
 *   rawKeyRelationship: string,
 *   rawKeyTtl:     number,
 *   onRawKeyTypeChange: (value: string) => void,
 *   onRawKeyValueChange: (value: string) => void,
 *   onRawKeyRelationshipChange: (value: string) => void,
 *   onRawKeyTtlChange: (seconds: number) => void,
 *   onAddRawKey:   () => void,
 *   onRemoveExternalKey: (vm: object) => void,
 * }} props
 */
export const KeysTab = ({
  canManage,
  localKeys, didDocument, txPending,
  newKeyType, newKeyRelationship,
  onNewKeyTypeChange, onNewKeyRelationshipChange,
  keyTtls, onTtlChange,
  onGenerate, onAddKey, onRemoveKey, onDeleteLocal,
  rawKeyType, rawKeyValue, rawKeyRelationship, rawKeyTtl,
  onRawKeyTypeChange, onRawKeyValueChange,
  onRawKeyRelationshipChange, onRawKeyTtlChange,
  onAddRawKey, onRemoveExternalKey,
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

  const rawAttrName = rawKeyType.trim()
    ? `did/pub/${rawKeyType.trim()}/${getRelationshipAttrSegment(rawKeyRelationship)}`
    : '';
  const rawAttrByteLen = rawAttrName ? ethers.toUtf8Bytes(rawAttrName).length : 0;

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

      <hr class="divider">
      <div class="action-row">
        <div class="card-title card-title-tight">Add Key Material</div>
        <button class="btn btn-primary btn-sm"
          @click=${onAddRawKey}
          .disabled=${txPending || !canManage || !rawKeyType.trim() || !rawKeyValue.trim()}>
          Add to DID
        </button>
      </div>
      <p class="network-warn-copy">
        Add arbitrary key material directly to the DID document. Enter the key type and hex-encoded public key value.
      </p>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Key Type</label>
          <input class="form-input" placeholder="e.g. Secp256k1, Ed25519/hex"
            .value=${rawKeyType}
            @input=${e => onRawKeyTypeChange(e.target.value)}
            .disabled=${txPending}>
        </div>
        <div class="form-group">
          <label class="form-label">Verification Relationship</label>
          <select class="form-input" .value=${rawKeyRelationship} @change=${e => onRawKeyRelationshipChange(e.target.value)} .disabled=${txPending}>
            ${ALL_RELATIONSHIPS.map(r => html`<option value=${r}>${getRelationshipLabel(r)}</option>`)}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Key Material (hex)</label>
        <input class="form-input" placeholder="0xabcd..."
          .value=${rawKeyValue}
          @input=${e => onRawKeyValueChange(e.target.value)}
          .disabled=${txPending}>
      </div>
      ${rawKeyType.trim() ? html`
        <div class="form-row">
          <div class="form-group">
            <span class="key-val">${`did/pub/${rawKeyType.trim()}/${getRelationshipAttrSegment(rawKeyRelationship)}`}</span>
            <span class="badge ${rawAttrByteLen > 32 ? 'badge-red' : 'badge-muted'} badge-offset">${rawAttrByteLen}/32 bytes</span>
          </div>
          <div class="form-group">
            <div class="ttl-row">
              <label class="ttl-label">TTL (s)</label>
              <input
                class="ttl-input"
                type="number" min="1" step="1"
                .value=${String(rawKeyTtl)}
                @change=${(e) => {
                  const secs = Math.max(1, Math.round(Number(e.target.value) || 1));
                  e.target.value = String(secs);
                  onRawKeyTtlChange(secs);
                }}
                .disabled=${txPending}
              >
              <span class="ttl-value">${formatTtl(rawKeyTtl)}</span>
            </div>
          </div>
        </div>
      ` : nothing}

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
            <button class="btn btn-danger btn-sm" @click=${() => onRemoveExternalKey(vm)} .disabled=${txPending || !canManage}>Remove</button>
          </div>
        `)}
      ` : nothing}
    </div>
  `;
};
