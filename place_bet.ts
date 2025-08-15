import { ClobClient, Side } from '@polymarket/clob-client';
import * as dotenv from "dotenv";
import { signWithServerWallet } from './sign_typed_data.ts';

dotenv.config();

interface EIP712TypedData {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  message: Record<string, any>;
}


async function placeBetWithClobClient() {
  const makerAddress = process.env.MAKER_ADDRESS;
  const walletId = process.env.WALLET_ID; // Using Privy Wallet ID instead of Private Key
  const targetMarketId = process.env.TARGET_MARKET_ID || "0x2b247ca3101b16d95afcb5117a03a126c6a767d3131814f0647fe61442981622";

  if (!walletId || !makerAddress) {
    throw new Error("Missing required environment variables: WALLET_ID and MAKER_ADDRESS");
  }

  console.log("Environment variables loaded.");
  console.log(`Target market ID: ${targetMarketId}`);
  console.log(`Maker Address: ${makerAddress}`);
  console.log(`Privy Wallet ID: ${walletId}`);

  try {
    // Create a custom signer object that uses signWithServerWallet function
    const customPrivySigner = {
      getAddress: async () => {
        return makerAddress;
      },
      _signTypedData: async (domain: any, types: any, value: any): Promise<string> => {
        console.log("Custom signer: _signTypedData called");
        console.log("Domain received by signer:", JSON.stringify(domain, null, 2));
        
        // Construct the typedData object for Privy using the domain passed from ClobClient
        const typedData: EIP712TypedData = {
          types,
          primaryType: Object.keys(types)[0],
          domain: domain,
          message: value,
        };
        
        const signature = await signWithServerWallet(walletId, typedData);
        if (!signature) {
            throw new Error("Failed to get signature from Privy wallet");
        }
        return signature;
      },
    };
    
    console.log("Custom Privy signer created.");
    console.log("Signer address:", await customPrivySigner.getAddress());

    // Initialize the CLOB client with the custom signer
    const clobClient = new ClobClient(
      'https://clob.polymarket.com',
      137,
      customPrivySigner as any, // Use the custom signer
      {
        key: process.env.POLYMARKET_API_KEY || '',
        secret: process.env.POLYMARKET_API_SECRET || '',
        passphrase: process.env.POLYMARKET_PASSPHRASE || ''
      }
    );
    console.log("CLOB client initialized with custom signer.");

    // Check if the specific market is active
    console.log("Checking if target market is active...");
    try {
      const market = await clobClient.getMarket(targetMarketId);
      console.log("Market is active:", market.active);
      if (!market.accepting_orders) {
        console.log("Market is not accepting orders.");
      }
    } catch (error) {
      console.log("Error fetching market:", error);
    }

    // Create order parameters
    const orderParams = {
      tokenID: "60487116984468020978247225474488676749601001829886755968952521846780452448915",
      price: 0.06,
      size: 3,
      side: Side.BUY,
      orderType: 'GTC' as const,
      feeRateBps: 0,
      nonce: Date.now(),
      expiration: 0,
      maker: makerAddress,
    };

    console.log("Order parameters created:", orderParams);

    // Place the order using the CLOB client
    console.log("Placing order with CLOB client...");
    const orderResult = await clobClient.createAndPostOrder(orderParams);

    console.log("\nOrder placed successfully!");
    console.log("Order Result:", JSON.stringify(orderResult, null, 2));

  } catch (error) {
    console.error("Error placing order:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
  }
}

placeBetWithClobClient().catch(console.error);
