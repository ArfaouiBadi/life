import type { Id } from "../contracts";
import { homeIdFromTopic, type RealtimeClient, type RealtimeStatus } from "../RealtimeClient";
import type { Bus } from "@/sim/engine";

// Periodic topics only keep their latest message while the uplink is down; change topics queue up.
const PERIODIC = /^\/topic\/(sim\/clock|fleet\/|homes\/)/;

export class MockRealtime implements RealtimeClient, Bus {
  private handlers = new Map<string, Set<(msg: unknown) => void>>();
  private statusCbs = new Set<(s: RealtimeStatus) => void>();
  private state: RealtimeStatus = "CLOSED";
  private uplinkDown = false;
  private backlog: { topic: string; msg: unknown }[] = [];
  private latest = new Map<string, unknown>();

  async connect() {
    this.setState("CONNECTING");
    await new Promise((r) => setTimeout(r, 150));
    this.setState(this.uplinkDown ? "CLOSED" : "OPEN");
  }
  disconnect() {
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
    const set = this.handlers.get(topic) ?? new Set();
    set.add(handler as (msg: unknown) => void);
    this.handlers.set(topic, set);
    return () => {
      set.delete(handler as (msg: unknown) => void);
      if (!set.size) this.handlers.delete(topic);
    };
  }

  // ---- Bus (engine side) ----
  publish(topic: string, msg: unknown) {
    if (this.uplinkDown) {
      if (PERIODIC.test(topic)) this.latest.set(topic, msg);
      else this.backlog.push({ topic, msg });
      return;
    }
    this.deliver(topic, msg);
  }
  watchedHomeIds(): Set<Id> {
    const ids = new Set<Id>();
    for (const t of this.handlers.keys()) {
      const id = homeIdFromTopic(t);
      if (id !== null) ids.add(id);
    }
    return ids;
  }
  setUplink(down: boolean) {
    this.uplinkDown = down;
    if (down) {
      this.setState("CLOSED");
      return;
    }
    this.setState("OPEN");
    // Replay what happened while we were blind, then the latest periodic state.
    const queued = this.backlog;
    this.backlog = [];
    for (const { topic, msg } of queued) this.deliver(topic, msg);
    for (const [topic, msg] of this.latest) this.deliver(topic, msg);
    this.latest.clear();
  }

  private deliver(topic: string, msg: unknown) {
    const set = this.handlers.get(topic);
    if (set) for (const h of [...set]) h(msg);
  }
  private setState(s: RealtimeStatus) {
    this.state = s;
    for (const cb of this.statusCbs) cb(s);
  }
}
