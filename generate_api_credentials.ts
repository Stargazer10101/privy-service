import { signWithServerWallet } from './sign_typed_data.ts';
import 'dotenv/config';

interface ApiCredentials {
  key: string;
  secret: string;
  passphrase: string;
}

interface EIP712TypedDataForSigning {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
  };
  message: Record<string, any>;
}

async function generateApiCredentials(walletId: string, makerAddress: string): Promise<ApiCredentials> {
  if (!walletId || !makerAddress) {
    throw new Error("walletId and makerAddress are required");
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = 0;

    // This EIP-712 structure EXACTLY matches what the Polymarket server expects for L1 authentication.
    const typedData: EIP712TypedDataForSigning = {
      types: {
        ClobAuth: [
          { name: 'address', type: 'address' },
          { name: 'timestamp', type: 'string' },
          { name: 'nonce', type: 'uint256' },
          { name: 'message', type: 'string' },
        ],
      },
      primaryType: 'ClobAuth',
      domain: {
        name: 'ClobAuthDomain',
        version: '1',
        chainId: 137,
      },
      message: {
        address: makerAddress,
        timestamp: timestamp.toString(),
        nonce: nonce,
        message: 'This message attests that I control the given wallet',
      },
    };

    // The signature is generated based on the structure Polymarket expects.
    const signature = await signWithServerWallet(walletId, typedData as any);
    if (!signature) {
      throw new Error('Failed to sign API key creation request');
    }

    // First, try to derive credentials
    try {
        console.log("Attempting to derive existing API credentials...");
        const derivedCreds = await deriveApiCredentials(walletId, makerAddress, nonce);
        if (derivedCreds && derivedCreds.key) {
            return derivedCreds;
        }
    } catch (deriveError) {
        console.log("Could not derive credentials, attempting to create new ones...");
    }
    
    // If deriving fails, attempt to create new credentials.
    const response = await fetch('https://clob.polymarket.com/auth/api-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'POLY_ADDRESS': makerAddress,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': nonce.toString(),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate API credentials: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    const apiCreds = {
        key: responseData.apiKey,
        secret: responseData.secret,
        passphrase: responseData.passphrase
    };

    console.log("API Credentials Generated Successfully!");
    console.log("\nAdd these to your .env file:");
    console.log(`POLYMARKET_API_KEY=${apiCreds.key}`);
    console.log(`POLYMARKET_API_SECRET=${apiCreds.secret}`);
    console.log(`POLYMARKET_PASSPHRASE=${apiCreds.passphrase}`);

    return apiCreds;
  } catch (error) {
    console.error("Failed to generate API credentials:", error);
    throw error;
  }
}

async function deriveApiCredentials(walletId: string, makerAddress: string, nonce: number): Promise<ApiCredentials> {
    const timestamp = Math.floor(Date.now() / 1000);
    const typedData = {
        types: {
            ClobAuth: [
                { name: 'address', type: 'address' },
                { name: 'timestamp', type: 'string' },
                { name: 'nonce', type: 'uint256' },
                { name: 'message', type: 'string' },
            ],
        },
        primaryType: 'ClobAuth' as const,
        domain: {
            name: 'ClobAuthDomain',
            version: '1',
            chainId: 137,
        },
        message: {
            address: makerAddress,
            timestamp: timestamp.toString(),
            nonce,
            message: 'This message attests that I control the given wallet',
        },
    };

    const signature = await signWithServerWallet(walletId, typedData as any);
    if (!signature) {
        throw new Error('Failed to sign API key derivation request');
    }

    const response = await fetch(`https://clob.polymarket.com/auth/derive-api-key`, {
        method: 'GET',
        headers: {
            'POLY_ADDRESS': makerAddress,
            'POLY_SIGNATURE': signature,
            'POLY_TIMESTAMP': timestamp.toString(),
            'POLY_NONCE': nonce.toString(),
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to derive API credentials: ${response.status} - ${errorText}`);
    }

    const responseData = await response.json();
    const apiCreds = {
        key: responseData.apiKey,
        secret: responseData.secret,
        passphrase: responseData.passphrase
    };

    console.log("API Credentials Derived Successfully!");
    console.log("\nAdd these to your .env file:");
    console.log(`POLYMARKET_API_KEY=${apiCreds.key}`);
    console.log(`POLYMARKET_API_SECRET=${apiCreds.secret}`);
    console.log(`POLYMARKET_PASSPHRASE=${apiCreds.passphrase}`);
    
    return apiCreds;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const walletId = process.env.WALLET_ID;
  const makerAddress = process.env.MAKER_ADDRESS;
  if (!walletId || !makerAddress) {
    console.error("WALLET_ID and MAKER_ADDRESS environment variables are required");
    process.exit(1);
  }
  generateApiCredentials(walletId, makerAddress).catch(console.error);
}
