import { PrivyClient } from "@privy-io/server-auth";
import "dotenv/config";

async function createPrivyWallet(privy: PrivyClient, ownerPublicKey: string) {
  console.log(
    `\nAttempting to create a new wallet owned by authorization key ID `
  );

  const newWallet  = await privy.walletApi.createWallet({
    chainType: "solana",
    owner: {
      publicKey: ownerPublicKey
    }
  });
  console.log(newWallet);
  return newWallet;
}

async function main() {
  const privyAppId = process.env.PRIVY_APP_ID;
  const privyAppSecret =  process.env.PRIVY_APP_SECRET;
  const privyAuthorizationPublicKey = process.env.PRIVY_AUTHORIZATION_PUBLIC_KEY; // Using the Key ID

  if (!privyAppId || !privyAppSecret || !privyAuthorizationPublicKey) {
    throw new Error("Missing required environment variables");
  }

  const privy = new PrivyClient(privyAppId, privyAppSecret);
  console.log("Privy Client initialized successfully!");

  await createPrivyWallet(privy, privyAuthorizationPublicKey);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});