/**
 * useWallet – EIP-6963 wallet discovery + EIP-1193 connection.
 *
 * Returns:
 *   discoveredWallets  – list of { info, provider } from eip6963:announceProvider
 *   selectedWallet     – the wallet the user clicked
 *   account            – active eth address string | null
 *   chainId            – current chainId as number | null
 *   ethersProvider     – ethers.BrowserProvider | null
 *   ethersSigner       – ethers.JsonRpcSigner | null
 *   selectWallet(w)    – connect to a discovered wallet
 *   switchToNetwork(chainId) – request network switch; adds chain if unknown
 *   error              – connection error string | null
 */

import { useState, useEffect, useCallback } from './imports.js';
import { ethers } from './imports.js';
import { SUPPORTED_NETWORKS } from './utils.js';

export function useWallet() {
  const [discoveredWallets, setDiscoveredWallets] = useState([]);
  const [selectedWallet,    setSelectedWallet]    = useState(null);
  const [account,           setAccount]           = useState(null);
  const [chainId,           setChainId]           = useState(null);
  const [ethersProvider,    setEthersProvider]    = useState(null);
  const [ethersSigner,      setEthersSigner]      = useState(null);
  const [error,             setError]             = useState(null);

  // ── EIP-6963 wallet discovery ──────────────────────────────────────────
  useEffect(() => {
    const found = [];
    const handler = (e) => {
      if (!found.some(w => w.info.uuid === e.detail.info.uuid)) {
        found.push(e.detail);
        setDiscoveredWallets([...found]);
      }
    };
    window.addEventListener('eip6963:announceProvider', handler);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Legacy fallback (MetaMask etc.) after a brief discovery window
    const t = setTimeout(() => {
      if (found.length === 0 && window.ethereum) {
        const legacy = {
          info: { uuid: 'legacy', name: 'Injected Wallet', icon: null, rdns: '' },
          provider: window.ethereum,
        };
        found.push(legacy);
        setDiscoveredWallets([...found]);
      }
    }, 300);

    return () => {
      window.removeEventListener('eip6963:announceProvider', handler);
      clearTimeout(t);
    };
  }, []);

  // ── Connect to selected EIP-1193 provider ──────────────────────────────
  useEffect(() => {
    if (!selectedWallet) return;
    let cancelled = false;
    const eip1193 = selectedWallet.provider;

    async function connect() {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Wallet connection timed out. Check your wallet extension.')), 15000));
        await Promise.race([
          eip1193.request({ method: 'eth_requestAccounts' }),
          timeout,
        ]);
        const provider = new ethers.BrowserProvider(eip1193);
        const [signer, network, accounts] = await Promise.all([
          provider.getSigner(),
          provider.getNetwork(),
          provider.listAccounts(),
        ]);
        if (cancelled) return;
        setEthersProvider(provider);
        setEthersSigner(signer);
        setAccount(accounts[0]?.address ?? null);
        setChainId(Number(network.chainId));
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    const onAccounts = (accounts) => {
      if (cancelled) return;
      const addr = accounts[0] || null;
      setAccount(addr);
      if (!addr) setEthersProvider(null);
    };

    const onChain = (hexChainId) => {
      if (cancelled) return;
      setChainId(Number(hexChainId));
      // Rebuild provider/signer for the new network
      const provider = new ethers.BrowserProvider(eip1193);
      provider.getSigner().then(signer => {
        if (!cancelled) { setEthersProvider(provider); setEthersSigner(signer); }
      });
    };

    // Normalise event subscription across MetaMask-style (.on) and
    // EventTarget-style (Rabby, etc.) providers.  Store wrapper refs so
    // removeEventListener can match them exactly.
    const listeners = {};
    const on = (event, fn) => {
      if (typeof eip1193.on === 'function') {
        eip1193.on(event, fn);
        listeners[event] = fn;
      } else {
        const wrapper = (e) => fn(e.detail ?? e);
        eip1193.addEventListener(event, wrapper);
        listeners[event] = wrapper;
      }
    };
    const off = (event) => {
      if (!listeners[event]) return;
      if (typeof eip1193.removeListener === 'function') {
        eip1193.removeListener(event, listeners[event]);
      } else {
        eip1193.removeEventListener(event, listeners[event]);
      }
      delete listeners[event];
    };

    on('accountsChanged', onAccounts);
    on('chainChanged',    onChain);
    connect();

    return () => {
      cancelled = true;
      off('accountsChanged');
      off('chainChanged');
    };
  }, [selectedWallet]);

  // ── Switch network ─────────────────────────────────────────────────────
  const switchToNetwork = useCallback(async (targetChainId) => {
    const eip1193 = selectedWallet?.provider;
    if (!eip1193) return;
    const chainHex = '0x' + targetChainId.toString(16);
    try {
      await eip1193.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainHex }],
      });
    } catch (e) {
      if (e.code === 4902) {
        // Chain not known to wallet — try to add it if we have metadata
        const net = SUPPORTED_NETWORKS[targetChainId];
        if (net) {
          try {
            await eip1193.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: chainHex,
                chainName: net.label,
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [],
              }],
            });
          } catch (e2) { setError(e2.message); }
        } else {
          setError(`Chain ${targetChainId} is not known to this wallet.`);
        }
      } else {
        setError(e.message);
      }
    }
  }, [selectedWallet]);

  return {
    discoveredWallets,
    selectedWallet,
    account,
    chainId,
    ethersProvider,
    ethersSigner,
    selectWallet: setSelectedWallet,
    switchToNetwork,
    error,
  };
}
