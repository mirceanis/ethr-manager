import { ethers } from './imports.js';
import { STORAGE_KEY } from './utils.js';

const RELATIONSHIP_CONFIG = {
  assertionMethod: { attrSegment: 'veriKey', label: 'Assertion' },
  authentication:  { attrSegment: 'sigAuth', label: 'Authentication' },
  keyAgreement:    { attrSegment: 'enc',     label: 'Key Agreement' },
};

// Reverse mapping from DID document VM types to the algorithm segment used in
// ERC-1056 setAttribute names (did/pub/<algorithm>/…).
const VM_TYPE_TO_ALGORITHM = {
  EcdsaSecp256k1VerificationKey2019: 'Secp256k1',
  EcdsaSecp256k1RecoveryMethod2020: 'Secp256k1',
  Ed25519VerificationKey2018:       'Ed25519',
  Ed25519VerificationKey2020:       'Ed25519',
  X25519KeyAgreementKey2019:        'X25519',
  X25519KeyAgreementKey2020:        'X25519',
  RSAVerificationKey2018:           'RSA',
  Multikey:                         'Multikey',
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
  Multikey: {
    label: 'Multikey',
    didType: 'Multikey',
    encoding: null, // multicodec prefix is embedded in the value; no encoding hint in attr name
    defaultRelationship: 'assertionMethod',
    relationships: ['assertionMethod', 'authentication', 'keyAgreement'],
  },
};

// Per-algorithm config for the Multikey VM type.
// multicodecPrefix: varint-encoded multicodec bytes prepended to raw public key bytes on-chain.
const MULTIKEY_ALGORITHM_CONFIG = {
  'BLS12-381-G2':     { label: 'BLS12-381 G2',       multicodecPrefix: new Uint8Array([0xEB, 0x01]), relationships: ['assertionMethod', 'authentication'], defaultRelationship: 'assertionMethod' },
  'P-256':            { label: 'P-256',               multicodecPrefix: new Uint8Array([0x80, 0x24]), relationships: ['assertionMethod', 'authentication'], defaultRelationship: 'assertionMethod' },
  'ML-DSA-44':        { label: 'ML-DSA-44',           multicodecPrefix: new Uint8Array([0x90, 0x24]), relationships: ['assertionMethod', 'authentication'], defaultRelationship: 'assertionMethod' },
  'SLH-DSA-Shake-256f': { label: 'SLH-DSA-Shake-256f', multicodecPrefix: new Uint8Array([0xAB, 0x24]), relationships: ['assertionMethod', 'authentication'], defaultRelationship: 'assertionMethod' },
  'ML-KEM-768':       { label: 'ML-KEM-768',          multicodecPrefix: new Uint8Array([0x8C, 0x24]), relationships: ['keyAgreement'],                    defaultRelationship: 'keyAgreement'    },
  'Secp256k1':        { label: 'Secp256k1',           multicodecPrefix: new Uint8Array([0xE7, 0x01]), relationships: ['assertionMethod', 'authentication'], defaultRelationship: 'assertionMethod' },
  'Ed25519':          { label: 'Ed25519',             multicodecPrefix: new Uint8Array([0xED, 0x01]), relationships: ['assertionMethod', 'authentication'], defaultRelationship: 'assertionMethod' },
  'X25519':           { label: 'X25519',              multicodecPrefix: new Uint8Array([0xEC, 0x01]), relationships: ['keyAgreement'],                    defaultRelationship: 'keyAgreement'    },
};

export const KEY_TYPE_OPTIONS = Object.keys(KEY_TYPE_CONFIG);
export const MULTIKEY_ALGORITHM_OPTIONS = Object.keys(MULTIKEY_ALGORITHM_CONFIG);

export const ALL_RELATIONSHIPS = Object.keys(RELATIONSHIP_CONFIG);

export const getRelationshipAttrSegment = (relationship) =>
  RELATIONSHIP_CONFIG[relationship]?.attrSegment ?? relationship;

export const getAllowedRelationships = (keyType = 'Secp256k1', multikeyAlgorithm = null) => {
  if (keyType === 'Multikey' && multikeyAlgorithm)
    return MULTIKEY_ALGORITHM_CONFIG[multikeyAlgorithm]?.relationships ?? KEY_TYPE_CONFIG.Multikey.relationships;
  return KEY_TYPE_CONFIG[keyType]?.relationships ?? KEY_TYPE_CONFIG.Secp256k1.relationships;
};

export const getDefaultRelationship = (keyType = 'Secp256k1', multikeyAlgorithm = null) => {
  if (keyType === 'Multikey' && multikeyAlgorithm)
    return MULTIKEY_ALGORITHM_CONFIG[multikeyAlgorithm]?.defaultRelationship ?? 'assertionMethod';
  return KEY_TYPE_CONFIG[keyType]?.defaultRelationship ?? KEY_TYPE_CONFIG.Secp256k1.defaultRelationship;
};

export const getRelationshipLabel = (relationship) =>
  RELATIONSHIP_CONFIG[relationship]?.label ?? relationship;

export const getKeyTypeLabel = (keyType = 'Secp256k1', multikeyAlgorithm = null) => {
  if (keyType === 'Multikey') {
    const algoLabel = multikeyAlgorithm && MULTIKEY_ALGORITHM_CONFIG[multikeyAlgorithm]
      ? MULTIKEY_ALGORITHM_CONFIG[multikeyAlgorithm].label : null;
    return algoLabel ? `Multikey · ${algoLabel}` : 'Multikey';
  }
  return KEY_TYPE_CONFIG[keyType]?.label ?? keyType;
};

export const getMultikeyAlgorithmLabel = (algorithm) =>
  MULTIKEY_ALGORITHM_CONFIG[algorithm]?.label ?? algorithm;

function normalizeRelationship(keyType, relationship, multikeyAlgorithm = null) {
  const allowed = getAllowedRelationships(keyType, multikeyAlgorithm);
  return allowed.includes(relationship) ? relationship : getDefaultRelationship(keyType, multikeyAlgorithm);
}

function normalizeLocalKey(key) {
  const type = KEY_TYPE_CONFIG[key.type] ? key.type : 'Secp256k1';
  const multikeyAlgorithm = type === 'Multikey' ? (key.multikeyAlgorithm ?? null) : undefined;
  const relationship = normalizeRelationship(type, key.relationship, multikeyAlgorithm);
  return {
    ...key,
    type,
    multikeyAlgorithm,
    relationship,
    publicKeyRaw: key.publicKeyRaw || key.publicKey,
    privateKeyFormat: key.privateKeyFormat || (type === 'Secp256k1' ? 'hex' : null),
  };
}

function buildLocalKey({
  type,
  multikeyAlgorithm = null,
  address = null,
  privateKey = null,
  privateKeyFormat = null,
  publicKey,
  publicKeyRaw,
}) {
  return normalizeLocalKey({
    id: crypto.randomUUID(),
    type,
    multikeyAlgorithm,
    relationship: getDefaultRelationship(type, multikeyAlgorithm),
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
  const purpose = RELATIONSHIP_CONFIG[kp.relationship]?.attrSegment ?? 'veriKey';

  if (kp.type === 'Multikey') {
    // Multikey attr name has no encoding hint; the multicodec prefix is embedded in the value.
    return { name: `did/pub/Multikey/${purpose}`, relationship: kp.relationship, value: kp.publicKeyRaw };
  }

  const typeConfig = KEY_TYPE_CONFIG[kp.type];
  return {
    name: `did/pub/${typeConfig.didType}/${purpose}/${typeConfig.encoding}`,
    relationship: kp.relationship,
    value: kp.publicKeyRaw,
  };
}

/**
 * Decode a base64url string to a Uint8Array.
 * JWK coordinate values use base64url (RFC 7517) without padding.
 */
function base64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
  return ethers.decodeBase64(padded);
}

/**
 * Convert a secp256k1 EC JWK to a 0x-prefixed hex-encoded compressed public key.
 * Returns null when the JWK is not a recognised secp256k1 key.
 */
function secp256k1JwkToCompressedHex(jwk) {
  if (jwk?.kty !== 'EC' || jwk?.crv !== 'secp256k1' || !jwk.x || !jwk.y) return null;
  try {
    const xBytes = base64urlToBytes(jwk.x);
    const yBytes = base64urlToBytes(jwk.y);
    const prefix = (yBytes[yBytes.length - 1] & 1) === 0 ? 0x02 : 0x03;
    const compressed = new Uint8Array(33);
    compressed[0] = prefix;
    compressed.set(xBytes, 1);
    return ethers.hexlify(compressed);
  } catch {
    return null;
  }
}

/**
 * Return a human-readable string for the key material carried by a
 * verification method, regardless of which encoding the resolver used.
 * Returns an empty string when no recognised field is present.
 */
export function getVmDisplayMaterial(vm) {
  if (vm.publicKeyHex != null) {
    const hex = vm.publicKeyHex;
    return hex.startsWith('0x') ? hex : '0x' + hex;
  }
  if (vm.publicKeyBase58 != null)   return vm.publicKeyBase58;
  if (vm.publicKeyBase64 != null)   return vm.publicKeyBase64;
  if (vm.publicKeyMultibase != null) return vm.publicKeyMultibase;
  if (vm.publicKeyJwk != null) {
    const compressed = secp256k1JwkToCompressedHex(vm.publicKeyJwk);
    if (compressed != null) return compressed;
    return JSON.stringify(vm.publicKeyJwk);
  }
  if (vm.blockchainAccountId != null) return vm.blockchainAccountId;
  return '';
}

export function getVerificationRelationships(didDocument, vm) {
  return Object.keys(RELATIONSHIP_CONFIG).filter(
    relationship => (didDocument?.[relationship] ?? []).includes(vm.id),
  );
}

/**
 * Reconstruct the ERC-1056 attribute name and raw value from a resolved
 * verification method so that `revokeAttribute` can be called without
 * possessing the private key.
 */
export function vmToAttributeInput(vm, didDocument) {
  const algorithm = VM_TYPE_TO_ALGORITHM[vm.type] ?? vm.type;

  let encoding, value;
  if (vm.publicKeyHex != null) {
    encoding = 'hex';
    value = vm.publicKeyHex.startsWith('0x') ? vm.publicKeyHex : '0x' + vm.publicKeyHex;
  } else if (vm.publicKeyBase58 != null) {
    encoding = 'base58';
    value = ethers.toBeHex(ethers.decodeBase58(vm.publicKeyBase58));
  } else if (vm.publicKeyBase64 != null) {
    encoding = 'base64';
    value = ethers.hexlify(ethers.decodeBase64(vm.publicKeyBase64));
  } else if (vm.publicKeyMultibase != null) {
    if (!vm.publicKeyMultibase.startsWith('z'))
      throw new Error(`Unsupported multibase encoding: '${vm.publicKeyMultibase[0]}'`);
    // base58btc — value already carries the multicodec prefix; no encoding hint in name.
    encoding = null;
    value = ethers.toBeHex(ethers.decodeBase58(vm.publicKeyMultibase.slice(1)));
  } else {
    throw new Error('Cannot determine key encoding from verification method.');
  }

  const relationships = getVerificationRelationships(didDocument, vm);
  const relationship = relationships[0] ?? 'assertionMethod';
  const purpose = RELATIONSHIP_CONFIG[relationship]?.attrSegment ?? 'veriKey';

  const name = encoding
    ? `did/pub/${algorithm}/${purpose}/${encoding}`
    : `did/pub/${algorithm}/${purpose}`;
  return { name, value };
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

  if (kp.type === 'Multikey') {
    if (!vm.publicKeyMultibase?.startsWith('z')) return false;
    // Decode base58btc and compare hex — both include the multicodec prefix.
    const vmHex = ethers.toBeHex(ethers.decodeBase58(vm.publicKeyMultibase.slice(1)));
    return vmHex.toLowerCase() === kp.publicKeyRaw.toLowerCase();
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

// ── Controller key lookup ─────────────────────────────────────────────────

/**
 * Find a local Secp256k1 key whose Ethereum address matches the given
 * controller address.  Returns the key object or null.
 */
export function findControllerKey(localKeys, controllerAddress) {
  if (!controllerAddress) return null;
  const target = controllerAddress.toLowerCase();
  return localKeys.find(k =>
    k.type === 'Secp256k1' && k.privateKey && k.address?.toLowerCase() === target,
  ) ?? null;
}

// ── Persistence ───────────────────────────────────────────────────────────

export const loadLocalKeys = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').map(normalizeLocalKey); }
  catch { return []; }
};

export const saveLocalKeys = (keys) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));

// ── Key generation ────────────────────────────────────────────────────────

/** Generate a Multikey key pair for the given algorithm, prepending the multicodec prefix. */
async function generateMultikeyPair(algorithm) {
  const config = MULTIKEY_ALGORITHM_CONFIG[algorithm];
  if (!config) throw new Error(`Unknown Multikey algorithm: ${algorithm}`);
  const prefix = config.multicodecPrefix;

  let pubBytes, privateKey, privateKeyFormat;

  switch (algorithm) {
    case 'BLS12-381-G2': {
      // shortSignatures → G2 public keys (96 bytes)
      const { bls12_381 } = await import('@noble/curves/bls12-381.js');
      const { secretKey, publicKey: pubPoint } = bls12_381.shortSignatures.keygen();
      pubBytes = pubPoint.toBytes();
      privateKey = ethers.hexlify(secretKey);
      privateKeyFormat = 'hex';
      break;
    }
    case 'P-256': {
      const { p256 } = await import('@noble/curves/nist.js');
      const { secretKey, publicKey } = p256.keygen();
      pubBytes = publicKey; // 33-byte compressed Uint8Array
      privateKey = ethers.hexlify(secretKey);
      privateKeyFormat = 'hex';
      break;
    }
    case 'ML-DSA-44': {
      const { ml_dsa44 } = await import('@noble/post-quantum/ml-dsa.js');
      const { secretKey, publicKey } = ml_dsa44.keygen();
      pubBytes = publicKey; // 1312 bytes
      privateKey = ethers.encodeBase64(secretKey);
      privateKeyFormat = 'base64';
      break;
    }
    case 'SLH-DSA-Shake-256f': {
      const { slh_dsa_shake_256f } = await import('@noble/post-quantum/slh-dsa.js');
      const { secretKey, publicKey } = slh_dsa_shake_256f.keygen();
      pubBytes = publicKey; // 64 bytes
      privateKey = ethers.encodeBase64(secretKey);
      privateKeyFormat = 'base64';
      break;
    }
    case 'ML-KEM-768': {
      const { ml_kem768 } = await import('@noble/post-quantum/ml-kem.js');
      const { secretKey, publicKey } = ml_kem768.keygen();
      pubBytes = publicKey; // 1184 bytes
      privateKey = ethers.encodeBase64(secretKey);
      privateKeyFormat = 'base64';
      break;
    }
    case 'Secp256k1': {
      const wallet = ethers.Wallet.createRandom();
      pubBytes = ethers.getBytes(wallet.signingKey.compressedPublicKey);
      privateKey = wallet.privateKey;
      privateKeyFormat = 'hex';
      break;
    }
    case 'Ed25519': {
      const kp = await generateWebCryptoKeyPair('Ed25519', 'Ed25519', ['sign', 'verify']);
      pubBytes = ethers.getBytes(kp.publicKeyRaw);
      privateKey = kp.privateKey;
      privateKeyFormat = kp.privateKeyFormat;
      break;
    }
    case 'X25519': {
      const kp = await generateWebCryptoKeyPair('X25519', 'X25519', ['deriveKey', 'deriveBits']);
      pubBytes = ethers.getBytes(kp.publicKeyRaw);
      privateKey = kp.privateKey;
      privateKeyFormat = kp.privateKeyFormat;
      break;
    }
    default:
      throw new Error(`Key generation not supported for Multikey algorithm: ${algorithm}`);
  }

  // Prepend multicodec prefix; ethers.concat returns a hex string.
  const publicKeyRaw = ethers.concat([prefix, pubBytes]);
  return buildLocalKey({ type: 'Multikey', multikeyAlgorithm: algorithm, privateKey, privateKeyFormat, publicKey: publicKeyRaw, publicKeyRaw });
}

export async function generateKeyPair(type = 'Secp256k1', multikeyAlgorithm = null) {
  if (type === 'Multikey') {
    return generateMultikeyPair(multikeyAlgorithm ?? 'BLS12-381-G2');
  }

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
