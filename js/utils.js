import { ethers } from './imports.js';

// Deployments mirrored from ethr-did-resolver's built-in list.
// Each entry: { chainId, name, registry, label, explorerTx? }
// ideally these would be imported
const RAW_DEPLOYMENTS = [
  { chainId: 1,          name: 'mainnet',        registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', label: 'Ethereum Mainnet',    explorerTx: 'https://etherscan.io/tx/', legacyNonce: true },
  { chainId: 11155111,   name: 'sepolia',        registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818', label: 'Sepolia',             explorerTx: 'https://sepolia.etherscan.io/tx/', legacyNonce: false },
  { chainId: 100,        name: 'gno',            registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818', label: 'Gnosis Chain',        explorerTx: 'https://gnosisscan.io/tx/', legacyNonce: false },
  { chainId: 17000,      name: 'holesky',        registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818', label: 'Holesky',             explorerTx: 'https://holesky.etherscan.io/tx/', legacyNonce: false },
  { chainId: 137,        name: 'polygon',        registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', label: 'Polygon',             explorerTx: 'https://polygonscan.com/tx/', legacyNonce: true },
  { chainId: 80001,      name: 'polygon:test',   registry: '0xdca7ef03e98e0dc2b855be647c39abe984fcf21b', label: 'Polygon Mumbai',      explorerTx: 'https://mumbai.polygonscan.com/tx/', legacyNonce: true },
  { chainId: 246,        name: 'ewc',            registry: '0xE29672f34e92b56C9169f9D485fFc8b9A136BCE4', label: 'Energy Web Chain',    explorerTx: 'https://explorer.energyweb.org/tx/', legacyNonce: false },
  { chainId: 73799,      name: 'volta',          registry: '0xC15D5A57A8Eb0e1dCBE5D88B8f9a82017e5Cc4AF', label: 'Volta (EWC testnet)', explorerTx: null, legacyNonce: false },
  { chainId: 59141,      name: 'linea-sepolia',  registry: '0x03d5003bf0e79C5F5223588F347ebA39AfbC3818', label: 'Linea Sepolia',       explorerTx: 'https://sepolia.lineascan.build/tx/', legacyNonce: false },
  { chainId: 1313161554, name: 'aurora',         registry: '0x63eD58B671EeD12Bc1652845ba5b2CDfBff198e0', label: 'Aurora',              explorerTx: 'https://explorer.aurora.dev/tx/', legacyNonce: false },
];

// Keyed by chainId for O(1) lookup.
export const SUPPORTED_NETWORKS = Object.fromEntries(
  RAW_DEPLOYMENTS.map(d => [d.chainId, d]),
);

export const SUPPORTED_NETWORKS_BY_NAME = Object.fromEntries(
  RAW_DEPLOYMENTS.map(d => [d.name, d]),
);

// Fallback network to suggest when the connected chain is unsupported.
export const FALLBACK_CHAIN_ID  = 11155111; // Sepolia
export const FALLBACK_NETWORK   = SUPPORTED_NETWORKS[FALLBACK_CHAIN_ID];

export const KEY_VALIDITY_DEFAULT = 100 * 365 * 24 * 3600; // 100 years in seconds

const SECONDS_PER_YEAR = 365 * 24 * 3600;

// Display a TTL in seconds as a human-readable approximation.
export const formatTtl = (secs) => {
  if (secs < 60)           return `${secs}s`;
  if (secs < 3600)         return `~${Math.floor(secs / 60)}m`;
  if (secs < 86400)        return `~${(secs / 3600).toFixed(1)}h`;
  if (secs < SECONDS_PER_YEAR) return `~${(secs / 86400).toFixed(1)}d`;
  return `~${(secs / SECONDS_PER_YEAR).toFixed(1)}y`;
};
export const STORAGE_KEY  = 'did-ethr-manager-keys-v1';

// ── Address / DID helpers ─────────────────────────────────────────────────

const ADDRESS_IDENTIFIER = /^0x[0-9a-fA-F]{40}$/;
const PUBLIC_KEY_IDENTIFIER = /^0x[0-9a-fA-F]{66}$/;

export const shortAddr = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';

export const sameAddr = (a, b) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

function parseNetworkName(networkToken, fallbackNetworkName = null) {
  if (!networkToken) {
    if (fallbackNetworkName) return fallbackNetworkName;
    return 'mainnet';
  }

  const byName = SUPPORTED_NETWORKS_BY_NAME[networkToken];
  if (byName) return byName.name;

  if (/^0x[0-9a-fA-F]+$/.test(networkToken)) {
    const chainId = Number(BigInt(networkToken));
    const byChainId = SUPPORTED_NETWORKS[chainId];
    if (byChainId) return byChainId.name;
  }

  throw new Error(`Unsupported did:ethr network: ${networkToken}`);
}

export const getSupportedNetworkByName = (networkName) =>
  networkName ? (SUPPORTED_NETWORKS_BY_NAME[networkName] ?? null) : null;

export function parseIdentityInput(input, fallbackNetworkName = null) {
  const value = input.trim();
  if (!value) throw new Error('Enter an address, compressed public key, or DID.');

  let identifier = value.split('?')[0];
  let networkName;
  if (identifier.startsWith('did:ethr:')) {
    const components = identifier.split(':');
    identifier = components[components.length - 1];
    networkName = parseNetworkName(
      components.length >= 4 ? components.slice(2, -1).join(':') : null,
      null,
    );
  } else {
    networkName = parseNetworkName(null, fallbackNetworkName);
  }

  if (ADDRESS_IDENTIFIER.test(identifier)) {
    const address = ethers.getAddress(identifier);
    return {
      identifier: address,
      did: formatDID(address, networkName),
      identityAddress: address,
      networkName,
      type: 'address',
    };
  }

  if (PUBLIC_KEY_IDENTIFIER.test(identifier)) {
    const publicKey = identifier.toLowerCase();
    try {
      return {
        identifier: publicKey,
        did: formatDID(publicKey, networkName),
        identityAddress: ethers.computeAddress(publicKey),
        networkName,
        type: 'publicKey',
      };
    } catch {
      throw new Error('Enter a valid compressed secp256k1 public key, address, or DID.');
    }
  }

  throw new Error('Enter a valid address, compressed secp256k1 public key, or DID.');
}

// did:ethr:mainnet uses no prefix; all others use did:ethr:<name>:<identifier>
export const formatDID = (identifier, networkName) => {
  const prefix = networkName === 'mainnet' ? '' : `${networkName}:`;
  return `did:ethr:${prefix}${identifier.toLowerCase()}`;
};

// ── JSON syntax highlighter ───────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function syntaxHighlight(obj) {
  const json = escapeHtml(JSON.stringify(obj, null, 2));
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-num';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'json-key' : 'json-str';
      else if (/true|false/.test(match)) cls = 'json-bool';
      else if (/null/.test(match)) cls = 'json-null';
      return `<span class="${cls}">${match}</span>`;
    },
  );
}
