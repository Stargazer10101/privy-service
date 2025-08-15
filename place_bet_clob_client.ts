import { ClobClient, Side } from '@polymarket/clob-client';
import { ethers } from 'ethers';
import * as dotenv from "dotenv";

dotenv.config();

// Decodes a double-hex encoded Ethereum private key into a valid (66 chars) format
function decodeDoubleHexPrivateKey(encodedKey: string): string {

    let cleanKey = encodedKey.startsWith("0x") ? encodedKey.slice(2) : encodedKey;
    if (/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
      return "0x" + cleanKey;
    }
    // If it's 128 hex chars (double encoded), decode once
    if (/^[0-9a-fA-F]{128}$/.test(cleanKey)) {
      const decoded = Buffer.from(cleanKey, "hex").toString("utf8");
      if (/^[0-9a-fA-F]{64}$/.test(decoded)) {
        return "0x" + decoded;
      }
    }
    throw new Error("Invalid private key format. Expected 64 or 128 hex characters.");
  }

async function placeBetWithClobClient() {
  const privateKey = decodeDoubleHexPrivateKey(process.env.PRIVATE_KEY || '');
  const makerAddress = process.env.MAKER_ADDRESS;
  const targetMarketId = process.env.TARGET_MARKET_ID || "0x2b247ca3101b16d95afcb5117a03a126c6a767d3131814f0647fe61442981622";

  if (!privateKey || !makerAddress) {
    throw new Error("Missing required environment variables: PRIVATE_KEY and MAKER_ADDRESS");
  }

  console.log("Environment variables loaded.");
  console.log(`Target market ID: ${targetMarketId}`);
  console.log(`Maker Address: ${makerAddress}`);
  
  // Validate private key format
  if (!privateKey?.startsWith('0x') || privateKey.length !== 66) {
    throw new Error(`Invalid private key format. Expected 66 characters (including 0x), got ${privateKey?.length}`);
  }
  
  // Check if it's valid hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('Invalid private key: not a valid hex string');
  }

  try {
    // Create an ethers.js Wallet instance from the private key
    const wallet = new ethers.Wallet(privateKey);
    console.log("Wallet created from private key.");
    console.log("Wallet address:", wallet.address);
    console.log("Wallet has signTypedData method:", typeof wallet.signTypedData === 'function');
    
    // Add the _signTypedData method that the CLOB client expects
    (wallet as any)._signTypedData = wallet.signTypedData;
    console.log("Added _signTypedData method to wallet");

    // Initialize the CLOB client with ethers.js Wallet and API credentials
    const clobClient = new ClobClient(
      'https://clob.polymarket.com',
      137, // Polygon chain ID
      wallet as any,
      {
        key: process.env.POLYMARKET_API_KEY || '',
        secret: process.env.POLYMARKET_API_SECRET || '',
        passphrase: process.env.POLYMARKET_PASSPHRASE || ''
      }
    );
    console.log("CLOB client initialized.");

    // Check if the specific market is active
    console.log("Checking if target market is active...");
    try {
      const market = await clobClient.getMarket(targetMarketId);
      console.log("Market details:", market);
      console.log("Market is active:", market.active);
      console.log("Market is accepting orders:", market.accepting_orders);
      console.log("Market is closed:", market.closed);
      console.log("Market token ID:", market.tokenId);
      
      if (!market.accepting_orders) {
        console.log("Market is not accepting orders. Looking for active markets...");
        
        // Get some active markets
        const markets = await clobClient.getMarkets();
        const activeMarkets = Object.values(markets).filter((m: any) => m.active && m.accepting_orders);
        console.log(`Found ${activeMarkets.length} active markets accepting orders`);
        
        if (activeMarkets.length > 0) {
          const firstActiveMarket = activeMarkets[0];
          console.log("First active market:", firstActiveMarket.question);
          console.log("Market condition ID:", firstActiveMarket.condition_id);
        }
      }
    } catch (error) {
      console.log("Error fetching market:", error);
      console.log("Market might not exist or be inactive");
    }

    // Create order parameters - using the Yes token ID from the current market
    const orderParams = {
      tokenID: "60487116984468020978247225474488676749601001829886755968952521846780452448915", // Yes token ID from current market
      price: 0.06,
      size: 5, 
      side: Side.BUY,
      orderType: 'GTC' as const, // Good Till Cancelled
      feeRateBps: 0, // No fee
      nonce: Date.now(), // Current timestamp as nonce
      expiration: 0,
      maker: makerAddress,
    };

    console.log("Order parameters created:");
    console.log(`  Token ID: ${orderParams.tokenID}`);
    console.log(`  Price: ${orderParams.price}`);
    console.log(`  Size: ${orderParams.size}`);
    console.log(`  Side: ${orderParams.side}`);
    console.log(`  Order Type: ${orderParams.orderType}`);

    // Place the order using the CLOB client
    console.log("Placing order with CLOB client...");
    const orderResult = await clobClient.createAndPostOrder(orderParams);

    console.log("\nOrder placed successfully!");
    console.log("Order Result:", JSON.stringify(orderResult, null, 2));

    // Get order details
    if (orderResult.orderId) {
      console.log(`\nOrder ID: ${orderResult.orderId}`);
      
      // Get order status
      const orderStatus = await clobClient.getOrder(orderResult.orderId);
      console.log("Order Status:", JSON.stringify(orderStatus, null, 2));
    }

  } catch (error) {
    console.error("Error placing order:", error);
    
    // Log more detailed error information
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
  }
}

placeBetWithClobClient().catch(console.error);
