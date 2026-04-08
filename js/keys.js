import { ethers } from './imports.js';
import { STORAGE_KEY } from './utils.js';

// ── Persistence ───────────────────────────────────────────────────────────

export const loadLocalKeys = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

export const saveLocalKeys = (keys) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));

// ── Key generation ────────────────────────────────────────────────────────

export function generateKeyPair() {
  const wallet = ethers.Wallet.createRandom();
  return {
    id:         crypto.randomUUID(),
    address:    wallet.address,
    privateKey: wallet.privateKey,
    publicKey:  wallet.signingKey.compressedPublicKey, // 0x02… or 0x03…
    created:    new Date().toISOString(),
    addedToDID: false,
    attrName:   null, // bytes32 hex used when added
    attrValue:  null, // hex value used when added
  };
}
