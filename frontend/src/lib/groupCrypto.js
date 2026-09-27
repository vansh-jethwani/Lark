// Group E2EE utilities (sender-key style).
//
// Each group has a symmetric AES-256-GCM key, versioned. The server NEVER sees
// the plaintext key: it only stores per-member wrapped copies. Wrapping uses
// ECDH between the rotating member's private key and the target member's
// public key (the same P-256 keys used for direct-message E2EE), then AES-GCM
// key wrapping. Unwrapping needs the member's own private key plus the
// wrapper's public key (stored alongside the rotation on the server).
//
// Keys are cached per group+version in memory only — on reload the client
// re-fetches its wrapped copy and unwraps it again.

import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  deriveSharedSecret,
  exportPublicKey,
  getKeyPair,
  importPublicKey,
} from "./crypto.js";
import { axiosInstance } from "./axios.js";

// groupId -> Map(version -> CryptoKey). Old versions stay cached so history
// remains readable after rotations.
const groupKeyCache = new Map();

export function cacheGroupKey(groupId, version, key) {
  if (!groupId || !version || !key) return;
  let versions = groupKeyCache.get(String(groupId));
  if (!versions) {
    versions = new Map();
    groupKeyCache.set(String(groupId), versions);
  }
  versions.set(Number(version), key);
}

export function getCachedGroupKey(groupId, version) {
  const versions = groupKeyCache.get(String(groupId));
  return versions ? versions.get(Number(version)) || null : null;
}

export function dropGroupKeyCache(groupId) {
  groupKeyCache.delete(String(groupId));
}

// ---- Decrypted media blob-URL cache -------------------------------------
// messageId -> blob: URL. Once decrypted, the plaintext bytes live in the
// browser only; re-renders and gallery views reuse them without refetch.
// Bounded (LRU) so long sessions don't accumulate object URLs forever.
const blobUrlCache = new Map();
const BLOB_CACHE_LIMIT = 40;

export function getCachedDecryptedMediaUrl(messageId) {
  return blobUrlCache.get(messageId) || null;
}

export function cacheDecryptedMediaUrl(messageId, blobUrl) {
  blobUrlCache.delete(messageId);
  blobUrlCache.set(messageId, blobUrl);
  while (blobUrlCache.size > BLOB_CACHE_LIMIT) {
    const oldest = blobUrlCache.keys().next().value;
    const url = blobUrlCache.get(oldest);
    blobUrlCache.delete(oldest);
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
}

export function clearDecryptedMediaCache(messageId) {
  const cached = blobUrlCache.get(messageId);
  if (cached) {
    try {
      URL.revokeObjectURL(cached);
    } catch {
      // ignore
    }
    blobUrlCache.delete(messageId);
  }
}

// Fresh random group key. Extractable so it can be wrapped for each member;
// raw bytes still never leave the WebCrypto boundary except inside wraps.
export async function generateGroupKey() {
  return window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable: wrapped for each member via wrapKey on rotation
    ["encrypt", "decrypt"]
  );
}

async function randomIv() {
  return window.crypto.getRandomValues(new Uint8Array(12));
}

export async function encryptTextWithGroupKey(key, text) {
  const iv = await randomIv();
  const data = new TextEncoder().encode(text);
  const ct = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { ciphertext: arrayBufferToBase64(ct), iv: arrayBufferToBase64(iv.buffer) };
}

export async function decryptTextWithGroupKey(key, ciphertextB64, ivB64) {
  try {
    const pt = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArrayBuffer(ivB64) },
      key,
      base64ToArrayBuffer(ciphertextB64)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export async function encryptBytesWithGroupKey(key, buffer) {
  const iv = await randomIv();
  const ct = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buffer);
  return { data: ct, iv: arrayBufferToBase64(iv.buffer) };
}

export async function decryptBytesWithGroupKey(key, buffer, ivB64) {
  try {
    return await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToArrayBuffer(ivB64) },
      key,
      buffer
    );
  } catch {
    return null;
  }
}

// Derive an AES-GCM key usable for wrapKey/unwrapKey from ECDH.
async function deriveWrappingKey(privateKey, peerPublicKey) {
  const sharedBits = await window.crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    256
  );
  const hkdfKey = await window.crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new Uint8Array() },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// Wrap a group key for one member. Returns base64(iv || wrappedKey).
export async function wrapGroupKeyFor(groupKey, targetPublicKeyB64) {
  const keyPair = await getKeyPair();
  if (!keyPair) throw new Error("No local key pair found");
  const targetPubKey = await importPublicKey(targetPublicKeyB64);
  const wrappingKey = await deriveWrappingKey(keyPair.privateKey, targetPubKey);
  const iv = await randomIv();
  const wrapped = await window.crypto.subtle.wrapKey(
    "raw",
    groupKey,
    wrappingKey,
    { name: "AES-GCM", iv }
  );
  const combined = new Uint8Array(12 + wrapped.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrapped), 12);
  return arrayBufferToBase64(combined.buffer);
}

// Unwrap our copy of a group key. Needs our private key + the wrapper's
// public key (stored on the server with the rotation).
export async function unwrapGroupKey(wrappedB64, wrapperPublicKeyB64) {
  const keyPair = await getKeyPair();
  if (!keyPair) throw new Error("No local key pair found");
  const wrapperPubKey = await importPublicKey(wrapperPublicKeyB64);
  const wrappingKey = await deriveWrappingKey(keyPair.privateKey, wrapperPubKey);
  const combined = new Uint8Array(base64ToArrayBuffer(wrappedB64));
  const iv = combined.slice(0, 12);
  const wrapped = combined.slice(12).buffer;
  return window.crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    wrappingKey,
    { name: "AES-GCM", iv },
    { name: "AES-GCM", length: 256 },
    true, // extractable: keeps parity with generateGroupKey (memory-only)
    ["encrypt", "decrypt"]
  );
}

// Our own public key (base64 SPKI) — recorded as the wrapper on rotations.
export async function getOwnPublicKeyB64() {
  const keyPair = await getKeyPair();
  if (!keyPair) throw new Error("No local key pair found");
  return exportPublicKey(keyPair.publicKey);
}

// Fetch + unwrap our copy of a group key version (history supported).
// Keys are cached per group+version in memory.
export async function fetchGroupKey(groupId, version) {
  const cached = getCachedGroupKey(groupId, version);
  if (cached) return cached;
  const { data } = await axiosInstance.get(`/groups/${groupId}/key`, { params: { version } });
  if (!data?.wrappedKey || !data?.wrapperPublicKey) throw new Error("No key available");
  const key = await unwrapGroupKey(data.wrappedKey, data.wrapperPublicKey);
  cacheGroupKey(groupId, Number(data.keyVersion) || version, key);
  return key;
}

// Download an encrypted media file and decrypt it with the group key.
// Returns a Blob of the original file, or null.
export async function fetchDecryptedMediaBytes(signedUrl, groupKey, mediaIvB64, mimeType) {
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) return null;
    const ct = await res.arrayBuffer();
    const pt = await decryptBytesWithGroupKey(groupKey, ct, mediaIvB64);
    if (!pt) return null;
    return new Blob([pt], { type: mimeType || "application/octet-stream" });
  } catch {
    return null;
  }
}

// Re-exported for tests/convenience (kept out of crypto.js to avoid bloat).
export { deriveSharedSecret };