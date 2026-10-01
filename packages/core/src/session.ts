// A signed-in device talking to NodeXchange nodes. Used by the web app and CLI.

import {
  issueCert,
  openEnvelope,
  sealPayload,
  signRequest,
  createDeviceKeys,
  type DeviceKeys,
  type WalletSigner,
} from "./device.ts";
import {
  ProtocolError,
  parseCertBody,
  verifyCert,
  type Action,
  type CertBody,
  type DeviceCert,
  type Envelope,
  type Payload,
  type SignedProfile,
  type SignedRequest,
  normalizeAlias,
  verifyProfile,
} from "./protocol.ts";
import type { Stellar } from "./stellar.ts";

export interface NodeInfo {
  name: string;
  version: number;
  maxChars: number;
  operator: string;
  transferFeeBps: number;
}

export interface InboxItem {
  envelope: Envelope;
  senderCert: DeviceCert;
  request: boolean;
  readAt: number | null;
  expiresAt: number;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  ts: number;
  payload: Payload;
  request: boolean;
  readAt: number | null;
  expiresAt: number;
}

export class NodeClient {
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  private async json<T>(res: Response): Promise<T> {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ProtocolError(data.code ?? "node_error", data.error ?? res.statusText, res.status);
    }
    return data as T;
  }

  async info(): Promise<NodeInfo> {
    return this.json(await fetch(`${this.url}/info`));
  }

  /** A registered user's device certificate and (signed) profile. */
  async keys(address: string): Promise<{ cert: DeviceCert; profile: SignedProfile | null } | null> {
    const res = await fetch(`${this.url}/keys/${address}`);
    if (res.status === 404) return null;
    const data = await this.json<{ cert: DeviceCert; profile?: SignedProfile | null }>(res);
    return { cert: data.cert, profile: data.profile ?? null };
  }

  async cert(address: string): Promise<DeviceCert | null> {
    return (await this.keys(address))?.cert ?? null;
  }

  async post<T>(signed: SignedRequest): Promise<T> {
    return this.json(
      await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(signed),
      }),
    );
  }
}

/** Everything a device needs to persist to stay signed in. */
export interface SessionState {
  address: string;
  homeNode: string;
  keys: DeviceKeys;
  cert: DeviceCert;
}

export class Session {
  private nodeCache = new Map<string, string>();
  readonly state: SessionState;
  readonly stellar: Stellar;

  constructor(state: SessionState, stellar: Stellar) {
    this.state = state;
    this.stellar = stellar;
  }

  get address() {
    return this.state.address;
  }

  /** Creates device keys and asks the wallet to authorise them (one signature). */
  static async create(
    address: string,
    homeNode: string,
    signWithWallet: WalletSigner,
    stellar: Stellar,
  ): Promise<Session> {
    const keys = createDeviceKeys();
    const cert = await issueCert(address, keys, homeNode, signWithWallet);
    return new Session({ address, homeNode, keys, cert }, stellar);
  }

  private call<T>(node: string, action: Action): Promise<T> {
    return new NodeClient(node).post<T>(signRequest(this.state.keys, this.state.cert, node, action));
  }

  private home<T>(action: Action): Promise<T> {
    return this.call(this.state.homeNode, action);
  }

  /** Publishes this device's cert on the home node so others can reach us. */
  register(): Promise<{ ok: true }> {
    return this.home({ action: "register", data: {} });
  }

  /** Where `peer` receives messages: the node published on-chain, else ours. */
  async nodeOf(peer: string): Promise<string> {
    const cached = this.nodeCache.get(peer);
    if (cached) return cached;
    const node = (await this.stellar.nodeOf(peer)) ?? this.state.homeNode;
    this.nodeCache.set(peer, node);
    return node;
  }

  /** Verified certificate and alias of `peer`, fetched from their home node. */
  async peer(peer: string): Promise<{ cert: CertBody; alias: string | null }> {
    const node = await this.nodeOf(peer);
    const keys = await new NodeClient(node).keys(peer);
    if (!keys) throw new ProtocolError("unknown_peer", "this address is not on NodeXchange yet", 404);
    const cert = await verifyCert(keys.cert);
    if (cert.address !== peer) throw new ProtocolError("bad_cert", "node returned a foreign certificate");
    return { cert, alias: verifyProfile(cert, keys.profile) };
  }

  async peerCert(peer: string): Promise<CertBody> {
    return (await this.peer(peer)).cert;
  }

  /** Sets (or clears, with null) the alias others see next to our address. */
  async setAlias(alias: string | null): Promise<{ ok: true; alias: string | null }> {
    return this.home({ action: "profile", data: { alias: normalizeAlias(alias) } });
  }

  async send(peer: string, payload: Payload): Promise<Envelope> {
    const to = await this.peerCert(peer);
    const envelope = sealPayload(this.state.keys, this.address, to, payload);
    await this.call(await this.nodeOf(peer), { action: "send", data: { envelope } });
    return envelope;
  }

  /** Fetches and decrypts our inbox. Messages that fail verification are dropped. */
  async inbox(): Promise<Message[]> {
    const { items } = await this.home<{ items: InboxItem[] }>({ action: "inbox", data: {} });
    const out: Message[] = [];
    for (const item of items) {
      try {
        const payload = await openEnvelope(this.state.keys, item.envelope, item.senderCert);
        const { id, from, to, ts } = item.envelope;
        out.push({ id, from, to, ts, payload, request: item.request, readAt: item.readAt, expiresAt: item.expiresAt });
      } catch {
        // forged or corrupted: ignore
      }
    }
    return out;
  }

  /** Marks messages as read: the node deletes them 48 hours later. */
  ack(ids: string[]) {
    return this.home({ action: "ack", data: { ids } });
  }

  deleteFromNode(ids: string[]) {
    return this.home({ action: "delete", data: { ids } });
  }

  /** "Delete for everyone": only works while the recipient has not read it. */
  async unsend(peer: string, id: string) {
    return this.call<{ deleted: boolean }>(await this.nodeOf(peer), { action: "unsend", data: { id } });
  }

  setContact(peer: string, status: "accepted" | "blocked" | "none") {
    return this.home({ action: "contact", data: { peer, status } });
  }

  certBody(): CertBody {
    return parseCertBody(this.state.cert.body);
  }
}
