/**
 * services-tab.js – UPDATE tab: add and remove service endpoints.
 */

import { html, nothing } from '../imports.js';
import { formatTtl } from '../utils.js';

/**
 * @param {{
 *   canManage:        boolean,
 *   didDocument:      object|null,
 *   txPending:        boolean,
 *   svcType:          string,
 *   svcEndpoint:      string,
 *   svcTtl:           number,
 *   onTypeChange:     (v: string) => void,
 *   onEndpointChange: (v: string) => void,
 *   onTtlChange:      (v: number) => void,
 *   onAddService:     () => void,
 *   onRemoveService:  (svc: object) => void,
 * }} props
 */
export const ServicesTab = ({
  canManage,
  didDocument, txPending,
  svcType, svcEndpoint, svcTtl,
  onTypeChange, onEndpointChange, onTtlChange,
  onAddService, onRemoveService,
}) => html`
  <div class="card">
    <div class="card-title">UPDATE · Service Endpoints</div>
    ${!canManage ? html`
      <div class="warn-box">
        Connected wallet is not the current DID controller. Service updates are disabled for this DID.
      </div>
    ` : nothing}
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Service Type</label>
        <input class="form-input" placeholder="LinkedDomains"
          .value=${svcType}
          @input=${e => onTypeChange(e.target.value)}
          .disabled=${txPending || !canManage}>
      </div>
      <div class="form-group">
        <label class="form-label">Endpoint URL</label>
        <input class="form-input" placeholder="https://example.com"
          .value=${svcEndpoint}
          @input=${e => onEndpointChange(e.target.value)}
          .disabled=${txPending || !canManage}>
      </div>
    </div>
    <div class="ttl-row">
      <label class="ttl-label">TTL (s)</label>
      <input
        class="ttl-input"
        type="number" min="1" step="1"
        .value=${String(svcTtl)}
        @change=${e => {
          const secs = Math.max(1, Math.round(Number(e.target.value) || 1));
          e.target.value = String(secs);
          onTtlChange(secs);
        }}
        .disabled=${txPending || !canManage}
      >
      <span class="ttl-value">${formatTtl(svcTtl)}</span>
    </div>
    <button class="btn btn-primary"
      @click=${onAddService}
      .disabled=${txPending || !canManage || !svcType.trim() || !svcEndpoint.trim()}>
      ${txPending ? html`<span class="spinner"></span> Pending…` : '+ Add Service'}
    </button>

    <hr class="divider">

    ${!didDocument?.service?.length
      ? html`<div class="empty-state"><div class="empty-icon">🔗</div><div>No services in this DID document yet.</div></div>`
      : didDocument.service.map(svc => html`
        <div class="key-item">
          <div class="key-icon">🔗</div>
          <div class="key-body">
            <div class="key-label">${svc.type}</div>
            <div class="key-val">${svc.serviceEndpoint}</div>
            <div class="key-val key-copy">${svc.id}</div>
          </div>
          <button class="btn btn-danger btn-sm" @click=${() => onRemoveService(svc)} .disabled=${txPending || !canManage}>Remove</button>
        </div>
      `)
    }
  </div>
`;
