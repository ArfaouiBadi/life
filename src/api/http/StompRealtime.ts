import type { RealtimeClient, RealtimeStatus } from "../RealtimeClient";

// Stub until phase 11 (@stomp/stompjs is installed then, not before).
export class StompRealtime implements RealtimeClient {
  async connect() {}
  disconnect() {}
  status(): RealtimeStatus {
    return "CLOSED";
  }
  onStatusChange() {
    return () => {};
  }
  subscribe() {
    return () => {};
  }
}
