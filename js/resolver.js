/**
 * resolver.js – ethr-did-resolver configured for all supported networks.
 *
 * All networks are registered with the same provider so a single Resolver
 * instance can resolve any did:ethr:<network>:0x… DID without an RPC URL.
 */

import { getResolver, Resolver } from './imports.js';
import { SUPPORTED_NETWORKS } from './utils.js';

/**
 * Build a Resolver that covers every supported network, all using the
 * given provider for RPC calls.
 *
 * @param {import('ethers').BrowserProvider} provider
 */
export function createDidResolver(provider) {
  const networks = Object.values(SUPPORTED_NETWORKS).map(n => ({
    name:     n.name,
    chainId:  n.chainId,
    registry: n.registry,
    provider,
  }));
  return new Resolver(getResolver({ networks }));
}

/**
 * @param {string} did  e.g. "did:ethr:sepolia:0xabc…"
 * @param {import('ethers').BrowserProvider} provider
 * @returns {Promise<object>} DID document
 */
export async function resolveDID(did, provider) {
  const resolver = createDidResolver(provider);
  const result   = await resolver.resolve(did);
  if (result.didResolutionMetadata?.error) {
    throw new Error(
      result.didResolutionMetadata.error +
      (result.didResolutionMetadata.message ? ': ' + result.didResolutionMetadata.message : ''),
    );
  }
  return result.didDocument;
}
