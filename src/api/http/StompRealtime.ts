import { Client, ReconnectionTimeMode, type StompSubscription } from "@stomp/stompjs";
import type { RealtimeClient, RealtimeStatus } from "../RealtimeClient";

const defaultUrl = () => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

/** RealtimeClient over STOMP (raw WebSocket, Spring's broker at /ws). One broker subscription per topic, fanned out here. */
export class StompRealtime implements RealtimeClient {
  private client: Client;
  private handlers = new Map<string, Set<(msg: unknown) => void>>();
  private subs = new Map<string, StompSubscription>(); // broker side; they die with the connection
  private statusCbs = new Set<(s: RealtimeStatus) => void>();
  private state: RealtimeStatus = "CLOSED";

  constructor(brokerURL: string = import.meta.env.VITE_WS_URL ?? defaultUrl()) {
    this.client = new Client({
      brokerURL,
      // Retry after 1 s, 2 s, 4 s ... then every 30 s; a handshake with no answer in 10 s counts as failed.
      reconnectDelay: 1000,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
      maxReconnectDelay: 30_000,
      connectionTimeout: 10_000,
      beforeConnect: () => this.setState("CONNECTING"), // before every attempt, reconnects included
      onConnect: () => {
        // New session: subscribe everything asked for so far, including what came before connect().
        for (const topic of this.handlers.keys()) this.wire(topic);
        this.setState("OPEN");
      },
      onWebSocketClose: () => {
        this.subs.clear();
        this.setState("CLOSED");
      },
    });
  }

  async connect() {
    this.client.activate(); // ignored if already active; progress arrives through onStatusChange
  }
  disconnect() {
    void this.client.deactivate();
    this.subs.clear();
    this.setState("CLOSED");
  }
  status() {
    return this.state;
  }
  onStatusChange(cb: (s: RealtimeStatus) => void) {
    this.statusCbs.add(cb);
    return () => void this.statusCbs.delete(cb);
  }
  subscribe<T>(topic: string, handler: (msg: T) => void) {
    const h = handler as (msg: unknown) => void;
    const set = this.handlers.get(topic) ?? new Set();
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, set);
      if (this.client.connected) this.wire(topic); // otherwise onConnect does it
    }
    set.add(h);
    return () => {
      set.delete(h);
      if (set.size || this.handlers.get(topic) !== set) return; // others still listen, or already gone
      this.handlers.delete(topic);
      const sub = this.subs.get(topic);
      this.subs.delete(topic);
      if (sub && this.client.connected) sub.unsubscribe();
    };
  }

  private wire(topic: string) {
    this.subs.set(topic, this.client.subscribe(topic, (m) => this.deliver(topic, m.body)));
  }
  private deliver(topic: string, body: string) {
    try {
      const msg: unknown = JSON.parse(body);
      for (const h of [...(this.handlers.get(topic) ?? [])]) h(msg);
    } catch (e) {
      console.error(`Bad message on ${topic}`, e); // one bad frame must not stop the frames behind it
    }
  }
  private setState(s: RealtimeStatus) {
    if (s === this.state) return;
    this.state = s;
    for (const cb of [...this.statusCbs]) cb(s);
  }
}
