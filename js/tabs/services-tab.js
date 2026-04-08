/**
 * services-tab.js – UPDATE tab: add and remove service endpoints.
 */

import { html, nothing } from '../imports.js';
import { KEY_VALIDITY_DEFAULT, formatTtl } from '../utils.js';

/**
 * @param {{
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
  didDocument, txPending,
  svcType, svcEndpoint, svcTtl,
  onTypeChange, onEndpointChange, onTtlChange,
  onAddService, onRemoveService,
}) => html`
  <div class="card">
    <div class="card-title">UPDATE · Service Endpoints</div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Service Type</label>
        <input class="form-input" placeholder="LinkedDomains"
          .value=${svcType}
          @input=${e => onTypeChange(e.target.value)}>
      </div>
      <div class="form-group">
        <label class="form-label">Endpoint URL</label>
        <input class="form-input" placeholder="https://example.com"
          .value=${svcEndpoint}
          @input=${e => onEndpointChange(e.target.value)}>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
      <label style="font-size:11px;color:var(--muted);font-family:var(--mono)">TTL (s)</label>
      <input
        type="number" min="1" step="1"
        .value=${String(svcTtl)}
        @change=${e => {
          const secs = Math.max(1, Math.round(Number(e.target.value) || 1));
          e.target.value = String(secs);
          onTtlChange(secs);
        }}
        style="width:140px;padding:3px 6px;font-family:var(--mono);font-size:12px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;color:var(--text)"
        .disabled=${txPending}
      >
      <span style="font-size:11px;color:var(--muted);font-family:var(--mono)">${formatTtl(svcTtl)}</span>
    </div>
    <button class="btn btn-primary"
      @click=${onAddService}
      .disabled=${txPending || !svcType.trim() || !svcEndpoint.trim()}>
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
            <div class="key-val" style="font-size:10px;margin-top:2px">${svc.id}</div>
          </div>
          <button class="btn btn-danger btn-sm" @click=${() => onRemoveService(svc)} .disabled=${txPending}>Remove</button>
        </div>
      `)
    }
  </div>
`;
