/**
 * did-manager.js – root web component using HauntedJS.
 *
 * Orchestrates wallet connection, DID resolution, and CRUD operations
 * across the four management tabs.
 */

import { component, useState, useEffect, useCallback } from './imports.js';
import { html, nothing } from './imports.js';

import { useWallet }   from './wallet.js';
import { resolveDID }  from './resolver.js';
import { useRegistry } from './registry.js';
import { loadLocalKeys, saveLocalKeys, generateKeyPair } from './keys.js';

import { DocumentTab } from './tabs/document-tab.js';
import { KeysTab }     from './tabs/keys-tab.js';
import { ServicesTab } from './tabs/services-tab.js';
import { OwnerTab }    from './tabs/owner-tab.js';

import { SUPPORTED_NETWORKS, FALLBACK_CHAIN_ID, KEY_VALIDITY_DEFAULT, shortAddr, formatDID, parseIdentityInput, sameAddr } from './utils.js';

// ─────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────
function DidManager() {
  // ── Wallet ──────────────────────────────────────────────────────────
  const {
    discoveredWallets, account, chainId,
    ethersProvider, ethersSigner,
    selectWallet, switchToNetwork,
    error: walletError,
  } = useWallet();

  const currentNetwork    = chainId != null ? (SUPPORTED_NETWORKS[chainId] ?? null) : null;
  const isSupportedNetwork = !!currentNetwork;

  // ── UI state ─────────────────────────────────────────────────────────
  const [tab,         setTab]         = useState('document');
  const [didDocument, setDidDocument] = useState(null);
  const [resolving,   setResolving]   = useState(false);
  const [localKeys,   setLocalKeys]   = useState(loadLocalKeys);
  const [managedIdentity, setManagedIdentity] = useState('');
  const [identityInput,   setIdentityInput]   = useState('');
  const [identityMode,    setIdentityMode]    = useState('account');
  const [svcType,     setSvcType]     = useState('');
  const [svcEndpoint, setSvcEndpoint] = useState('');
  const [svcTtl,      setSvcTtl]      = useState(KEY_VALIDITY_DEFAULT);
  const [newOwner,    setNewOwner]    = useState('');
  // per-key TTL in seconds, keyed by kp.id; falls back to KEY_VALIDITY_DEFAULT
  const [keyTtls,     setKeyTtls]     = useState({});

  // ── Success/error banner ──────────────────────────────────────────────
  const [banner, setBanner] = useState(null); // { type: 'success'|'error', msg, txHash? }

  const showBanner = useCallback((type, msg, txHash = null) => {
    setBanner({ type, msg, txHash });
    setTimeout(() => setBanner(null), 7000);
  }, []);

  useEffect(() => {
    if (!account) {
      setManagedIdentity('');
      setIdentityInput('');
      setIdentityMode('account');
      return;
    }
    if (identityMode === 'account' || !managedIdentity) {
      setManagedIdentity(account);
      setIdentityInput(account);
    }
  }, [account, identityMode, managedIdentity]);

  useEffect(() => {
    setDidDocument(null);
  }, [managedIdentity, currentNetwork]);

  const managedDid = managedIdentity && currentNetwork
    ? formatDID(managedIdentity, currentNetwork.name)
    : null;
  const currentOwner = didDocument?.verificationMethod?.[0]?.blockchainAccountId?.split(':').pop() ?? null;
  const canManage = !!account && !!didDocument && sameAddr(account, currentOwner || '');

  // ── Registry actions ──────────────────────────────────────────────────
  const onTxSuccess = useCallback(async (msg, txHash) => {
    showBanner('success', msg, txHash);
    // Auto-resolve after every successful transaction
    if (managedIdentity && ethersProvider && currentNetwork) {
      setResolving(true);
      try {
        const doc = await resolveDID(formatDID(managedIdentity, currentNetwork.name), ethersProvider);
        setDidDocument(doc);
      } catch (e) {
        showBanner('error', 'Resolve failed: ' + e.message);
      } finally {
        setResolving(false);
      }
    }
  }, [managedIdentity, ethersProvider, currentNetwork, showBanner]);

  const registry = useRegistry(managedIdentity || null, ethersSigner, currentNetwork, onTxSuccess);

  // ── Auto-resolve when account/chain become valid ──────────────────────
  useEffect(() => {
    if (!managedIdentity || !ethersProvider || !isSupportedNetwork || !currentNetwork) {
      setDidDocument(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    // Verify the provider's network matches our expected chainId before resolving.
    // On a network switch the old provider briefly coexists with the new chainId,
    // which causes a NETWORK_ERROR. We drop that stale render cycle silently.
    ethersProvider.getNetwork().then(net => {
      if (cancelled) return;
      if (Number(net.chainId) !== chainId) {
        setResolving(false);
        return;
      }
      resolveDID(formatDID(managedIdentity, currentNetwork.name), ethersProvider)
        .then(doc => { if (!cancelled) { setDidDocument(doc); setResolving(false); } })
        .catch(e  => { if (!cancelled) { showBanner('error', 'Resolve failed: ' + e.message); setResolving(false); } });
    }).catch(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [managedIdentity, chainId, ethersProvider, isSupportedNetwork, currentNetwork, showBanner]);

  // ── Propagate wallet error to banner ─────────────────────────────────
  useEffect(() => {
    if (walletError) showBanner('error', walletError);
  }, [walletError]);

  // ── Propagate registry tx error to banner ────────────────────────────
  useEffect(() => {
    if (registry.txError) { showBanner('error', registry.txError); registry.clearTxError(); }
  }, [registry.txError]);

  // ── Manual resolve ────────────────────────────────────────────────────
  const handleResolve = useCallback(async () => {
    if (!managedIdentity || !ethersProvider || !currentNetwork) return;
    setResolving(true);
    try {
      const doc = await resolveDID(formatDID(managedIdentity, currentNetwork.name), ethersProvider);
      setDidDocument(doc);
      showBanner('success', 'DID document resolved.');
    } catch (e) {
      showBanner('error', 'Resolve error: ' + e.message);
    } finally {
      setResolving(false);
    }
  }, [managedIdentity, ethersProvider, currentNetwork, showBanner]);

  const handleLoadIdentity = useCallback(() => {
    try {
      const identity = parseIdentityInput(identityInput);
      setManagedIdentity(identity);
      setIdentityInput(identity);
      setIdentityMode(sameAddr(identity, account || '') ? 'account' : 'custom');
      setTab('document');
      showBanner('success', 'Loaded DID identity.');
    } catch (e) {
      showBanner('error', e.message);
    }
  }, [identityInput, account, showBanner]);

  const handleUseConnectedWallet = useCallback(() => {
    if (!account) return;
    setManagedIdentity(account);
    setIdentityInput(account);
    setIdentityMode('account');
    setTab('document');
  }, [account]);

  // ── Key handlers ──────────────────────────────────────────────────────
  const handleGenerateKey = useCallback(() => {
    const kp   = generateKeyPair();
    const keys = [...localKeys, kp];
    setLocalKeys(keys); saveLocalKeys(keys);
    showBanner('success', 'Key pair generated and saved locally.');
  }, [localKeys, showBanner]);

  const handleAddKey = useCallback(async (kp) => {
    const validity = keyTtls[kp.id] ?? KEY_VALIDITY_DEFAULT;
    const result = await registry.addKey(kp, validity);
    if (result) {
      // Store attrName/attrValue for removeKey to use later; addedToDID is now
      // derived from the live DID document in KeysTab, not from this flag.
      const keys = localKeys.map(k =>
        k.id === kp.id ? { ...k, attrName: result.attrName, attrValue: result.attrValue } : k,
      );
      setLocalKeys(keys); saveLocalKeys(keys);
    }
  }, [localKeys, registry, keyTtls]);

  const handleRemoveKey = useCallback(async (kp) => {
    await registry.removeKey(kp);
    // No local state mutation needed; KeysTab derives on-chain status from didDocument.
  }, [registry]);

  const handleDeleteLocal = useCallback((kp) => {
    const docVMs = didDocument?.verificationMethod ?? [];
    const isOnChain = docVMs.some(
      vm => vm.publicKeyHex?.toLowerCase() === kp.publicKey.slice(2).toLowerCase(),
    );
    if (isOnChain) {
      showBanner('error', 'Remove this key from the DID document before deleting it locally.');
      return;
    }
    const keys = localKeys.filter(k => k.id !== kp.id);
    setLocalKeys(keys); saveLocalKeys(keys);
  }, [localKeys, didDocument, showBanner]);

  // ── Service handlers ──────────────────────────────────────────────────
  const handleAddService = useCallback(async () => {
    const ok = await registry.addService(svcType, svcEndpoint, svcTtl);
    if (ok) {
      setSvcType(''); setSvcEndpoint('');
    }
  }, [svcType, svcEndpoint, svcTtl, registry]);

  // ── Owner/deactivate handlers ─────────────────────────────────────────
  const handleTransfer = useCallback(async () => {
    const ok = await registry.transferOwnership(newOwner);
    if (ok) setNewOwner('');
  }, [newOwner, registry]);

  const handleDeactivate = useCallback(async () => {
    if (!confirm('Transfer DID ownership to the burn address? This is irreversible.')) return;
    await registry.deactivate();
  }, [registry]);

  // ════════════════════════════════════
  //  RENDER HELPERS
  // ════════════════════════════════════

  const renderHeader = () => html`
    <header class="header">
      <div class="logo">
        <div class="logo-mark">
          <svg viewBox="0 0 18 18" fill="none">
            <path d="M9 2L15.5 6v6L9 16 2.5 12V6L9 2Z" stroke="#04c47a" stroke-width="1.5" stroke-linejoin="round"/>
            <circle cx="9" cy="9" r="2.5" fill="#04c47a"/>
          </svg>
        </div>
        <div>
          <div class="logo-title">did:ethr Manager</div>
        </div>
      </div>
      ${account ? html`
        <div class="wallet-pill ${isSupportedNetwork ? 'connected' : 'wrong'}">
          <span class="dot"></span>
          <span>${shortAddr(account)}</span>
          ${chainId != null
            ? html`<span class="wallet-pill-network ${isSupportedNetwork ? '' : 'text-yellow'}">${currentNetwork?.label ?? `Chain ${chainId}`}</span>`
            : nothing}
        </div>
      ` : html`<div class="wallet-pill"><span class="dot"></span><span>Not connected</span></div>`}
    </header>
  `;

  const renderConnect = () => html`
    <div class="connect-screen">
      <h1>Manage Your<br><span>did:ethr</span></h1>
      <p>
        Connect your Ethereum wallet to manage your decentralised identity.
        Supports any network where the EthereumDIDRegistry is deployed.
        Your wallet address is your DID — no registration required.
      </p>
      ${discoveredWallets.length === 0
        ? html`<div class="empty-state"><div class="empty-icon">🔌</div><div>No wallets detected.<br>Install MetaMask or another EIP-1193 wallet.</div></div>`
        : html`
          <div class="wallet-list">
            ${discoveredWallets.map(w => html`
              <button class="wallet-btn" @click=${() => selectWallet(w)}>
                ${w.info.icon
                  ? html`<img src="${w.info.icon}" alt="${w.info.name}">`
                  : html`<div class="wallet-icon-placeholder">🦊</div>`}
                <span class="wallet-name">${w.info.name}</span>
                <span class="wallet-arrow">→</span>
              </button>
            `)}
          </div>
        `}
    </div>
  `;

  const renderNetworkWarning = () => html`
    <div class="network-warn">
      <span class="icon">⚠️</span>
      <div>
        <h3>Unsupported Network</h3>
        <p>This app requires a network where the EthereumDIDRegistry is deployed (e.g. Sepolia, Gnosis, Mainnet). Switch your wallet or click below to switch to Sepolia.</p>
      </div>
      <button class="btn btn-ghost" @click=${() => switchToNetwork(FALLBACK_CHAIN_ID)}>Switch to Sepolia</button>
    </div>
    <div class="card card-muted">
      <div class="card-title">Management disabled on this network</div>
      <p class="network-warn-copy">Connect to a supported network to manage your DID.</p>
    </div>
  `;

  const renderIdentityControls = () => html`
    <div class="card">
      <div class="card-title">Target DID</div>
      <div class="form-group">
        <label class="form-label">Identity Address Or DID</label>
        <input class="form-input" placeholder="0x... or did:ethr:sepolia:0x..."
          .value=${identityInput}
          @input=${e => setIdentityInput(e.target.value)}>
      </div>
      <div class="inline-row-wrap">
        <button class="btn btn-primary btn-sm" @click=${handleLoadIdentity} .disabled=${!identityInput.trim()}>Load DID</button>
        <button class="btn btn-ghost btn-sm" @click=${handleUseConnectedWallet} .disabled=${!account || sameAddr(managedIdentity, account)}>Use connected wallet</button>
        ${managedIdentity
          ? html`<span class="badge badge-blue">Managing ${shortAddr(managedIdentity)}</span>`
          : nothing}
      </div>
      ${managedIdentity && didDocument && !canManage ? html`
        <div class="warn-box warn-box-top">
          Connected wallet ${shortAddr(account || '')} is not the current controller for ${shortAddr(managedIdentity)}. You can resolve this DID, but on-chain changes stay disabled until the controller wallet connects.
        </div>
      ` : nothing}
    </div>
  `;

  const copy = (text) => navigator.clipboard.writeText(text).catch(() => {});

  const renderDIDBanner = () => {
    const did      = didDocument?.id ?? (managedDid || formatDID(managedIdentity || account || '0x0', currentNetwork?.name ?? 'mainnet'));
    const owner    = currentOwner ?? account;
    const registry = currentNetwork?.registry ?? '';
    return html`
      <div class="did-banner">
        <div class="did-banner-label">✓ DID Identity (CREATE)</div>
        <div class="did-banner-head">
          <div class="did-banner-id did-banner-id-tight">${did}</div>
          <button class="btn btn-ghost btn-sm btn-copy" title="Copy DID" @click=${() => copy(did)}>⎘</button>
        </div>
        <div class="did-banner-meta">
          <div class="did-meta-item">Owner
            <span class="meta-copy-group">
              ${shortAddr(owner ?? '')}
              <button class="btn btn-ghost btn-sm btn-copy" title="Copy owner address" @click=${() => copy(owner ?? '')}>⎘</button>
            </span>
          </div>
          <div class="did-meta-item">Network<span>${currentNetwork?.label ?? ''}</span></div>
          <div class="did-meta-item">Registry
            <span class="meta-copy-group">
              ${shortAddr(registry)}
              <button class="btn btn-ghost btn-sm btn-copy" title="Copy registry address" @click=${() => copy(registry)}>⎘</button>
            </span>
          </div>
          ${didDocument ? html`<div class="did-meta-item">Keys<span>${didDocument.verificationMethod?.length ?? 0}</span></div>` : nothing}
          ${didDocument ? html`<div class="did-meta-item">Services<span>${didDocument.service?.length ?? 0}</span></div>` : nothing}
        </div>
      </div>
    `;
  };

  const renderTabs = () => html`
    <div class="tabs">
      ${[['document','📄 Document'],['keys','🔑 Keys'],['services','🔗 Services'],['owner','👤 Owner']].map(([id, label]) => html`
        <button class="tab-btn ${tab === id ? 'active' : ''}" @click=${() => setTab(id)}>${label}</button>
      `)}
    </div>
  `;

  const renderStatusBar = () => html`
    ${banner?.type === 'error'
      ? html`<div class="status-bar error"><span>✕</span><span>${banner.msg}</span></div>`
      : nothing}
    ${banner?.type === 'success'
      ? html`<div class="status-bar success"><span>✓</span><span>${banner.msg}${banner.txHash && currentNetwork?.explorerTx
          ? html` — <a href="${currentNetwork.explorerTx}${banner.txHash}" target="_blank" class="link-inherit">${shortAddr(banner.txHash)}</a>`
          : nothing}</span></div>`
      : nothing}
    ${registry.txPending && !banner
      ? html`<div class="status-bar info"><span class="spinner"></span><span>Transaction pending… please confirm in your wallet.</span></div>`
      : nothing}
  `;

  // ════════════════════════════════════
  //  MAIN RENDER
  // ════════════════════════════════════
  return html`
    <div class="app">
      ${renderHeader()}

      ${!account
        ? renderConnect()
        : !isSupportedNetwork
          ? html`${renderNetworkWarning()}${renderStatusBar()}`
          : html`
            ${renderIdentityControls()}
            ${renderDIDBanner()}
            ${renderTabs()}

            ${tab === 'document' ? DocumentTab({
                didDocument, resolving, txPending: registry.txPending,
                onResolve: handleResolve,
              }) : nothing}

            ${tab === 'keys' ? KeysTab({
                canManage,
                localKeys, didDocument, txPending: registry.txPending,
                keyTtls,
                onTtlChange:   (id, val) => setKeyTtls(prev => ({ ...prev, [id]: val })),
                onGenerate:    handleGenerateKey,
                onAddKey:      handleAddKey,
                onRemoveKey:   handleRemoveKey,
                onDeleteLocal: handleDeleteLocal,
              }) : nothing}

            ${tab === 'services' ? ServicesTab({
                canManage,
                didDocument, txPending: registry.txPending,
                svcType, svcEndpoint, svcTtl,
                onTypeChange:     setSvcType,
                onEndpointChange: setSvcEndpoint,
                onTtlChange:      setSvcTtl,
                onAddService:     handleAddService,
                onRemoveService:  registry.removeService,
              }) : nothing}

            ${tab === 'owner' ? OwnerTab({
                managedIdentity,
                didDocument, account, txPending: registry.txPending,
                canManage,
                newOwner,
                onNewOwnerChange: setNewOwner,
                onTransfer:       handleTransfer,
                onDeactivate:     handleDeactivate,
              }) : nothing}

            ${renderStatusBar()}
          `
      }
    </div>
  `;
}

customElements.define('did-manager', component(DidManager, { useShadowDOM: false }));
