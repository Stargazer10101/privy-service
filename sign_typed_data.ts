import { PrivyClient } from '@privy-io/server-auth';
import 'dotenv/config';

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

export async function signWithServerWallet(
  walletId: string,
  typedData: EIP712TypedData
): Promise<string | undefined> {
  const privyAppId = process.env.PRIVY_APP_ID;
  const privyAppSecret = process.env.PRIVY_APP_SECRET;
  const authorizationKey = process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY as string;

  if (!privyAppId || !privyAppSecret) {
    throw new Error('Missing Privy credentials.');
  }
  if (!authorizationKey) {
    throw new Error('Missing Privy authorization key.');
  }

  const privy = new PrivyClient(privyAppId, privyAppSecret, {
    walletApi: {
      authorizationPrivateKey: authorizationKey
    }
  });

  const { signature } = await privy.walletApi.ethereum.signTypedData({
    walletId: walletId,
    typedData: typedData,
  });

  return signature;
}
