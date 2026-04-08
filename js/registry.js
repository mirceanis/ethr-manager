/**
 * registry.js – wrappers around the EthereumDIDRegistry contract.
 *
 * useRegistry(account, ethersSigner, network, onSuccess)
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

/**
 * @param {string|null} account
 * @param {import('ethers').JsonRpcSigner|null} ethersSigner
 * @param {{ registry: string }|null} network  – current supported network, or null
 * @param {(msg: string, txHash: string) => void} onSuccess
 */
export function useRegistry(account, ethersSigner, network, onSuccess) {
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

  const getIdentity = useCallback(
    () => ethersSigner.getAddress(),
    [ethersSigner],
  );

  const getContract = useCallback(
    () => new ethers.Contract(network?.registry, REGISTRY_ABI, ethersSigner),
    [ethersSigner, network],
  );

  // ── Key operations ────────────────────────────────────────────────────
  const addKey = useCallback(async (kp, validity = KEY_VALIDITY_DEFAULT) => {
    if (!ethersSigner || !network) return null;
    const identity  = await getIdentity();
    const attrName  = toBytes32('did/pub/Secp256k1/veriKey/hex');
    const attrValue = ethers.getBytes(kp.publicKey);
    const ok = await runTx(
      () => getContract().setAttribute(identity, attrName, attrValue, validity),
      'Key added to DID document.',
    );
    return ok ? { attrName, attrValue: kp.publicKey } : null;
  }, [ethersSigner, network, runTx, getContract, getIdentity]);

  const removeKey = useCallback(async (kp) => {
    if (!ethersSigner || !network) return;
    const identity  = await getIdentity();
    const attrName  = kp.attrName  || toBytes32('did/pub/Secp256k1/veriKey/hex');
    const attrValue = ethers.getBytes(kp.attrValue || kp.publicKey);
    return runTx(
      () => getContract().revokeAttribute(identity, attrName, attrValue),
      'Key removed from DID document.',
    );
  }, [ethersSigner, network, runTx, getContract, getIdentity]);

  // ── Service operations ────────────────────────────────────────────────
  const addService = useCallback(async (svcType, svcEndpoint, validity = KEY_VALIDITY_DEFAULT) => {
    if (!ethersSigner || !network) return;
    const identity  = await getIdentity();
    const sanitized = svcType.trim().replace(/\s+/g, '');
    const nameStr   = `did/svc/${sanitized}`;
    if (ethers.toUtf8Bytes(nameStr).length > 32) {
      setTxError('Service type is too long (max ~22 chars).');
      return;
    }
    return runTx(
      () => getContract().setAttribute(identity, toBytes32(nameStr), ethers.toUtf8Bytes(svcEndpoint.trim()), validity),
      'Service added to DID document.',
    );
  }, [ethersSigner, network, runTx, getContract, getIdentity]);

  const removeService = useCallback(async (svc) => {
    if (!ethersSigner || !network) return;
    const identity = await getIdentity();
    return runTx(
      () => getContract().revokeAttribute(identity, toBytes32(`did/svc/${svc.type}`), ethers.toUtf8Bytes(svc.serviceEndpoint)),
      'Service removed from DID document.',
    );
  }, [ethersSigner, network, runTx, getContract, getIdentity]);

  // ── Ownership operations ──────────────────────────────────────────────
  const transferOwnership = useCallback(async (newOwner) => {
    if (!ethersSigner || !network) return;
    let addr;
    try { addr = ethers.getAddress(newOwner.trim()); }
    catch { setTxError('Invalid Ethereum address.'); return; }
    const identity = await getIdentity();
    return runTx(
      () => getContract().changeOwner(identity, addr),
      'DID ownership transferred.',
    );
  }, [ethersSigner, network, runTx, getContract, getIdentity]);

  const deactivate = useCallback(async () => {
    if (!ethersSigner || !network) return;
    const identity = await getIdentity();
    return runTx(
      () => getContract().changeOwner(identity, '0x000000000000000000000000000000000000dEaD'),
      'DID deactivated.',
    );
  }, [ethersSigner, network, runTx, getContract, getIdentity]);

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
