// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { FleetSummary, Incident, IncidentEvent, PlaybookRun } from "@/api/contracts";
import { useRealtimeBridge } from "../useRealtimeBridge";
import { useIncidentStore } from "@/stores/incidentStore";
import { useFleetStore } from "@/stores/fleetStore";
import { useSessionStore } from "@/stores/sessionStore";

// The backend adapters, faked: the test plays the socket by calling the status listeners.
const fake = vi.hoisted(() => {
  const statusCbs: ((s: string) => void)[] = [];
  return {
    statusCbs,
    api: {
      listIncidents: vi.fn(),
      listAlerts: vi.fn(),
      listRegionalEvents: vi.fn(),
      getFleetSummary: vi.fn(),
      getIncidentByCode: vi.fn(),
    },
    realtime: {
      connect: vi.fn(async () => {}),
      subscribe: vi.fn(() => () => {}),
      onStatusChange: (cb: (s: string) => void) => {
        statusCbs.push(cb);
        return () => {};
      },
    },
  };
});
vi.mock("@/api", () => ({ api: fake.api, realtime: fake.realtime, isMock: false }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const incident = { id: 7, code: "INC-0007", homeId: 14, status: "MITIGATING" } as Incident;
const run = (status: PlaybookRun["status"]) => ({ id: 3, incidentId: 7, status, steps: [] }) as unknown as PlaybookRun;
const sealed = { id: 90, incidentId: 7, ts: "2061-03-14T03:14:00Z", kind: "STEP_DONE", actor: "Autopilot", text: "Hatch sealed." } as IncidentEvent;
const status = (s: string) => fake.statusCbs.forEach((cb) => cb(s));

it("against the backend, reloads incidents, playbooks and history at sign-in and after each reconnect", async () => {
  fake.api.listIncidents.mockResolvedValue([incident]);
  fake.api.listAlerts.mockResolvedValue({ content: [], page: { size: 500, number: 0, totalElements: 0, totalPages: 0 } });
  fake.api.listRegionalEvents.mockResolvedValue([]);
  fake.api.getFleetSummary.mockResolvedValue({ homes: 452 } as FleetSummary);
  fake.api.getIncidentByCode.mockResolvedValue({ incident, events: [], alerts: [], run: run("PENDING"), dispatch: null });

  renderHook(() => useRealtimeBridge());
  await waitFor(() => expect(useIncidentStore.getState().runs[7]?.status).toBe("PENDING"));

  // The first attempt fails before any clock message: the console must still leave "uplink down" on connect.
  status("CONNECTING");
  status("CLOSED");
  expect(useIncidentStore.getState().uplinkDown).toBe(true);
  status("CONNECTING");
  status("OPEN");
  expect(useIncidentStore.getState().uplinkDown).toBe(false);
  await waitFor(() => expect(fake.api.getIncidentByCode).toHaveBeenCalledTimes(2));

  // A real outage: the home seals the hatch on its own meanwhile, and the broker replays nothing.
  useFleetStore.getState().setClock("2061-03-14T03:10:00Z", 1);
  status("CLOSED");
  fake.api.getIncidentByCode.mockResolvedValue({ incident, events: [sealed], alerts: [], run: run("RUNNING"), dispatch: null });
  status("OPEN");
  await waitFor(() => expect(toast).toHaveBeenCalledWith("While the uplink was down", expect.anything()));
  expect(useIncidentStore.getState().runs[7]?.status).toBe("RUNNING");
  expect(useIncidentStore.getState().events[7]).toEqual([sealed]);

  useSessionStore.getState().signIn({ token: "tok-2", user: { id: 1, name: "Lina Haddad", role: "OPERATOR", homeId: null } });
  await waitFor(() => expect(fake.api.getIncidentByCode).toHaveBeenCalledTimes(4));
  expect(toast.error).not.toHaveBeenCalled();
});
