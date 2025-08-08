import { PrivyClient } from "@privy-io/server-auth";
import {generateAuthorizationSignature} from "@privy-io/server-auth/wallet-api"
import "dotenv/config";
import { CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';


// Wallet creation
async function createPrivyWallet(privy: PrivyClient, ownerPublicKey: string) {
    console.log(`\nAttempting to create a new wallet owned by authorization key...`);
    const newWallet = await privy.walletApi.createWallet({
        chainType: "solana",
        owner: { publicKey: ownerPublicKey }
    });
    console.log('✅ Wallet created successfully!');
    console.log(newWallet);
    return newWallet;
}


// Decryption function
async function decryptHPKEMessage(
  privateKeyBase64: string,
  encapsulatedKeyBase64: string,
  ciphertextBase64: string,
): Promise<string> {
  const suite = new CipherSuite({
    kem: new DhkemP256HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Chacha20Poly1305(),
  });
  const base64ToBuffer = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    base64ToBuffer(privateKeyBase64),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );
  const recipient = await suite.createRecipientContext({
    recipientKey: privateKey,
    enc: base64ToBuffer(encapsulatedKeyBase64),
  });
  const decryptedBuffer = await recipient.open(base64ToBuffer(ciphertextBase64));
  const hexString = Buffer.from(decryptedBuffer).toString('hex');
  return `0x${hexString}`;
}


//Securely export and decrypt a wallet's private key.
async function exportWalletPrivateKey(
    privyAppId: string, 
    privyAppSecret: string,
    walletId: string, 
    authorizationPrivateKey: string
) {
  // Generate a temporary key pair for decryption
  console.log('\nGenerating temporary key pair for secure export...');
  const keypair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey('spki', keypair.publicKey),
    crypto.subtle.exportKey('pkcs8', keypair.privateKey),
  ]);
  const [recipientPublicKeyBase64, recipientPrivateKeyBase64] = [
    Buffer.from(publicKey).toString('base64'),
    Buffer.from(privateKey).toString('base64'),
  ];
  console.log('Temporary key pair generated.');

  // Create the authorization signature
  console.log('Creating authorization signature...');
  const signatureInput = {
    headers: { 'privy-app-id': privyAppId },
    method: 'POST' as const,
    url: `https://auth.privy.io/v1/wallets/${walletId}/export`,
    version: 1 as const,
    body: {
      encryption_type: 'HPKE',
      recipient_public_key: recipientPublicKeyBase64,
    },
  };
  const signature = generateAuthorizationSignature({ input: signatureInput, authorizationPrivateKey });
  if (!signature) {
    throw new Error('Signature is undefined. Cannot proceed.');
  }
  console.log('Signature created.');

  // Make the API request to export the wallet
  console.log('Making API request to export wallet...');
  const response = await fetch(`https://auth.privy.io/v1/wallets/${walletId}/export`, {
    method: signatureInput.method,
    headers: {
      'privy-app-id': privyAppId,
      'Content-Type': 'application/json',
      'privy-authorization-signature': signature,
      'Authorization': `Basic ${Buffer.from(`${privyAppId}:${privyAppSecret}`).toString('base64')}`,
    },
    body: JSON.stringify(signatureInput.body),
  });

  if (!response.ok) {
    throw new Error(`Failed to export wallet: ${await response.text()}`);
  }
  const exportData = await response.json();
  console.log('Encrypted private key received.');

  // Decrypt the private key
  console.log('Decrypting private key...');
  const decryptedPrivateKey = await decryptHPKEMessage(
    recipientPrivateKeyBase64,
    exportData.encapsulated_key,
    exportData.ciphertext
  );
  console.log('Private key decrypted successfully!');
  return decryptedPrivateKey;
}

async function main() {
  const privyAppId = process.env.PRIVY_APP_ID as string;
  const privyAppSecret = process.env.PRIVY_APP_SECRET as string;
  const privyAuthorizationPublicKey = process.env.PRIVY_AUTHORIZATION_PUBLIC_KEY as string;
  const privyAuthorizationPrivateKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY as string;

  if (!privyAppId || !privyAppSecret || !privyAuthorizationPublicKey || !privyAuthorizationPrivateKey) {
    throw new Error("Missing required environment variables");
  }

  const privy = new PrivyClient(privyAppId, privyAppSecret);
  console.log("Privy Client initialized successfully!");


  const createdWallet = await createPrivyWallet(privy, privyAuthorizationPublicKey);

  let totalExportTime = 0;
  const iterations = 20;

  for (let i = 0; i < iterations; i++) {
    console.log(`\nExport attempt #${i + 1}`);
    const start = performance.now();
    await exportWalletPrivateKey(
      privyAppId,
      privyAppSecret,
      createdWallet.id,
      privyAuthorizationPrivateKey
    );
    const end = performance.now();
    const elapsed = end - start;
    totalExportTime += elapsed;
    console.log(`exportWalletPrivateKey took ${elapsed.toFixed(2)} ms`);
  }

  const averageExportTime = totalExportTime / iterations;
  console.log(`\nAverage exportWalletPrivateKey time: ${averageExportTime.toFixed(2)} ms`);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});