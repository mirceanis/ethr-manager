/**
 * registry.js – wrappers around the EthereumDIDRegistry contract.
 *
 * useRegistry(identity, ethersSigner, network, onSuccess, localSignerKey?)
 *   network        – entry from SUPPORTED_NETWORKS (has .registry), or null
 *   localSignerKey – when set, operations use meta-transactions (EthrDidController)
 */

import { useState, useCallback } from './imports.js';
import { ethers, EthrDidController } from './imports.js';
import { KEY_VALIDITY_DEFAULT } from './utils.js';
import { getKeyAttributeInput, getRelationshipAttrSegment } from './keys.js';

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

/** Sign a hash with a local private key, returning {sigV, sigR, sigS}. */
function signHash(hash, privateKey) {
  const sig = new ethers.SigningKey(privateKey).sign(hash);
  return { sigV: sig.v, sigR: sig.r, sigS: sig.s };
}

/**
 * @param {string|null} identity
 * @param {import('ethers').JsonRpcSigner|null} ethersSigner
 * @param {{ registry: string, name: string, legacyNonce: boolean }|null} network
 * @param {(msg: string, txHash: string) => void} onSuccess
 * @param {{ privateKey: string, address: string }|null} localSignerKey – local key for meta-tx
 */
export function useRegistry(identity, ethersSigner, network, onSuccess, localSignerKey = null) {
  const [txPending, setTxPending] = useState(false);
  const [txError,   setTxError]   = useState(null);
  const [txHash,    setTxHash]    = useState(null);

  /** Run a tx function.  Handles both TransactionResponse (direct) and
   *  TransactionReceipt (EthrDidController signed — already waited). */
  const runTx = useCallback(async (txFn, successMsg) => {
    setTxError(null); setTxPending(true); setTxHash(null);
    try {
      const result = await txFn();
      setTxHash(result.hash);
      if (typeof result.wait === 'function') await result.wait();
      onSuccess(successMsg || 'Transaction confirmed.', result.hash);
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

  const getEthrController = useCallback(
    () => new EthrDidController(
      identity,
      undefined,          // contract — built internally
      ethersSigner,       // relay signer (gas payer + provider)
      network?.name,
      undefined,          // provider
      undefined,          // rpcUrl
      network?.registry,
      network?.legacyNonce ?? true,
    ),
    [identity, ethersSigner, network],
  );

  // ── Key operations ────────────────────────────────────────────────────
  const addKey = useCallback(async (kp, validity = KEY_VALIDITY_DEFAULT) => {
    if (!network || !identity) return null;
    const attrInput = getKeyAttributeInput(kp);
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createSetAttributeHash(attrInput.name, attrInput.value, validity);
      const sig  = signHash(hash, localSignerKey.privateKey);
      const ok   = await runTx(
        () => ctrl.setAttributeSigned(attrInput.name, attrInput.value, validity, sig),
        'Key added to DID document (signed).',
      );
      return ok ? { attrName: toBytes32(attrInput.name), attrValue: attrInput.value } : null;
    }
    if (!ethersSigner) return null;
    const attrName  = toBytes32(attrInput.name);
    const attrValue = ethers.getBytes(attrInput.value);
    const ok = await runTx(
      () => getContract().setAttribute(identity, attrName, attrValue, validity),
      'Key added to DID document.',
    );
    return ok ? { attrName, attrValue: attrInput.value } : null;
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  const removeKey = useCallback(async (kp) => {
    if (!network || !identity) return;
    const attrInput = getKeyAttributeInput(kp);
    if (localSignerKey) {
      const ctrl = getEthrController();
      const name  = attrInput.name;
      const value = kp.attrValue || attrInput.value;
      const hash  = await ctrl.createRevokeAttributeHash(name, value);
      const sig   = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.revokeAttributeSigned(name, value, sig),
        'Key removed from DID document (signed).',
      );
    }
    if (!ethersSigner) return;
    const attrName  = kp.attrName  || toBytes32(attrInput.name);
    const attrValue = ethers.getBytes(kp.attrValue || attrInput.value);
    return runTx(
      () => getContract().revokeAttribute(identity, attrName, attrValue),
      'Key removed from DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  const addRawKey = useCallback(async (type, hexValue, relationship, validity = KEY_VALIDITY_DEFAULT) => {
    if (!network || !identity) return;
    const purpose = getRelationshipAttrSegment(relationship);
    const nameStr = `did/pub/${type}/${purpose}`;
    if (ethers.toUtf8Bytes(nameStr).length > 32) {
      setTxError(`Attribute name too long (${ethers.toUtf8Bytes(nameStr).length}/32 bytes): "${nameStr}"`);
      return;
    }
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createSetAttributeHash(nameStr, hexValue, validity);
      const sig  = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.setAttributeSigned(nameStr, hexValue, validity, sig),
        'Key material added to DID document (signed).',
      );
    }
    if (!ethersSigner) return;
    let valueBytes;
    try {
      valueBytes = ethers.getBytes(hexValue);
    } catch {
      setTxError('Invalid hex value for key material.');
      return;
    }
    return runTx(
      () => getContract().setAttribute(identity, toBytes32(nameStr), valueBytes, validity),
      'Key material added to DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  const removeExternalKey = useCallback(async (nameStr, valueHex) => {
    if (!network || !identity) return;
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createRevokeAttributeHash(nameStr, valueHex);
      const sig  = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.revokeAttributeSigned(nameStr, valueHex, sig),
        'Key removed from DID document (signed).',
      );
    }
    if (!ethersSigner) return;
    return runTx(
      () => getContract().revokeAttribute(identity, toBytes32(nameStr), ethers.getBytes(valueHex)),
      'Key removed from DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  // ── Service operations ────────────────────────────────────────────────
  const addService = useCallback(async (svcType, svcEndpoint, validity = KEY_VALIDITY_DEFAULT) => {
    if (!network || !identity) return;
    const sanitized = svcType.trim().replace(/\s+/g, '');
    const endpoint  = normalizeServiceEndpoint(svcEndpoint);
    const nameStr   = `did/svc/${sanitized}`;
    if (ethers.toUtf8Bytes(nameStr).length > 32) {
      setTxError('Service type is too long (max ~22 chars).');
      return;
    }
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createSetAttributeHash(nameStr, ethers.hexlify(ethers.toUtf8Bytes(endpoint)), validity);
      const sig  = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.setAttributeSigned(nameStr, ethers.hexlify(ethers.toUtf8Bytes(endpoint)), validity, sig),
        'Service added to DID document (signed).',
      );
    }
    if (!ethersSigner) return;
    return runTx(
      () => getContract().setAttribute(identity, toBytes32(nameStr), ethers.toUtf8Bytes(endpoint), validity),
      'Service added to DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  const removeService = useCallback(async (svc) => {
    if (!network || !identity) return;
    const endpoint = typeof svc.serviceEndpoint === 'string'
      ? svc.serviceEndpoint
      : JSON.stringify(svc.serviceEndpoint);
    const nameStr = `did/svc/${svc.type}`;
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createRevokeAttributeHash(nameStr, ethers.hexlify(ethers.toUtf8Bytes(endpoint)));
      const sig  = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.revokeAttributeSigned(nameStr, ethers.hexlify(ethers.toUtf8Bytes(endpoint)), sig),
        'Service removed from DID document (signed).',
      );
    }
    if (!ethersSigner) return;
    return runTx(
      () => getContract().revokeAttribute(identity, toBytes32(nameStr), ethers.toUtf8Bytes(endpoint)),
      'Service removed from DID document.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  // ── Ownership operations ──────────────────────────────────────────────
  const transferOwnership = useCallback(async (newOwner) => {
    if (!network || !identity) return;
    let addr;
    try { addr = ethers.getAddress(newOwner.trim()); }
    catch { setTxError('Invalid Ethereum address.'); return; }
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createChangeOwnerHash(addr);
      const sig  = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.changeOwnerSigned(addr, sig),
        'DID ownership transferred (signed).',
      );
    }
    if (!ethersSigner) return;
    return runTx(
      () => getContract().changeOwner(identity, addr),
      'DID ownership transferred.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  const deactivate = useCallback(async () => {
    if (!network || !identity) return;
    if (localSignerKey) {
      const ctrl = getEthrController();
      const hash = await ctrl.createChangeOwnerHash(ethers.ZeroAddress);
      const sig  = signHash(hash, localSignerKey.privateKey);
      return runTx(
        () => ctrl.changeOwnerSigned(ethers.ZeroAddress, sig),
        'DID deactivated (signed).',
      );
    }
    if (!ethersSigner) return;
    return runTx(
      () => getContract().changeOwner(identity, ethers.ZeroAddress),
      'DID deactivated.',
    );
  }, [ethersSigner, network, identity, runTx, getContract, getEthrController, localSignerKey]);

  return {
    txPending,
    txError,
    txHash,
    clearTxError: () => setTxError(null),
    addKey,
    removeKey,
    addRawKey,
    removeExternalKey,
    addService,
    removeService,
    transferOwnership,
    deactivate,
  };
}
