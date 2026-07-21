import nacl from "tweetnacl";
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from "tweetnacl-util";
import AsyncStorage from "@react-native-async-storage/async-storage";

// tweetnacl-util naming:
//   encodeUTF8(arr: Uint8Array): string  — bytes → string
//   decodeUTF8(str: string): Uint8Array  — string → bytes

const KEYPAIR_KEY = "@timenation/chat_keypair";

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyB64: string;
}

/** Returns existing keypair from storage or generates a new one */
export async function getOrCreateKeyPair(): Promise<KeyPair> {
  const stored = await AsyncStorage.getItem(KEYPAIR_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as { pub: string; sec: string };
    const publicKey = decodeBase64(parsed.pub);
    const secretKey = decodeBase64(parsed.sec);
    return { publicKey, secretKey, publicKeyB64: parsed.pub };
  }
  const kp = nacl.box.keyPair();
  const pub = encodeBase64(kp.publicKey);
  const sec = encodeBase64(kp.secretKey);
  await AsyncStorage.setItem(KEYPAIR_KEY, JSON.stringify({ pub, sec }));
  return { publicKey: kp.publicKey, secretKey: kp.secretKey, publicKeyB64: pub };
}

/** Encrypt a plaintext message for a recipient */
export function encryptMsg(
  plaintext: string,
  theirPublicKey: Uint8Array,
  mySecretKey: Uint8Array,
): { ciphertext: string; nonce: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const msgBytes = decodeUTF8(plaintext);          // string → Uint8Array
  const box = nacl.box(msgBytes, nonce, theirPublicKey, mySecretKey);
  return { ciphertext: encodeBase64(box), nonce: encodeBase64(nonce) };
}

/** Decrypt a received message; returns null if decryption fails */
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
    if (!opened) return null;
    return encodeUTF8(opened);                     // Uint8Array → string
  } catch {
    return null;
  }
}
