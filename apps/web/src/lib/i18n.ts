// Tiny i18n: Spanish (default) and English. `t(key, vars)` fills {placeholders}.

import { useSyncExternalStore } from "react";

const es = {
  tagline: "Chat y pagos entre billeteras Stellar · testnet",
  cancel: "Cancelar",
  close: "Cerrar",
  save: "Guardar",
  busy: "Un momento…",
  copied: "Copiado",

  // onboarding
  tabCreate: "Crear billetera",
  tabImport: "Importar",
  tabExternal: "Freighter y otras",
  externalIntro:
    "Conecta Freighter, xBull, Lobstr, Albedo u otra billetera. Firmarás una vez para autorizar este dispositivo a chatear, y cada pago lo apruebas en tu billetera.",
  connectWallet: "Conectar billetera",
  createIntro:
    "Creamos una billetera Stellar en este navegador. ¿Vienes de Binance o Bybit? Crea una aquí y retira XLM hacia ella.",
  importIntro: "Usa una cuenta Stellar que ya tienes.",
  secretKey: "Clave secreta",
  devicePassword: "Contraseña de este dispositivo",
  devicePasswordHint: "Mínimo 8 caracteres. Cifra tu clave en este navegador.",
  repeatPassword: "Repite la contraseña",
  createWallet: "Crear billetera",
  importWallet: "Importar",
  invalidSecret: "Clave secreta inválida (empieza con S).",
  stepEncrypt: "Cifrando tu clave…",
  stepFund: "Activando tu cuenta en testnet…",
  stepAuthorize: "Autorizando este dispositivo para chatear…",
  stepRegister: "Registrándote en el nodo…",
  stepVault: "Cifrando tus llaves en este dispositivo…",
  vaultError: "No se pudieron descifrar los datos de este dispositivo con esta billetera.",
  stepPickWallet: "Elige tu billetera…",
  backupTitle: "Guarda tu clave secreta",
  backupBody:
    "Es la única forma de recuperar tu dinero si borras los datos de este navegador o cambias de dispositivo. Nadie más la tiene, ni siquiera el nodo.",
  backupSaved: "La guardé en un lugar seguro",
  enter: "Entrar a NodeXchange",
  badWalletSignature: "Tu billetera devolvió una firma que no se pudo verificar (SEP-53).",
  wrongAccount: "Conecta la cuenta {expected}; elegiste {chosen}.",

  // unlock
  unlockPrompt: "Desbloquea la billetera",
  password: "Contraseña",
  unlock: "Desbloquear",
  decrypting: "Descifrando…",
  wrongPassword: "Contraseña incorrecta.",
  forgotPassword: "¿Olvidaste la contraseña?",
  resetWallet: "Borrar esta billetera de este navegador (necesitarás tu clave secreta)",

  // header
  wallet: "Billetera",
  copyMyAddress: "Copiar mi dirección",
  enableUsdc: "Activar USDC",
  fundTestnet: "Fondear (testnet)",
  deals: "Pagos protegidos",
  settings: "Ajustes",
  language: "Idioma",

  // sidebar
  newChatPlaceholder: "Dirección G… para chatear",
  newChat: "Nuevo chat",
  invalidAddress: "Dirección Stellar inválida (empieza con G, 56 caracteres).",
  ownAddress: "Esa es tu propia dirección.",
  nodeOffline: "Sin conexión con el nodo: {error}",
  requests: "Solicitudes",
  chats: "Chats",
  noChats: "Aún no tienes chats. Comparte tu dirección o pega la de alguien arriba.",
  emptyPane: "Mensajes cifrados de extremo a extremo · se borran del nodo 48 h después de leerlos",
  previewPay: "Pago de {amount} {asset}",
  previewDeal: "Pago protegido de {amount} {asset}",
  previewDealReleased: "Pago protegido #{id} liberado",
  previewDealRefunded: "Pago protegido #{id} devuelto",

  // block / unblock
  blockTitle: "¿Bloquear a este usuario?",
  blockBody:
    "no podrá enviarte mensajes y se borrará esta conversación de tu dispositivo y de tu nodo. Podrás desbloquearlo después.",
  block: "Bloquear",
  unblockTitle: "¿Desbloquear a este usuario?",
  unblockBody: "podrá volver a escribirte. Su primer mensaje llegará como solicitud.",
  unblock: "Desbloquear",

  // chat
  back: "Volver",
  pay: "Pagar",
  directPayment: "Pago directo",
  directPaymentHint: "Llega al instante. No se puede deshacer.",
  protectedPayment: "Pago protegido",
  protectedPaymentHint: "Queda en garantía hasta que confirmes la entrega.",
  moreOptions: "Más opciones",
  copyAddress: "Copiar dirección",
  blockedBanner: "Tienes bloqueado a este usuario. No puede escribirte.",
  requestBanner: "Solicitud de mensaje de alguien que no conoces.",
  accept: "Aceptar",
  youSent: "Enviaste",
  youReceived: "Recibiste",
  dealReleasedNotice: "Pago protegido #{id} liberado al vendedor",
  dealRefundedNotice: "Pago protegido #{id} devuelto al comprador",
  deleteMessage: "borrar",
  messagePlaceholder: "Mensaje",
  unblockToWrite: "Desbloquea para escribir",
  send: "Enviar",
  errRequestPending: "Ya enviaste tu solicitud. Podrás escribir más cuando la acepte.",
  errBlockedByPeer: "Este usuario te bloqueó.",
  unsentForAll: "Eliminado para todos.",
  keptByPeer: "Borrado aquí. Ya lo había leído, así que aún lo tiene.",

  // payments
  sendTo: "Enviar a {name}",
  amount: "Monto",
  memoOptional: "Memo (opcional)",
  memoHint: "Obligatorio si envías a un exchange como Binance o Bybit.",
  receives: "Recibe",
  nodeFee: "comisión del nodo {fee} {asset} ({pct}%)",
  feeTooHigh:
    "Este nodo pide {pct}% de comisión, más del máximo permitido ({max}%). Por seguridad no se puede pagar a través de él.",
  sendPayment: "Enviar pago",
  sendingPayment: "Firmando y enviando…",
  errNoUsdc: "Este usuario todavía no activó USDC. Pídele que lo active, o envía XLM.",
  errNoAccount: "La cuenta de destino no existe todavía.",
  dealTitle: "Pago protegido (escrow)",
  dealIntro:
    "El dinero queda retenido en un contrato Soroban. {name} cobra cuando confirmes que recibiste el producto. Si no cumple, te lo devuelve o lo recuperas al vencer el plazo. La comisión solo se cobra si el vendedor recibe el pago.",
  term: "Plazo (días, máximo {max})",
  termHint: "Después de este plazo puedes recuperar tu dinero si nadie liberó el pago.",
  arbiterLabel: "Árbitro en caso de disputa:",
  arbiterBody: "(operador de «{node}»). Puede decidir a favor de cualquiera de los dos si no se ponen de acuerdo.",
  noArbiter: "este nodo no tiene árbitro configurado.",
  errNoArbiter: "Este nodo no tiene árbitro configurado.",
  lockFunds: "Bloquear fondos",
  lockingFunds: "Firmando y bloqueando fondos…",
  viewOnChain: "Ver en la red",
  printPdf: "Imprimir / PDF",
  statusFunded: "Fondos retenidos",
  statusReleased: "Pagado al vendedor",
  statusRefunded: "Devuelto al comprador",
  roleBuyer: "compras",
  roleSeller: "vendes",
  roleArbiter: "árbitro",
  seller: "Vendedor",
  buyer: "Comprador",
  dueOn: "vence {date}",
  arbiter: "Árbitro",
  releasePayment: "Recibí el producto: liberar pago",
  reclaimFunds: "Recuperar fondos",
  cancelAndRefund: "Cancelar y devolver",
  queryingContract: "Consultando contrato…",
  notifyFailRelease: "Pago liberado. No se pudo avisar al vendedor por chat, pero lo verá en sus pagos protegidos.",
  notifyFailRefund: "Fondos devueltos. No se pudo avisar por chat, pero se verá en los pagos protegidos.",
  oldContract: "{amount} {asset} en una versión anterior del contrato.",
  dealsTitle: "Mis pagos protegidos",
  dealsIntro:
    "Leídos directamente del contrato en la red: aparecen aunque se hayan borrado los mensajes, hayas cambiado de dispositivo o bloqueado a alguien.",
  noDeals: "Aún no tienes pagos protegidos.",
  protectedPaymentNo: "Pago protegido #{id}",

  // settings
  aliasLabel: "Tu alias",
  aliasHint: "Lo ven las personas con las que hablas, siempre junto a tu dirección. No sirve para buscarte.",
  aliasPlaceholder: "Ej. Romer · Tienda",
  aliasUpdated: "Alias actualizado.",
  aliasRemoved: "Alias eliminado.",
  aliasInvalid: "El alias debe tener de 1 a {max} caracteres visibles.",
  volatileTitle: "Mensajes volátiles en este dispositivo",
  volatileBody:
    "Las copias locales se borran 48 horas después de verlas. Desactívalo para conservarlas hasta que las borres tú.",
  clearHistory: "Borrar todo el historial local",
  historyCleared: "Historial local borrado.",
  blockedUsers: "Usuarios bloqueados",
  node: "Nodo",
  publishNodeHelp:
    "Guarda la dirección de tu nodo dentro de tu cuenta Stellar, para que personas de otros nodos sepan dónde dejarte mensajes. Si todos usan este mismo nodo no hace falta. Bloquea 0.5 XLM de reserva mientras esté publicado.",
  publishNode: "Publicar mi nodo en mi cuenta Stellar",
  nodePublished: "Tu nodo quedó publicado en tu cuenta Stellar. Cualquiera puede encontrarte con tu dirección.",
  revealSecret: "Ver mi clave secreta",
  showSecret: "Mostrar clave",
  logout: "Cerrar sesión y borrar datos locales",
  logoutWarn: "Se borrarán tus mensajes y tus llaves de chat de este navegador.",
  logoutWarnLocal: "También se borrará tu billetera: si no guardaste tu clave secreta, perderás tus fondos.",
  confirmLogout: "Sí, borrar todo de este dispositivo",

  // errors
  errCancelled: "Cancelaste la firma en tu billetera.",
  errPickerClosed: "Cerraste el selector sin elegir una billetera.",
  errUnderfunded: "Saldo insuficiente.",
  errNoTrust: "El destinatario no tiene activado ese activo.",
  errNoDestination: "La cuenta de destino no existe todavía.",

  // receipt
  receiptTitle: "NodeXchange · Comprobante",
  receiptNetwork: "Red Stellar {network}",
  receiptOk: "Exitosa",
  receiptFailed: "Fallida",
  movements: "Movimientos",
  transaction: "Transacción",
  date: "Fecha",
  signedBy: "Firmada por",
  networkCost: "Costo de red",
  from: "De",
  to: "Para",
  mvDeposit: "Depósito en pago protegido",
  mvRelease: "Salida de pago protegido",
  mvPayment: "Pago",
  mvTrust: "Activación de activo",
  mvData: "Publicación de datos",
  escrowContract: "Contrato de garantía NodeXchange",
  receiptNote: "La fuente de verdad es la red Stellar. Verifica este comprobante con su hash en",
  receiptLoading: "Cargando comprobante…",
  popupBlocked: "El navegador bloqueó la ventana del comprobante.",
  // withdraw
  withdraw: "Enviar a otra billetera",
  withdrawHint: "Freighter, Lobstr, Binance, Bybit, Meru…",
  destination: "Dirección de destino",
  maxAmount: "Máximo",
  available: "Disponible: {amount} {asset}",
  exchangeCheck: "Es la dirección de un exchange (Binance, Bybit, Meru…)",
  exchangeMemoWarning: "Los exchanges identifican tu depósito por el memo. Sin memo, tu dinero puede perderse.",
  memoRequired: "Memo (obligatorio)",
  homeDomainHint: "Esta cuenta pertenece a {domain}. Si es un exchange, necesitas su memo.",
  willCreate: "Esta dirección todavía no existe en la red: el envío la creará (mínimo 1 XLM).",
  testnetWarning: "Estás en testnet: estos fondos no tienen valor y no llegan a Binance, Bybit ni Meru, que están en la red real.",
  sendAmount: "Enviar {amount} {asset}",
  withdrawDone: "Enviado.",
  withdrawCreated: "Enviado. La cuenta de destino quedó creada.",
  wdSameAccount: "Esa es tu propia dirección.",
  wdNoAccountUsdc: "La dirección no existe todavía. Envíale primero XLM (mínimo 1) para crearla.",
  wdMinCreate: "Para crear una cuenta nueva debes enviar al menos 1 XLM.",
  wdNoTrustline: "Esa cuenta no tiene USDC activado. Pídele que lo active (en Freighter: Gestionar activos → USDC).",
  wdBadMemo: "El memo de texto admite hasta 28 caracteres.",

  // lock
  lockSession: "Bloquear sesión",
  unlockExternal: "Conecta tu billetera para desbloquear",
};

export type Key = keyof typeof es;

const en: Record<Key, string> = {
  tagline: "Chat and payments between Stellar wallets · testnet",
  cancel: "Cancel",
  close: "Close",
  save: "Save",
  busy: "One moment…",
  copied: "Copied",

  tabCreate: "Create wallet",
  tabImport: "Import",
  tabExternal: "Freighter & others",
  externalIntro:
    "Connect Freighter, xBull, Lobstr, Albedo or another wallet. You sign once to authorize this device to chat, and you approve every payment in your wallet.",
  connectWallet: "Connect wallet",
  createIntro:
    "We create a Stellar wallet in this browser. Coming from Binance or Bybit? Create one here and withdraw XLM to it.",
  importIntro: "Use a Stellar account you already have.",
  secretKey: "Secret key",
  devicePassword: "Password for this device",
  devicePasswordHint: "At least 8 characters. It encrypts your key in this browser.",
  repeatPassword: "Repeat the password",
  createWallet: "Create wallet",
  importWallet: "Import",
  invalidSecret: "Invalid secret key (it starts with S).",
  stepEncrypt: "Encrypting your key…",
  stepFund: "Activating your account on testnet…",
  stepAuthorize: "Authorizing this device to chat…",
  stepRegister: "Registering you on the node…",
  stepVault: "Encrypting your keys on this device…",
  vaultError: "This wallet couldn't decrypt the data stored on this device.",
  stepPickWallet: "Choose your wallet…",
  backupTitle: "Save your secret key",
  backupBody:
    "It is the only way to recover your money if you clear this browser's data or switch devices. Nobody else has it, not even the node.",
  backupSaved: "I saved it somewhere safe",
  enter: "Enter NodeXchange",
  badWalletSignature: "Your wallet returned a signature that could not be verified (SEP-53).",
  wrongAccount: "Connect account {expected}; you chose {chosen}.",

  unlockPrompt: "Unlock wallet",
  password: "Password",
  unlock: "Unlock",
  decrypting: "Decrypting…",
  wrongPassword: "Wrong password.",
  forgotPassword: "Forgot your password?",
  resetWallet: "Remove this wallet from this browser (you will need your secret key)",

  wallet: "Wallet",
  copyMyAddress: "Copy my address",
  enableUsdc: "Enable USDC",
  fundTestnet: "Fund (testnet)",
  deals: "Protected payments",
  settings: "Settings",
  language: "Language",

  newChatPlaceholder: "G… address to chat with",
  newChat: "New chat",
  invalidAddress: "Invalid Stellar address (starts with G, 56 characters).",
  ownAddress: "That is your own address.",
  nodeOffline: "Can't reach the node: {error}",
  requests: "Requests",
  chats: "Chats",
  noChats: "No chats yet. Share your address or paste someone's above.",
  emptyPane: "End-to-end encrypted messages · removed from the node 48 h after being read",
  previewPay: "Payment of {amount} {asset}",
  previewDeal: "Protected payment of {amount} {asset}",
  previewDealReleased: "Protected payment #{id} released",
  previewDealRefunded: "Protected payment #{id} refunded",

  blockTitle: "Block this user?",
  blockBody:
    "won't be able to message you, and this conversation will be deleted from your device and your node. You can unblock them later.",
  block: "Block",
  unblockTitle: "Unblock this user?",
  unblockBody: "will be able to message you again. Their first message will arrive as a request.",
  unblock: "Unblock",

  back: "Back",
  pay: "Pay",
  directPayment: "Direct payment",
  directPaymentHint: "Arrives instantly. Cannot be undone.",
  protectedPayment: "Protected payment",
  protectedPaymentHint: "Held in escrow until you confirm delivery.",
  moreOptions: "More options",
  copyAddress: "Copy address",
  blockedBanner: "You blocked this user. They can't message you.",
  requestBanner: "Message request from someone you don't know.",
  accept: "Accept",
  youSent: "You sent",
  youReceived: "You received",
  dealReleasedNotice: "Protected payment #{id} released to the seller",
  dealRefundedNotice: "Protected payment #{id} refunded to the buyer",
  deleteMessage: "delete",
  messagePlaceholder: "Message",
  unblockToWrite: "Unblock to write",
  send: "Send",
  errRequestPending: "You already sent your request. You can write more once they accept it.",
  errBlockedByPeer: "This user blocked you.",
  unsentForAll: "Deleted for everyone.",
  keptByPeer: "Deleted here. They had already read it, so they still have it.",

  sendTo: "Send to {name}",
  amount: "Amount",
  memoOptional: "Memo (optional)",
  memoHint: "Required when sending to an exchange such as Binance or Bybit.",
  receives: "Receives",
  nodeFee: "node fee {fee} {asset} ({pct}%)",
  feeTooHigh: "This node charges a {pct}% fee, above the {max}% maximum. For your safety you can't pay through it.",
  sendPayment: "Send payment",
  sendingPayment: "Signing and sending…",
  errNoUsdc: "This user hasn't enabled USDC yet. Ask them to enable it, or send XLM.",
  errNoAccount: "The destination account doesn't exist yet.",
  dealTitle: "Protected payment (escrow)",
  dealIntro:
    "The money is held in a Soroban contract. {name} gets paid when you confirm you received the product. If they don't deliver, they refund you or you reclaim it after the term. The fee is only charged if the seller gets paid.",
  term: "Term (days, max {max})",
  termHint: "After this term you can reclaim your money if nobody released the payment.",
  arbiterLabel: "Arbiter in case of dispute:",
  arbiterBody: "(operator of “{node}”). They can decide in favour of either party if you don't agree.",
  noArbiter: "this node has no arbiter configured.",
  errNoArbiter: "This node has no arbiter configured.",
  lockFunds: "Lock funds",
  lockingFunds: "Signing and locking funds…",
  viewOnChain: "View on chain",
  printPdf: "Print / PDF",
  statusFunded: "Funds held",
  statusReleased: "Paid to the seller",
  statusRefunded: "Refunded to the buyer",
  roleBuyer: "buying",
  roleSeller: "selling",
  roleArbiter: "arbiter",
  seller: "Seller",
  buyer: "Buyer",
  dueOn: "due {date}",
  arbiter: "Arbiter",
  releasePayment: "I got the product: release payment",
  reclaimFunds: "Reclaim funds",
  cancelAndRefund: "Cancel and refund",
  queryingContract: "Reading contract…",
  notifyFailRelease: "Payment released. The seller couldn't be notified by chat, but will see it in their protected payments.",
  notifyFailRefund: "Funds refunded. The other party couldn't be notified by chat, but it shows in protected payments.",
  oldContract: "{amount} {asset} in a previous version of the contract.",
  dealsTitle: "My protected payments",
  dealsIntro:
    "Read straight from the contract on chain: they show up even if messages were deleted, you switched devices or blocked someone.",
  noDeals: "No protected payments yet.",
  protectedPaymentNo: "Protected payment #{id}",

  aliasLabel: "Your alias",
  aliasHint: "Shown to the people you talk to, always next to your address. It can't be used to search for you.",
  aliasPlaceholder: "e.g. Romer · Shop",
  aliasUpdated: "Alias updated.",
  aliasRemoved: "Alias removed.",
  aliasInvalid: "The alias must be 1 to {max} visible characters.",
  volatileTitle: "Volatile messages on this device",
  volatileBody: "Local copies are deleted 48 hours after you see them. Turn it off to keep them until you delete them.",
  clearHistory: "Delete all local history",
  historyCleared: "Local history deleted.",
  blockedUsers: "Blocked users",
  node: "Node",
  publishNodeHelp:
    "Stores your node's address in your Stellar account so people on other nodes know where to leave you messages. Not needed if everyone uses this node. Locks a 0.5 XLM reserve while published.",
  publishNode: "Publish my node on my Stellar account",
  nodePublished: "Your node is published on your Stellar account. Anyone can now reach you by your address.",
  revealSecret: "Show my secret key",
  showSecret: "Show key",
  logout: "Log out and delete local data",
  logoutWarn: "Your messages and chat keys will be deleted from this browser.",
  logoutWarnLocal: "Your wallet will be deleted too: if you didn't save your secret key, you will lose your funds.",
  confirmLogout: "Yes, delete everything from this device",

  errCancelled: "You cancelled the signature in your wallet.",
  errPickerClosed: "You closed the picker without choosing a wallet.",
  errUnderfunded: "Insufficient balance.",
  errNoTrust: "The recipient hasn't enabled that asset.",
  errNoDestination: "The destination account doesn't exist yet.",

  receiptTitle: "NodeXchange · Receipt",
  receiptNetwork: "Stellar {network}",
  receiptOk: "Successful",
  receiptFailed: "Failed",
  movements: "Movements",
  transaction: "Transaction",
  date: "Date",
  signedBy: "Signed by",
  networkCost: "Network cost",
  from: "From",
  to: "To",
  mvDeposit: "Deposit into protected payment",
  mvRelease: "Payout from protected payment",
  mvPayment: "Payment",
  mvTrust: "Asset enabled",
  mvData: "Data published",
  escrowContract: "NodeXchange escrow contract",
  receiptNote: "The Stellar network is the source of truth. Verify this receipt by its hash at",
  receiptLoading: "Loading receipt…",
  popupBlocked: "The browser blocked the receipt window.",
  withdraw: "Send to another wallet",
  withdrawHint: "Freighter, Lobstr, Binance, Bybit, Meru…",
  destination: "Destination address",
  maxAmount: "Max",
  available: "Available: {amount} {asset}",
  exchangeCheck: "This is an exchange address (Binance, Bybit, Meru…)",
  exchangeMemoWarning: "Exchanges identify your deposit by its memo. Without it your money can be lost.",
  memoRequired: "Memo (required)",
  homeDomainHint: "This account belongs to {domain}. If it's an exchange, you need its memo.",
  willCreate: "This address doesn't exist on the network yet: the transfer will create it (minimum 1 XLM).",
  testnetWarning: "You're on testnet: these funds have no value and won't reach Binance, Bybit or Meru, which live on the real network.",
  sendAmount: "Send {amount} {asset}",
  withdrawDone: "Sent.",
  withdrawCreated: "Sent. The destination account was created.",
  wdSameAccount: "That is your own address.",
  wdNoAccountUsdc: "This address doesn't exist yet. Send it XLM first (minimum 1) to create it.",
  wdMinCreate: "To create a new account you must send at least 1 XLM.",
  wdNoTrustline: "That account hasn't enabled USDC. Ask them to enable it (in Freighter: Manage assets → USDC).",
  wdBadMemo: "Text memos are limited to 28 characters.",

  lockSession: "Lock session",
  unlockExternal: "Connect your wallet to unlock",
};

export type Lang = "es" | "en";
const dictionaries: Record<Lang, Record<Key, string>> = { es, en };
const STORAGE_KEY = "nx:v1:lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    // storage blocked
  }
  return "es";
}

let current: Lang = initialLang();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // keep it in memory
  }
  document.documentElement.lang = lang;
  for (const l of listeners) l();
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let text = dictionaries[current][key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/** Re-renders the component when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export const locale = () => (current === "es" ? "es" : "en");
