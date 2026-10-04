// All visible copy, in Spanish (default) and English.

export type Lang = "es" | "en";

export const DEMO_URL = "https://nodexchange.pages.dev";
export const REPO_URL = "https://github.com/RomerTamayo/node-xchange";
export const ESCROW_URL =
  "https://stellar.expert/explorer/testnet/contract/CAUDG4P37366J335GKBVOG35MPUQ4RDDLL7DJUJSUMOCEVORISPB3UPP";

const es = {
  nav: { how: "Cómo funciona", payments: "Pagos", privacy: "Privacidad" },
  cta: "Probar la demo",
  code: "Ver el código",
  hero: {
    title: "Conversa y paga en el mismo chat.",
    body: "Chat cifrado entre billeteras Stellar, con pagos protegidos por un contrato inteligente hasta que recibes lo que compraste.",
  },
  problem: {
    title: "Hoy se negocia por WhatsApp y se paga por otra app. Si el vendedor desaparece, tu dinero también.",
    body: "NodeXchange junta la conversación y el pago, y agrega una garantía que no depende de confiar en nadie.",
  },
  how: {
    title: "Tres pasos, una sola app.",
    steps: [
      {
        name: "Escanea",
        body: "Cada persona tiene su código QR. Lo escaneas y ya es tu contacto, sin pedir número de teléfono.",
        img: "/screens/my-qr-crop.webp",
        alt: "Código QR de Mariela en NodeXchange",
      },
      {
        name: "Conversa",
        body: "Los mensajes viajan cifrados de billetera a billetera. Un desconocido solo puede enviarte una solicitud.",
        img: "/screens/request-crop.webp",
        alt: "Solicitud de mensaje de Joaquín preguntando por una bicicleta",
      },
      {
        name: "Paga",
        body: "Cuando se ponen de acuerdo, pulsas Pagar y eliges cómo. El comprobante queda en el chat.",
        img: "/screens/pay-menu-crop.webp",
        alt: "Menú de pago con pago directo, protegido y externo",
      },
    ],
  },
  payments: {
    title: "Elige cómo pagar según cuánto confías.",
    protected: {
      name: "Pago protegido",
      body: "El dinero queda en un contrato Soroban. El vendedor lo recibe cuando confirmas la entrega; si no cumple, lo recuperas al vencer el plazo.",
      alt: "Pago protegido de 350 XLM retenido en el chat",
    },
    direct: {
      name: "Pago directo",
      body: "XLM o USDC que llega en segundos, con enlace al comprobante en la red.",
    },
    external: {
      name: "Pago externo",
      body: "A su Binance u otra billetera BEP20. Sin garantía, y la app lo avisa claramente. La dirección puede ir firmada por su billetera.",
      alt: "Dirección BEP20 firmada por la billetera del vendedor",
    },
  },
  privacy: {
    title: "Privado por diseño.",
    items: [
      { name: "Cifrado de extremo a extremo", body: "El nodo solo guarda texto cifrado. Ni el operador puede leer tus mensajes." },
      { name: "Se borra solo", body: "Los mensajes desaparecen del nodo 48 horas después de leerlos." },
      { name: "Sin correo ni teléfono", body: "Tu identidad es tu billetera. Conectas Freighter, xBull, Lobstr o creas una nueva." },
      { name: "Nodos abiertos", body: "Cualquiera puede montar su propio nodo. El código es libre." },
    ],
  },
  stellar: {
    title: "Construido sobre Stellar.",
    body: "Pagos en XLM y USDC, garantía en un contrato Soroban y firmas de billetera SEP-53. Todo el código es abierto bajo AGPL-3.0.",
    contract: "Ver el contrato en testnet",
  },
  final: {
    title: "Pruébalo ahora desde tu celular.",
    body: "Escanea el código, conecta tu billetera y escríbele a alguien. Es la red de pruebas: el dinero no es real.",
  },
  footer: "Código abierto bajo AGPL-3.0.",
};

const en: typeof es = {
  nav: { how: "How it works", payments: "Payments", privacy: "Privacy" },
  cta: "Try the demo",
  code: "View the code",
  hero: {
    title: "Chat and pay in the same conversation.",
    body: "Encrypted chat between Stellar wallets, with payments held by a smart contract until you get what you bought.",
  },
  problem: {
    title: "Today you negotiate on WhatsApp and pay in another app. If the seller disappears, so does your money.",
    body: "NodeXchange puts the conversation and the payment together, and adds a guarantee that doesn't rely on trusting anyone.",
  },
  how: {
    title: "Three steps, one app.",
    steps: [
      {
        name: "Scan",
        body: "Everyone has a QR code. Scan it and they're a contact, no phone number needed.",
        img: "/screens/my-qr-crop.webp",
        alt: "Mariela's NodeXchange QR code",
      },
      {
        name: "Chat",
        body: "Messages travel encrypted from wallet to wallet. A stranger can only send you one request.",
        img: "/screens/request-crop.webp",
        alt: "Message request from Joaquín asking about a bike",
      },
      {
        name: "Pay",
        body: "Once you agree, tap Pay and choose how. The receipt stays in the chat.",
        img: "/screens/pay-menu-crop.webp",
        alt: "Payment menu with direct, protected and external options",
      },
    ],
  },
  payments: {
    title: "Pick how to pay by how much you trust.",
    protected: {
      name: "Protected payment",
      body: "The money sits in a Soroban contract. The seller gets it when you confirm delivery; if they don't deliver, you reclaim it after the deadline.",
      alt: "Protected payment of 350 XLM held in the chat",
    },
    direct: {
      name: "Direct payment",
      body: "XLM or USDC that arrives in seconds, with a link to the on-chain receipt.",
    },
    external: {
      name: "External payment",
      body: "To their Binance or another BEP20 wallet. No guarantee, and the app says so clearly. The address can be signed by their wallet.",
      alt: "BEP20 address signed by the seller's wallet",
    },
  },
  privacy: {
    title: "Private by design.",
    items: [
      { name: "End-to-end encrypted", body: "The node only stores ciphertext. Not even the operator can read your messages." },
      { name: "Deletes itself", body: "Messages disappear from the node 48 hours after they are read." },
      { name: "No email or phone", body: "Your wallet is your identity. Connect Freighter, xBull, Lobstr or create a new one." },
      { name: "Open nodes", body: "Anyone can run their own node. The code is free software." },
    ],
  },
  stellar: {
    title: "Built on Stellar.",
    body: "XLM and USDC payments, escrow in a Soroban contract and SEP-53 wallet signatures. All the code is open source under AGPL-3.0.",
    contract: "View the contract on testnet",
  },
  final: {
    title: "Try it now from your phone.",
    body: "Scan the code, connect your wallet and message someone. It runs on testnet: the money isn't real.",
  },
  footer: "Open source under AGPL-3.0.",
};

export const content: Record<Lang, typeof es> = { es, en };
