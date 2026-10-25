# API contract

The frontend talks to exactly two interfaces: `HabitatApi` (REST-shaped reads and commands) and `RealtimeClient` (STOMP-style topics). Today `MockApi` / `MockRealtime` implement them over the in-browser simulation; the Spring Boot backend implements the same shapes later. The TypeScript source of truth is [`src/api/contracts.ts`](../src/api/contracts.ts).

## Conventions
- `id` is a Java `Long` (TypeScript `number`). Every entity also has a human `code` used in URLs (`JZR-AUR-014`, `INC-0042`).
- Times are `java.time.Instant` serialised as ISO-8601 strings (`WRITE_DATES_AS_TIMESTAMPS=false`).
- Enums are Java enum names in `UPPER_SNAKE_CASE`.
- Units are part of field names: `pressureKPa`, `co2Ppm`, `doseUSvH`.
- Growing lists use Spring Data's `Page<T>` (VIA_DTO format: `content` plus `page { size, number, totalElements, totalPages }`).
- Severity order: `NOMINAL < ADVISORY < WARNING < CRITICAL < EMERGENCY`. Offline is a `LinkState`, not a severity.
- Errors: HTTP status plus a message (`HttpError(status, message)` in the client). 404 for unknown codes, 409 for a command that isn't allowed right now (for example "Finish the earlier steps first").

## REST endpoints (proposed mapping for the backend)

| Method | Path | HabitatApi |
|---|---|---|
| POST | /api/auth/login `{ identityCode }` | `login` |
| GET | /api/fleet/summary | `getFleetSummary` |
| GET | /api/settlements | `listSettlements` |
| GET | /api/settlements/{code} | `getSettlementByCode` |
| GET | /api/settlements/{id}/domes | `listDomes` |
| GET | /api/settlements/{id}/features | `listMapFeatures` |
| GET | /api/domes/{id}/homes | `listHomes` |
| GET | /api/homes/{code} | `getHomeByCode` |
| GET | /api/homes/{id}/telemetry?from=&to= | `getTelemetryHistory` |
| GET | /api/homes/{id}/predictions | `listPredictions` |
| GET | /api/alerts?open=&page=&size= | `listAlerts` |
| POST | /api/alerts/{id}/ack | `acknowledgeAlert` |
| GET | /api/incidents?open= | `listIncidents` |
| GET | /api/incidents/{code} | `getIncidentByCode` → `{ incident, events, alerts, run, dispatch }` |
| POST | /api/incidents/{id}/ack | `acknowledgeIncident` |
| POST | /api/incidents/{id}/notes `{ text }` | `addIncidentNote` |
| GET | /api/playbooks | `listPlaybooks` |
| POST | /api/incidents/{id}/playbook | `startPlaybook` |
| POST | /api/playbook-runs/{id}/steps/{code} | `executeStep` |
| PUT | /api/homes/{id}/hatches/{hatchId} `{ state }` | `setHatchState` |
| POST | /api/incidents/{id}/dispatch | `dispatchCrew` |
| GET | /api/regional-events | `listRegionalEvents` |
| GET | /api/work-orders | `listWorkOrders` |
| GET | /api/subscriptions | `listSubscriptions` |
| POST | /api/dev/sim/* | `sim.*` (dev profile only) |

## Topics

| Topic | Payload | Rate |
|---|---|---|
| /topic/sim/clock | `{ simTime, speed }` | every tick |
| /topic/fleet/status | `FleetStatusMessage` | every 2 s |
| /topic/fleet/summary | `FleetSummary` | every 5 s |
| /topic/homes/{homeId}/telemetry | `TelemetrySnapshot` | every tick, only while subscribed |
| /topic/homes/{homeId}/predictions | `Prediction[]` | every tick, only while subscribed |
| /topic/alerts | `{ type: CREATED/UPDATED/CLEARED, alert }` | on change |
| /topic/incidents | `{ incident, event? }` | on change |
| /topic/playbook-runs | `PlaybookRun` | on change |
| /topic/dispatches | `Dispatch` | on change, every tick while en route |
| /topic/regional-events | `RegionalEvent` (intensity 0 = ended) | on change |

## Changes from the original plan
- `PlaybookRun.targetRoomId: Id | null` and `PlaybookRun.targetRoomName: string | null`: the room the playbook acts on (the located leak, the fire room). Step titles in `Playbook` use a `{room}` placeholder that the client fills from `targetRoomName`.
- A `RegionalEvent` with `intensity: 0` on `/topic/regional-events` means the event has ended.
