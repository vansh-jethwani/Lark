// E2EE cryptographic utilities using Web Crypto API and IndexedDB

const DB_NAME = "LarkCryptoDB";
const STORE_NAME = "keys";
const KEY_NAME = "userKeyPair";

export function getCryptoDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

export async function storeKeyPair(keyPair) {
    const db = await getCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(keyPair, KEY_NAME);
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

export async function getKeyPair() {
    const db = await getCryptoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(KEY_NAME);
        
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Generate ECDH key pair
export async function generateKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        false, // Private key should not be extractable
        ["deriveKey", "deriveBits"]
    );
    return keyPair;
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// Export public key to base64 SPKI
export async function exportPublicKey(publicKey) {
    const exported = await window.crypto.subtle.exportKey("spki", publicKey);
    return arrayBufferToBase64(exported);
}

// Import public key from base64 SPKI
export async function importPublicKey(base64Str) {
    const buffer = base64ToArrayBuffer(base64Str);
    return await window.crypto.subtle.importKey(
        "spki",
        buffer,
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        []
    );
}

// Derive a shared AES-GCM key using ECDH and HKDF
export async function deriveSharedSecret(privateKey, partnerPublicKey) {
    // Derive bits from ECDH
    const sharedBits = await window.crypto.subtle.deriveBits(
        {
            name: "ECDH",
            public: partnerPublicKey,
        },
        privateKey,
        256
    );

    // Use HKDF to derive a strong AES-GCM key from the shared bits
    const hkdfKey = await window.crypto.subtle.importKey(
        "raw",
        sharedBits,
        { name: "HKDF" },
        false,
        ["deriveKey"]
    );

    return await window.crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new Uint8Array(),
            info: new Uint8Array(),
        },
        hkdfKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        false,
        ["encrypt", "decrypt"]
    );
}

// Encrypt a message
export async function encryptMessage(text, partnerPublicKeyBase64) {
    if (!text || !partnerPublicKeyBase64) return null;
    
    try {
        const keyPair = await getKeyPair();
        if (!keyPair) throw new Error("No local key pair found");

        const partnerPubKey = await importPublicKey(partnerPublicKeyBase64);
        const sharedKey = await deriveSharedSecret(keyPair.privateKey, partnerPubKey);

        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        const encodedText = encoder.encode(text);

        const ciphertextBuffer = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            sharedKey,
            encodedText
        );

        return {
            ciphertext: arrayBufferToBase64(ciphertextBuffer),
            iv: arrayBufferToBase64(iv),
        };
    } catch (err) {
        console.error("Encryption failed:", err);
        return null; // Fallback to plaintext if encryption fails or no partner key
    }
}

// Decrypt a message
export async function decryptMessage(ciphertextBase64, ivBase64, partnerPublicKeyBase64) {
    if (!ciphertextBase64 || !ivBase64 || !partnerPublicKeyBase64) return null;

    try {
        const keyPair = await getKeyPair();
        if (!keyPair) throw new Error("No local key pair found");

        const partnerPubKey = await importPublicKey(partnerPublicKeyBase64);
        const sharedKey = await deriveSharedSecret(keyPair.privateKey, partnerPubKey);

        const iv = base64ToArrayBuffer(ivBase64);
        const ciphertextBuffer = base64ToArrayBuffer(ciphertextBase64);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv,
            },
            sharedKey,
            ciphertextBuffer
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    } catch (err) {
        console.error("Decryption failed:", err);
        return null;
    }
}
