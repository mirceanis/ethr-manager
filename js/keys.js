import { ethers } from './imports.js';
import { STORAGE_KEY } from './utils.js';

const RELATIONSHIP_CONFIG = {
  assertionMethod: { attrSegment: 'veriKey', label: 'Assertion' },
  authentication:  { attrSegment: 'sigAuth', label: 'Authentication' },
  keyAgreement:    { attrSegment: 'enc',     label: 'Key Agreement' },
};

const KEY_TYPE_CONFIG = {
  Secp256k1: {
    label: 'Secp256k1',
    didType: 'Secp256k1',
    encoding: 'hex',
    defaultRelationship: 'assertionMethod',
    relationships: ['assertionMethod', 'authentication'],
  },
  Ed25519: {
    label: 'Ed25519',
    didType: 'Ed25519',
    encoding: 'base58',
    defaultRelationship: 'assertionMethod',
    relationships: ['assertionMethod', 'authentication'],
  },
  X25519: {
    label: 'X25519',
    didType: 'X25519',
    encoding: 'base58',
    defaultRelationship: 'keyAgreement',
    relationships: ['keyAgreement'],
  },
};

export const KEY_TYPE_OPTIONS = Object.keys(KEY_TYPE_CONFIG);

export const getAllowedRelationships = (keyType = 'Secp256k1') =>
  KEY_TYPE_CONFIG[keyType]?.relationships ?? KEY_TYPE_CONFIG.Secp256k1.relationships;

export const getDefaultRelationship = (keyType = 'Secp256k1') =>
  KEY_TYPE_CONFIG[keyType]?.defaultRelationship ?? KEY_TYPE_CONFIG.Secp256k1.defaultRelationship;

export const getRelationshipLabel = (relationship) =>
  RELATIONSHIP_CONFIG[relationship]?.label ?? relationship;

export const getKeyTypeLabel = (keyType = 'Secp256k1') =>
  KEY_TYPE_CONFIG[keyType]?.label ?? keyType;

function normalizeRelationship(keyType, relationship) {
  const allowed = getAllowedRelationships(keyType);
  return allowed.includes(relationship) ? relationship : getDefaultRelationship(keyType);
}

function normalizeLocalKey(key) {
  const type = KEY_TYPE_CONFIG[key.type] ? key.type : 'Secp256k1';
  const relationship = normalizeRelationship(type, key.relationship);
  return {
    ...key,
    type,
    relationship,
    publicKeyRaw: key.publicKeyRaw || key.publicKey,
    privateKeyFormat: key.privateKeyFormat || (type === 'Secp256k1' ? 'hex' : null),
  };
}

function buildLocalKey({
  type,
  address = null,
  privateKey = null,
  privateKeyFormat = null,
  publicKey,
  publicKeyRaw,
}) {
  return normalizeLocalKey({
    id: crypto.randomUUID(),
    type,
    relationship: getDefaultRelationship(type),
    address,
    privateKey,
    privateKeyFormat,
    publicKey,
    publicKeyRaw,
    created: new Date().toISOString(),
    attrName: null,
    attrValue: null,
  });
}

function bufferToBytes(buffer) {
  return new Uint8Array(buffer);
}

async function generateWebCryptoKeyPair(type, algorithm, keyUsages) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(`${type} key generation requires WebCrypto in a secure context.`);
  }

  let keyPair;
  try {
    keyPair = await globalThis.crypto.subtle.generateKey({ name: algorithm }, true, keyUsages);
  } catch {
    throw new Error(`${type} key generation is not supported in this browser.`);
  }

  const publicBytes = bufferToBytes(await globalThis.crypto.subtle.exportKey('raw', keyPair.publicKey));
  let privateKey = null;
  let privateKeyFormat = null;

  try {
    const privateBytes = bufferToBytes(await globalThis.crypto.subtle.exportKey('pkcs8', keyPair.privateKey));
    privateKey = ethers.encodeBase64(privateBytes);
    privateKeyFormat = 'pkcs8-base64';
  } catch {
    // Private key export is best-effort here; the app only needs the public key for DID updates.
  }

  return buildLocalKey({
    type,
    publicKey: ethers.encodeBase58(publicBytes),
    publicKeyRaw: ethers.hexlify(publicBytes),
    privateKey,
    privateKeyFormat,
  });
}

function isControllerKeyVm(didDocument, vm, key) {
  const identifier = didDocument?.id?.split(':').pop()?.toLowerCase();
  if (!identifier || !vm?.id?.endsWith('#controllerKey')) return false;
  return key.type === 'Secp256k1' && identifier === key.publicKeyRaw.toLowerCase();
}

export function getKeyAttributeInput(key) {
  const kp = normalizeLocalKey(key);
  const typeConfig = KEY_TYPE_CONFIG[kp.type];
  const relationship = normalizeRelationship(kp.type, kp.relationship);
  const purpose = RELATIONSHIP_CONFIG[relationship].attrSegment;

  return {
    name: `did/pub/${typeConfig.didType}/${purpose}/${typeConfig.encoding}`,
    relationship,
    value: kp.publicKeyRaw,
  };
}

export function getVerificationRelationships(didDocument, vm) {
  return Object.keys(RELATIONSHIP_CONFIG).filter(
    relationship => (didDocument?.[relationship] ?? []).includes(vm.id),
  );
}

export function keyMatchesVerificationMethod(key, vm, didDocument = null) {
  const kp = normalizeLocalKey(key);
  if (didDocument && isControllerKeyVm(didDocument, vm, kp)) return false;

  if (kp.type === 'Secp256k1') {
    return vm.publicKeyHex?.toLowerCase() === kp.publicKeyRaw.slice(2).toLowerCase();
  }

  if (kp.type === 'Ed25519') {
    return vm.type?.includes('Ed25519') && vm.publicKeyBase58 === kp.publicKey;
  }

  if (kp.type === 'X25519') {
    return vm.type?.includes('X25519') && vm.publicKeyBase58 === kp.publicKey;
  }

  return false;
}

export function isLocalKeyOnDidDocument(didDocument, key) {
  const kp = normalizeLocalKey(key);
  const relationshipIds = new Set(didDocument?.[kp.relationship] ?? []);
  return (didDocument?.verificationMethod ?? []).some(
    vm => relationshipIds.has(vm.id) && keyMatchesVerificationMethod(kp, vm, didDocument),
  );
}

// ── Persistence ───────────────────────────────────────────────────────────

export const loadLocalKeys = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeLocalKey); }
  catch { return []; }
};

export const saveLocalKeys = (keys) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));

// ── Key generation ────────────────────────────────────────────────────────

export async function generateKeyPair(type = 'Secp256k1') {
  if (type === 'Ed25519') {
    return generateWebCryptoKeyPair('Ed25519', 'Ed25519', ['sign', 'verify']);
  }

  if (type === 'X25519') {
    return generateWebCryptoKeyPair('X25519', 'X25519', ['deriveKey', 'deriveBits']);
  }

  const wallet = ethers.Wallet.createRandom();
  return buildLocalKey({
    type: 'Secp256k1',
    address: wallet.address,
    privateKey: wallet.privateKey,
    privateKeyFormat: 'hex',
    publicKey: wallet.signingKey.compressedPublicKey,
    publicKeyRaw: wallet.signingKey.compressedPublicKey,
  });
}
