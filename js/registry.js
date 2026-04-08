/**
 * registry.js – wrappers around the EthereumDIDRegistry contract.
 *
 * useRegistry(identity, ethersSigner, network, onSuccess)
 *   network – entry from SUPPORTED_NETWORKS (has .registry), or null
 */

import { useState, useCallback } from './imports.js';
import { ethers } from './imports.js';
import { KEY_VALIDITY_DEFAULT } from './utils.js';

const REGISTRY_ABI = [
  'function setAttribute(address identity, bytes32 name, bytes value, uint validity)',
  'function revokeAttribute(address identity, bytes32 name, bytes value)',
  'function changeOwner(address identity, address newOwner)',
];

function toBytes32(str) {
  const bytes = ethers.toUtf8Bytes(str);
  if (bytes.length > 32) throw new Error(`String too long for bytes32: "${str}"`);
  const padded = new Uint8Array(32);
  padded.set(bytes);
  return ethers.hexlify(padded);
}

function normalizeServiceEndpoint(value) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try { return JSON.stringify(JSON.parse(trimmed)); }
  catch { return trimmed; }
}

/**
 * @param {string|null} identity
 * @param {import('ethers').JsonRpcSigner|null} ethersSigner
 * @param {{ registry: string }|null} network  – current supported network, or null
 * @param {(msg: string, txHash: string) => void} onSuccess
 */
export function useRegistry(identity, ethersSigner, network, onSuccess) {
  const [txPending, setTxPending] = useState(false);
  const [txError,   setTxError]   = useState(null);
  const [txHash,    setTxHash]    = useState(null);

  const runTx = useCallback(async (txFn, successMsg) => {
    setTxError(null); setTxPending(true); setTxHash(null);
    try {
      const tx = await txFn();
      setTxHash(tx.hash);
      await tx.wait();
      onSuccess(successMsg || 'Transaction confirmed.', tx.hash);
      return true;
    } catch (e) {
      setTxError(e.reason || e.message || 'Transaction failed.');
      return false;
    } finally {
      setTxPending(false);
    }
  }, [onSuccess]);

  const getContract = useCallback(
    () => new ethers.Contract(network?.registry, REGISTRY_ABI, ethersSigner),
    [ethersSigner, network],
  );

  // ── Key operations ────────────────────────────────────────────────────
  const addKey = useCallback(async (kp, validity = KEY_VALIDITY_DEFAULT) => {
    if (!ethersSigner || !network || !identity) return null;
    const attrName  = toBytes32('did/pub/Secp256k1/veriKey/hex');
    const attrValue = ethers.getBytes(kp.publicKey);
    const ok = await runTx(
      () => getContract().setAttribute(identity, attrName, attrValue, validity),
      'Key added to DID document.',
    );
    return ok ? { attrName, attrValue: kp.publicKey } : null;
  }, [ethersSigner, network, identity, runTx, getContract]);

  const removeKey = useCallback(async (kp) => {
    if (!ethersSigner || !network || !identity) return;
    const attrName  = kp.attrName  || toBytes32('did/pub/Secp256k1/veriKey/hex');
    const attrValue = ethers.getBytes(kp.attrValue || kp.publicKey);
    return runTx(
      () => getContract().revokeAttribute(identity, attrName, attrValue),
      'Key removed from DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract]);

  // ── Service operations ────────────────────────────────────────────────
  const addService = useCallback(async (svcType, svcEndpoint, validity = KEY_VALIDITY_DEFAULT) => {
    if (!ethersSigner || !network || !identity) return;
    const sanitized = svcType.trim().replace(/\s+/g, '');
    const endpoint  = normalizeServiceEndpoint(svcEndpoint);
    const nameStr   = `did/svc/${sanitized}`;
    if (ethers.toUtf8Bytes(nameStr).length > 32) {
      setTxError('Service type is too long (max ~22 chars).');
      return;
    }
    return runTx(
      () => getContract().setAttribute(identity, toBytes32(nameStr), ethers.toUtf8Bytes(endpoint), validity),
      'Service added to DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract]);

  const removeService = useCallback(async (svc) => {
    if (!ethersSigner || !network || !identity) return;
    const endpoint = typeof svc.serviceEndpoint === 'string'
      ? svc.serviceEndpoint
      : JSON.stringify(svc.serviceEndpoint);
    return runTx(
      () => getContract().revokeAttribute(identity, toBytes32(`did/svc/${svc.type}`), ethers.toUtf8Bytes(endpoint)),
      'Service removed from DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract]);

  // ── Ownership operations ──────────────────────────────────────────────
  const transferOwnership = useCallback(async (newOwner) => {
    if (!ethersSigner || !network || !identity) return;
    let addr;
    try { addr = ethers.getAddress(newOwner.trim()); }
    catch { setTxError('Invalid Ethereum address.'); return; }
    return runTx(
      () => getContract().changeOwner(identity, addr),
      'DID ownership transferred.',
    );
  }, [ethersSigner, network, identity, runTx, getContract]);

  const deactivate = useCallback(async () => {
    if (!ethersSigner || !network || !identity) return;
    return runTx(
      () => getContract().changeOwner(identity, '0x000000000000000000000000000000000000dEaD'),
      'DID deactivated.',
    );
  }, [ethersSigner, network, identity, runTx, getContract]);

  return {
    txPending,
    txError,
    txHash,
    clearTxError: () => setTxError(null),
    addKey,
    removeKey,
    addService,
    removeService,
    transferOwnership,
    deactivate,
  };
}
