/**
 * resolver.js – ethr-did-resolver configured for all supported networks.
 *
 * All networks are registered with the same provider so a single Resolver
 * instance can resolve any did:ethr:<network>:0x… DID without an RPC URL.
 *
 * A WeakMap keyed by provider instance keeps one Resolver alive for as long
 * as the provider is in use.  When the wallet or network changes and the
 * caller replaces its BrowserProvider, the old entry becomes eligible for GC
 * and the new provider gets a fresh Resolver — preserving the in-memory
 * resolution cache across repeated calls within the same session.
 */

import { getResolver, Resolver } from './imports.js';
import { SUPPORTED_NETWORKS } from './utils.js';

/** @type {WeakMap<object, import('did-resolver').Resolver>} */
const resolverCache = new WeakMap();

/**
 * Build a Resolver that covers every supported network, all using the
 * given provider for RPC calls.
 *
 * @param {import('ethers').BrowserProvider} provider
 * @returns {import('did-resolver').Resolver}
 */
function createDidResolver(provider) {
  const networks = Object.values(SUPPORTED_NETWORKS).map(n => ({
    name:     n.name,
    chainId:  n.chainId,
    registry: n.registry,
    provider,
  }));
  return new Resolver(getResolver({ networks }));
}

/**
 * Return the cached Resolver for this provider, creating one on first use.
 *
 * @param {import('ethers').BrowserProvider} provider
 * @returns {import('did-resolver').Resolver}
 */
export function getDidResolver(provider) {
  if (!resolverCache.has(provider)) {
    resolverCache.set(provider, createDidResolver(provider));
  }
  return resolverCache.get(provider);
}

/**
 * @param {string} did  e.g. "did:ethr:sepolia:0xabc…"
 * @param {import('ethers').BrowserProvider} provider
 * @returns {Promise<object>} DID document
 */
export async function resolveDID(did, provider) {
  const resolver = getDidResolver(provider);
  const result   = await resolver.resolve(did);
  if (result.didResolutionMetadata?.error) {
    throw new Error(
      result.didResolutionMetadata.error +
      (result.didResolutionMetadata.message ? ': ' + result.didResolutionMetadata.message : ''),
    );
  }
  return result.didDocument;
}
