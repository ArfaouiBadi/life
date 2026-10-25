import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpAdapters, httpApi } from "../http/HttpApi";
import { StompRealtime } from "../http/StompRealtime";
import { HttpError } from "../errors";

// Stand-in for @stomp/stompjs's Client: the tests play the broker by calling its lifecycle callbacks.
const stomp = vi.hoisted(() => {
  interface Config {
    beforeConnect: () => void;
    onConnect: () => void;
    onWebSocketClose: () => void;
  }
  class FakeClient {
    static last: FakeClient;
    config: Config;
    connected = false;
    active = false;
    subscribe = vi.fn((_topic: string, onMessage: (m: { body: string }) => void) => ({ onMessage, unsubscribe: vi.fn() }));
    deactivate = vi.fn(async () => {});
    constructor(config: Config) {
      this.config = config;
      FakeClient.last = this;
    }
    activate() {
      if (this.active) return;
      this.active = true;
      this.config.beforeConnect();
    }
    open() {
      this.connected = true;
      this.config.onConnect();
    }
    drop() {
      this.connected = false;
      this.config.onWebSocketClose();
    }
  }
  return { FakeClient };
});
vi.mock("@stomp/stompjs", () => ({ Client: stomp.FakeClient, ReconnectionTimeMode: { LINEAR: 0, EXPONENTIAL: 1 } }));

const client = () => stomp.FakeClient.last;
const brokerSub = (i: number) => client().subscribe.mock.results[i].value;
const send = (i: number, msg: unknown) => brokerSub(i).onMessage({ body: JSON.stringify(msg) });

const fetchMock = vi.fn<typeof fetch>();
const storage = new Map<string, string>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sent = (n = 0) => {
  const [url, init] = fetchMock.mock.calls[n];
  return { url, method: init?.method, body: init?.body, headers: init?.headers as Record<string, string> };
};

beforeEach(() => {
  fetchMock.mockReset();
  storage.clear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("sessionStorage", { getItem: (k: string) => storage.get(k) ?? null });
  vi.stubGlobal("location", { protocol: "http:", host: "localhost:5173" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("HttpApi", () => {
  it("sends the session's bearer token and parses the answer", async () => {
    storage.set("life.session", JSON.stringify({ token: "tok-1", user: { id: 1, name: "Lina Haddad", role: "OPERATOR", homeId: null } }));
    fetchMock.mockResolvedValue(json({ code: "JZR-AUR-014" }));
    await expect(httpApi.getHomeByCode("JZR-AUR-014")).resolves.toEqual({ code: "JZR-AUR-014" });
    expect(sent()).toMatchObject({ url: "/api/homes/JZR-AUR-014", method: "GET", body: undefined, headers: { Authorization: "Bearer tok-1" } });
  });

  it("follows the REST table for commands and filters", async () => {
    fetchMock.mockImplementation(async () => json({}));
    await httpApi.login("OPS");
    await httpApi.setHatchState(3, 9, "SEALED");
    await httpApi.executeStep(5, "SEAL_HATCH");
    await httpApi.listAlerts({ open: true, size: 500 });
    await httpApi.listIncidents({});
    expect(sent(0)).toMatchObject({ url: "/api/auth/login", method: "POST", body: '{"identityCode":"OPS"}', headers: { "Content-Type": "application/json" } });
    expect(sent(0).headers.Authorization).toBeUndefined(); // nobody is signed in yet
    expect(sent(1)).toMatchObject({ url: "/api/homes/3/hatches/9", method: "PUT", body: '{"state":"SEALED"}' });
    expect(sent(2)).toMatchObject({ url: "/api/playbook-runs/5/steps/SEAL_HATCH", method: "POST", body: undefined });
    expect(sent(3).url).toBe("/api/alerts?open=true&size=500");
    expect(sent(4).url).toBe("/api/incidents");
  });

  it("sends sim calls to /api/dev/sim and accepts empty answers", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await expect(httpApi.sim.setSpeed(60)).resolves.toBeUndefined();
    await httpApi.sim.setLocalTime(2, 3.5);
    await httpApi.sim.reset();
    await httpApi.sim.injectScenario({ kind: "BREACH", homeId: 14 });
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${String(url)} ${init?.body}`)).toEqual([
      'POST /api/dev/sim/speed {"multiplier":60}',
      'POST /api/dev/sim/local-time {"settlementId":2,"lmstHours":3.5}',
      "POST /api/dev/sim/reset {}",
      'POST /api/dev/sim/scenarios {"kind":"BREACH","homeId":14}',
    ]);
  });

  it("turns failures into HttpError, with Spring's message when there is one", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 409, error: "Conflict", message: "Finish the earlier steps first" }, 409));
    const conflict = httpApi.executeStep(5, "PATCH");
    await expect(conflict).rejects.toBeInstanceOf(HttpError);
    await expect(conflict).rejects.toMatchObject({ status: 409, message: "Finish the earlier steps first" });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 })); // what the dev proxy answers with no backend
    await expect(httpApi.getFleetSummary()).rejects.toMatchObject({ status: 502, message: "GET /api/fleet/summary failed (HTTP 502)." });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(httpApi.listIncidents({ open: true })).rejects.toMatchObject({ status: 0, message: "No answer from /api/incidents?open=true (Failed to fetch)." });
  });

  it("fails fast at startup when the backend is down, and counts a 401 as up", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 502 }));
    await expect(createHttpAdapters()).rejects.toThrow("The Life backend at /api is not available. GET /api/settlements failed (HTTP 502).");

    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    const adapters = await createHttpAdapters();
    expect(adapters.api).toBe(httpApi);
    expect(adapters.realtime).toBeInstanceOf(StompRealtime);
  });
});

describe("StompRealtime", () => {
  it("sends subscriptions made before connect, again after every reconnect, and reports each state", () => {
    const rt = new StompRealtime("ws://test/ws");
    const states: string[] = [];
    rt.onStatusChange((s) => states.push(s));
    const got: unknown[] = [];
    rt.subscribe("/topic/alerts", (m) => got.push(m));
    expect(client().subscribe).not.toHaveBeenCalled();

    void rt.connect();
    client().open();
    expect(client().subscribe.mock.calls.map((c) => c[0])).toEqual(["/topic/alerts"]);
    send(0, { n: 1 });

    client().drop();
    client().config.beforeConnect(); // the client's own retry
    client().open();
    expect(client().subscribe).toHaveBeenCalledTimes(2);
    send(1, { n: 2 });
    expect(got).toEqual([{ n: 1 }, { n: 2 }]);

    rt.disconnect();
    expect(client().deactivate).toHaveBeenCalled();
    expect(states).toEqual(["CONNECTING", "OPEN", "CLOSED", "CONNECTING", "OPEN", "CLOSED"]);
    expect(rt.status()).toBe("CLOSED");
  });

  it("keeps one broker subscription per topic and drops it with the last handler", () => {
    const rt = new StompRealtime("ws://test/ws");
    void rt.connect();
    client().open();
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = rt.subscribe("/topic/homes/7/telemetry", (m) => a.push(m));
    const offB = rt.subscribe("/topic/homes/7/telemetry", (m) => b.push(m));
    expect(client().subscribe).toHaveBeenCalledTimes(1);
    send(0, 1);
    offA();
    send(0, 2);
    expect([a, b]).toEqual([[1], [1, 2]]);

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => brokerSub(0).onMessage({ body: "{not json" })).not.toThrow();
    expect(log).toHaveBeenCalledOnce();

    expect(brokerSub(0).unsubscribe).not.toHaveBeenCalled();
    offB();
    offB(); // twice is harmless
    expect(brokerSub(0).unsubscribe).toHaveBeenCalledOnce();
  });

  it("leaves dead broker subscriptions alone while disconnected", () => {
    const rt = new StompRealtime("ws://test/ws");
    void rt.connect();
    client().open();
    const off = rt.subscribe("/topic/incidents", () => {});
    client().drop();
    off(); // the real client throws if asked to unsubscribe without a connection
    expect(brokerSub(0).unsubscribe).not.toHaveBeenCalled();
    client().config.beforeConnect();
    client().open();
    expect(client().subscribe).toHaveBeenCalledTimes(1); // not subscribed again
  });
});
