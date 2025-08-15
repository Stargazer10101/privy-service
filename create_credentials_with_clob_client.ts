import { ClobClient } from '@polymarket/clob-client';
import type { ApiKeyCreds } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();


// Decodes a private key from various formats into the standard 66-character hex string.

function decodePrivateKey(encodedKey: string): string {
  try {
    console.log("🔍 Decoding private key...");
    
    let cleanKey = encodedKey;
    if (cleanKey.startsWith('PRIVATE_KEY=')) {
      cleanKey = cleanKey.replace('PRIVATE_KEY=', '');
    }

    // Handle standard 66-character hex key (with 0x)
    if (cleanKey.startsWith('0x') && cleanKey.length === 66) {
      console.log("Key is already in correct format.");
      return cleanKey;
    }

    // Handle 64-character hex key (without 0x)
    if (!cleanKey.startsWith('0x') && cleanKey.length === 64) {
      console.log("🔧 Adding 0x prefix to 64-char hex key.");
      return '0x' + cleanKey;
    }

    // Handle longer hex keys by extracting the first 64 characters
    if (cleanKey.startsWith('0x') && cleanKey.length > 66) {
      console.log("🔧 Extracting first 64 chars from longer hex key.");
      return '0x' + cleanKey.substring(2, 66);
    }
    
    throw new Error("Could not decode private key - unknown or unsupported format.");

  } catch (error) {
    console.error("❌ Error decoding private key:", error);
    throw error;
  }
}

async function createCredentialsWithClobClient() {
  try {
    console.log("🚀 Creating API Credentials with CLOB Client");
    console.log("=".repeat(60));

    const encodedPrivateKey = process.env.PRIVATE_KEY;
    if (!encodedPrivateKey) {
      throw new Error("PRIVATE_KEY not found in .env file");
    }

    const privateKey = decodePrivateKey(encodedPrivateKey);
    const wallet = new ethers.Wallet(privateKey);
    const address = wallet.address;

    console.log("✅ Wallet initialized for address:", address);

    // The ClobClient expects a `_signTypedData` method which was removed in ethers v6.
    // This line ensures the method exists by pointing it to the new `signTypedData`.
    if (!(wallet as any)._signTypedData) {
        (wallet as any)._signTypedData = wallet.signTypedData;
        console.log("🔧 Applied compatibility fix for ethers.js v6 signer.");
    }

    // The ethers.Wallet object is now compatible with the ClobClient.
    const clobClient = new ClobClient(
      'https://clob.polymarket.com',
      137, // Polygon Mainnet chain ID
      wallet as any
    );

    console.log("CLOB client initialized.");
    console.log("Attempting to derive or create API credentials...");

    let apiCredentials: ApiKeyCreds | null = null;

    try {
      // First, try to derive existing credentials
      console.log("Attempting to derive existing API credentials...");
      apiCredentials = await clobClient.deriveApiKey();
      
      if (!apiCredentials || !apiCredentials.key) {
          throw new Error("Derive API key did not return a valid key. Trying to create a new one.");
      }
      
      console.log("Successfully derived existing API credentials!");

    } catch (error) {
      
      try {
        // If deriving fails, create new credentials.
        apiCredentials = await clobClient.createApiKey();
        console.log("Successfully created new API credentials!");
      } catch (creationError) {
        console.error("Failed to both derive and create API credentials.");
        throw creationError;
      }
    }

    if (!apiCredentials) {
        throw new Error("Failed to obtain API credentials.");
    }

    console.log("\n API Credentials Retrieved Successfully!");
    console.log("=".repeat(60));
    console.log("API Key:", apiCredentials.key);
    console.log("Secret:", "********************"); // Avoid logging the secret
    console.log("Passphrase:", "********************"); // Avoid logging the passphrase
    console.log("Associated Address:", address);

    console.log("\n Update your .env file with:");
    console.log("-".repeat(40));
    console.log(`POLYMARKET_API_KEY=${apiCredentials.key}`);
    console.log(`POLYMARKET_API_SECRET=${apiCredentials.secret}`);
    console.log(`POLYMARKET_PASSPHRASE=${apiCredentials.passphrase}`);
    console.log(`MAKER_ADDRESS=${address}`);
    console.log("-".repeat(40));

  } catch (error) {
    const err = error as any;
    console.error("\n An error occurred during the process:");
    // Log the actual error response from the server if available
    if (err.error) {
        console.error("Server Response:", err.error);
    } else {
        console.error("Error Details:", err.message);
    }
    process.exit(1);
  }
}

// Run the script
createCredentialsWithClobClient();
