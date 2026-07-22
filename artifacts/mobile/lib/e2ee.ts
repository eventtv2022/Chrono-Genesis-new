import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// ── Secure storage helpers ────────────────────────────────────────────────────
// Secret key goes into SecureStore (encrypted by OS keychain) on native.
// On web, SecureStore is unavailable — fall back to AsyncStorage.

const SK_STORE_KEY = "timenation_chat_secretkey";   // SecureStore (alphanumeric)
const PK_ASYNC_KEY = "@timenation/chat_pubkey";      // AsyncStorage — public key is non-sensitive
const LEGACY_KEYPAIR_KEY = "@timenation/chat_keypair"; // Old combined key — migrated on first load

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") return AsyncStorage.getItem(key);
  const SS = (await import("expo-secure-store")).default;
  return SS.getItemAsync(key);
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") { await AsyncStorage.setItem(key, value); return; }
  const SS = (await import("expo-secure-store")).default;
  await SS.setItemAsync(key, value);
}

// ── DM key pair ───────────────────────────────────────────────────────────────

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyB64: string;
}

/**
 * Returns the user's NaCl box keypair.
 * Secret key → SecureStore (hardware-backed on supported devices).
 * Public key → AsyncStorage (non-sensitive).
 * Migrates the legacy combined AsyncStorage entry on first run.
 */
export async function getOrCreateKeyPair(): Promise<KeyPair> {
  const [secStored, pubStored] = await Promise.all([
    secureGet(SK_STORE_KEY),
    AsyncStorage.getItem(PK_ASYNC_KEY),
  ]);

  if (secStored && pubStored) {
    return {
      publicKey: decodeBase64(pubStored),
      secretKey: decodeBase64(secStored),
      publicKeyB64: pubStored,
    };
  }

  // Migrate legacy combined entry (old code stored both in AsyncStorage)
  const legacy = await AsyncStorage.getItem(LEGACY_KEYPAIR_KEY);
  if (legacy) {
    const parsed = JSON.parse(legacy) as { pub: string; sec: string };
    await Promise.all([
      secureSet(SK_STORE_KEY, parsed.sec),
      AsyncStorage.setItem(PK_ASYNC_KEY, parsed.pub),
      AsyncStorage.removeItem(LEGACY_KEYPAIR_KEY),
    ]);
    return {
      publicKey: decodeBase64(parsed.pub),
      secretKey: decodeBase64(parsed.sec),
      publicKeyB64: parsed.pub,
    };
  }

  // Generate a fresh keypair
  const kp = nacl.box.keyPair();
  const pub = encodeBase64(kp.publicKey);
  const sec = encodeBase64(kp.secretKey);
  await Promise.all([
    secureSet(SK_STORE_KEY, sec),
    AsyncStorage.setItem(PK_ASYNC_KEY, pub),
  ]);
  return { publicKey: kp.publicKey, secretKey: kp.secretKey, publicKeyB64: pub };
}

// ── DM encryption (NaCl box) ──────────────────────────────────────────────────

/** Encrypt a plaintext DM for a recipient using NaCl authenticated box */
export function encryptMsg(
  plaintext: string,
  theirPublicKey: Uint8Array,
  mySecretKey: Uint8Array,
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(decodeUTF8(plaintext), nonce, theirPublicKey, mySecretKey);
  return { ciphertext: encodeBase64(box), nonce: encodeBase64(nonce) };
}

/** Decrypt a received DM; returns null if decryption fails */
export function decryptMsg(
  ciphertext: string,
  nonce: string,
  theirPublicKey: Uint8Array,
  mySecretKey: Uint8Array,
): string | null {
  try {
    const opened = nacl.box.open(
      decodeBase64(ciphertext),
      decodeBase64(nonce),
      theirPublicKey,
      mySecretKey,
    );
    return opened ? encodeUTF8(opened) : null;
  } catch {
    return null;
  }
}

// ── Group symmetric encryption (NaCl secretbox) ───────────────────────────────

/** Generate a fresh 32-byte group symmetric key */
export function generateGroupKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength); // 32 bytes
}

/**
 * Encrypt the group key for a specific member using NaCl box.
 * The creator's secret key + member's public key → authenticated encryption.
 */
export function encryptGroupKeyForMember(
  groupKey: Uint8Array,
  memberPublicKey: Uint8Array,
  creatorSecretKey: Uint8Array,
): { encryptedKey: string; encNonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(groupKey, nonce, memberPublicKey, creatorSecretKey);
  return { encryptedKey: encodeBase64(box), encNonce: encodeBase64(nonce) };
}

/**
 * Decrypt a group key received from the server.
 * Uses the creator's public key + my secret key.
 */
export function decryptGroupKey(
  encryptedKey: string,
  encNonce: string,
  creatorPublicKey: Uint8Array,
  mySecretKey: Uint8Array,
): Uint8Array | null {
  try {
    const opened = nacl.box.open(
      decodeBase64(encryptedKey),
      decodeBase64(encNonce),
      creatorPublicKey,
      mySecretKey,
    );
    return opened ?? null;
  } catch {
    return null;
  }
}

/** Encrypt a group message with the symmetric group key (NaCl secretbox) */
export function encryptGroupMsg(
  plaintext: string,
  groupKey: Uint8Array,
): { ciphertext: string; msgNonce: string } {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(decodeUTF8(plaintext), nonce, groupKey);
  return { ciphertext: encodeBase64(box), msgNonce: encodeBase64(nonce) };
}

/** Decrypt a group message; returns null if decryption fails */
export function decryptGroupMsg(
  ciphertext: string,
  msgNonce: string,
  groupKey: Uint8Array,
): string | null {
  try {
    const opened = nacl.secretbox.open(
      decodeBase64(ciphertext),
      decodeBase64(msgNonce),
      groupKey,
    );
    return opened ? encodeUTF8(opened) : null;
  } catch {
    return null;
  }
}

// ── Safety Fingerprint (MITM protection) ─────────────────────────────────────

/**
 * Generates a 6-digit Safety Code from two public keys.
 * Both peers sort the keys the same way → produce identical codes.
 * If codes match (verified out-of-band), no MITM is present.
 */
export function getSafetyCode(myPubB64: string, theirPubB64: string): string {
  const [a, b] = [myPubB64, theirPubB64].sort(); // deterministic order
  const aBytes = decodeBase64(a);
  const bBytes = decodeBase64(b);
  const combined = new Uint8Array(aBytes.length + bBytes.length);
  combined.set(aBytes, 0);
  combined.set(bBytes, aBytes.length);
  const hash = nacl.hash(combined); // SHA-512
  // Take first 3 bytes → 24-bit number → modulo 10^6 → 6-digit code
  const num = ((hash[0]! << 16) | (hash[1]! << 8) | hash[2]!) % 1_000_000;
  return String(num).padStart(6, "0");
}
