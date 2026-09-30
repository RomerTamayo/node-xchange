import { Stellar, TESTNET } from "@nodexchange/core";

export const NODE_URL: string =
  import.meta.env.VITE_NX_NODE ?? "http://127.0.0.1:54321/functions/v1/nx";

export const stellar = new Stellar(TESTNET);
