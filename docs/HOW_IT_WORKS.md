# How Life works

Plain-language notes for the team. Every part of this is something the jury may ask about.

## 1. The shape of the system

```
React screens ──hooks──► TanStack Query (reads)      Zustand stores (live state)
                              │                              ▲
                              ▼                              │ topic messages
                        HabitatApi (interface)        RealtimeClient (interface)
                         ├─ MockApi ──┐                ├─ MockRealtime ◄──┐
                         └─ HttpApi   │                └─ StompRealtime   │
                                      ▼                                   │
                              Simulation engine (src/sim) ────────────────┘
```

- **Screens never compute physics or business rules.** They render DTOs (data transfer objects). Today the mock adapter computes them; later the Spring Boot backend does. That's why swapping to the real backend needs no UI rewrite.
- **Two interfaces only.** `HabitatApi` for request/response, `RealtimeClient` for live topics. Components never import the simulation (an ESLint rule enforces it). The one exception is the Demo Director, which calls `api.sim.*`.
- **The safety net.** `?source=mock` in the URL forces the simulation even if the app is configured for the backend. If the backend fails on stage, reload with it.
- **Honesty.** A "Simulated telemetry" badge is always visible in mock mode. We never claim real sensors.

## 2. The simulated world

- Seeded random numbers (mulberry32). Same seed, same world: default seed 2061, change it with `?seed=`. `Math.random()` is only used for visual effects.
- 5 real Mars locations (Jezero Crater, Utopia Planitia, Arcadia Planitia, Gale Crater, Elysium Planitia), 17 domes, 480 homes, about 1,500 people.
- Each settlement has a 4,000 × 2,600 m map frame. Domes are placed randomly but at least 220 m apart; pressurised tunnels join them along a minimum spanning tree plus one extra edge, so there's one loop (a tunnel can fail without cutting a dome off).
- Homes sit on a hex grid inside each dome; hex 0 is the dome's life-support core.
- Two floor plans: FAMILY (16 × 10 m, 416 m³ of connected air) and POD (10 × 6 m, 156 m³). Volume = floor area × 2.6 m ceiling.
- The hero home is **JZR-AUR-014**, the Trabelsi family: Amira (41), Sami (43), Nour (12), Youssef (8). At night Youssef sleeps alone in Bedroom 2, the room that gets breached.

## 3. The clock and Mars time

- The engine ticks once per real second and advances the simulation by 1 s × speed (1, 10, 60 or 300), in sub-steps of at most 10 sim-seconds.
- Mars time uses NASA's Mars24 algorithm: convert to Julian date, then to the Mars Sol Date (MSD). A sol is 88,775.244 s (24 h 39 min 35 s).
- Each settlement shows Local Mean Solar Time: Coordinated Mars Time plus 1 hour per 15° of east longitude.
- Every timestamp on screen comes from the simulation clock, never from the computer's clock.

## 4. Air: the leak model (know this by heart)

**Zones.** Rooms joined by open hatches share air. We find the groups with union-find; air mixes instantly inside a zone. (Real air takes minutes to mix; we say so openly.)

**Why a puncture empties a home exponentially.** Outside is ~0.6 kPa, far below 0.528 × cabin pressure, so the flow through the hole is *choked* (it reaches the speed of sound and can't go faster). Choked mass flow is proportional to the pressure inside, so pressure falls in proportion to itself:

```
dP/dt = −k·P        k = CD · A · Γ · √(γ·R·T) / V = 121.2 · A / V
P(t)  = P₀ · e^(−k·t)
time to threshold = ln(P₀ / P_threshold) / k
```

CD = 0.61 (discharge coefficient), Γ = 0.5787 (choked-flow factor for air), √(γRT) = 343.2 m/s at 20 °C. Together: 121.2 m/s.

**Worked example.** FAMILY home, all hatches open, V = 416 m³, hole A = 1.5 cm² = 1.5×10⁻⁴ m²:
- k = 121.2 × 1.5×10⁻⁴ / 416 = **4.37×10⁻⁵ s⁻¹**
- Oxygen falls from 21.2 to 16.0 kPa (unsafe) in ln(21.2/16.0) / k ≈ **6,440 s ≈ 1 h 47 min**.
- Seal Bedroom 2 on its own (V = 41.6 m³): k is 10× bigger, unsafe in **≈ 644 s ≈ 11 minutes**. Sealing protects everyone else, and nobody may be left inside.

**Other sources and sinks per zone, every sub-step.**
- Breathing: −7.41×10⁻⁴ kPa·m³/s of O₂ per person (0.84 kg/day), +6.55 ppm·m³/s of CO₂ (1.04 kg/day).
- Oxygen generator (in the utility room's zone): tops O₂ back up, but only enough for 6 people. It is ~90× too weak for a 1.5 cm² leak. That's realistic, and it's why the playbook seals and adds emergency oxygen.
- CO₂ scrubber (only in its own zone): removes 3×10⁻⁴/s × (CO₂ − 400 ppm). Four people in 416 m³ settle at ~610 ppm, a normal indoor value. A sealed bedroom with someone in it is outside the scrubber's zone, so its CO₂ rises. That's correct physics.
- CO₂ is a mole fraction (ppm), so a leak doesn't change it; only N₂ and O₂ partial pressures fall.

## 5. Sensors

- Published readings get Gaussian noise (pressure σ 0.02 kPa, O₂ σ 0.01 kPa, CO₂ σ 15 ppm, temperature σ 0.1 °C). Noise is applied only to what sensors report, never to the true state.
- Every room has an ultrasonic leak microphone: 0.6–1.0 in the breached room, ~0.02 elsewhere. Pressure is shared across a zone, so this is how we know *which* room leaks.
- A gateway that stops sending heartbeats for 15 s makes the home OFFLINE (shown dashed).

## 6. Predictions: how we know the time left

**Exponential fit.** Take ln(pressure) over the last 10 minutes of samples and fit a straight line by least squares. The slope is −k. R² (0–1) says how well the line fits, and is shown as the confidence.

- Onset detection: the fit starts where pressure leaves its flat plateau, so pre-breach samples don't drag k down.
- Time to unsafe air = ln(current O₂ / 16.0) / k. We use k from the *pressure* fit: a leak removes every gas at the same rate, and pressure has the better signal-to-noise ratio.
- Leak size: invert k = 121.2·A/V → A = k·V/121.2. On the hero breach this recovers 1.5 cm².
- A light smoother carries the previous countdown forward by the elapsed time and moves a third of the way to the new fit, so the number ticks down steadily while the fit settles (about 2–3 minutes).

**Other models.** CO₂, smoke and radiation use a straight-line fit toward the emergency threshold. Battery uses an energy balance: walk the next 24 Mars hours in 10-minute steps (sun curve × dust × panel health minus loads) and report the first time the battery hits zero. Water: tank ÷ net loss.

**Headline time-to-danger** of a home = the smallest time among zones where people are breathing. An empty, sealed, leaking bedroom doesn't drive the headline; it shows as "Sealed and empty".

## 7. Detection and severity

- Thresholds (configurable; real values would be set with experts): O₂ below 19.5 / 17.5 / 16.0 kPa; CO₂ above 2,500 / 5,000 / 20,000 ppm; smoke 10 / 30 / 60; dose 30 / 100 / 250 µSv/h; battery empty within 24 / 6 / 2 h; water within 14 / 5 / 2 sols; equipment below 85 (advisory) / 70 / 50%.
- **We alarm on time left, not only on current values.** 2 hours or less → at least warning; 30 minutes → at least critical; 10 minutes → emergency.
- **Two sensors before critical.** A pressure fit (k > 5×10⁻⁶ s⁻¹, R² > 0.8) alone is a warning ("Air pressure falling"). Confirmed by the ultrasonic sensor in an occupied zone, it's always at least critical ("Air leak in Bedroom 2"). This is our answer to "what about false alarms?".
- **Hysteresis.** Severity only goes down after 30 sim-seconds clear, so alarms don't flicker. Part of the anti-alarm-fatigue story.
- Home severity = worst of occupied zones and systems; empty sealed rooms are capped at warning for the headline but stay red on the floor plan.

## 8. Incidents, playbooks, autopilot

- Alerts that share a cause on one home become one incident (pressure falling + oxygen low = one PRESSURE_LOSS incident).
- Regional events: a dust storm or solar storm is one line ("Dust storm over Arcadia Reach: 104 homes on reduced solar, 3 need action"). A home only gets its own incident when it reaches critical.
- Lifecycle: detected → acknowledged → mitigating → monitoring → resolved (after 5 sim-minutes stable).
- **Auto-run:** if nobody acknowledges within 20 real seconds (demo), the playbook starts on its own: "No operator response in 20 s. Playbook started automatically."
- **Home autopilot:** safety-critical steps run inside the home even with no link to the control room. If a home is in an emergency (or critical while the uplink is down) and nobody acknowledges for 60 sim-seconds, the home runs the steps marked autopilot itself, but it never seals a room with a person inside.
- The breach playbook: locate → alert residents → clear the room → seal the hatch (with the guard "Youssef is still in Bedroom 2. Seal the hatch anyway?") → emergency oxygen if needed → dispatch the crew → patch and repressurise → watch 5 minutes.

## 9. Performance and scale

- Full telemetry is only published for homes someone is looking at (open twin, resident app, open incidents), at most 20. Everyone else gets a compact status every 2 s. The real backend must scale the same way.
- One tick for 480 homes takes ~3.8 ms at 1× speed. The trick: a quiet home (every reading comfortably inside its limits) skips the rule engine that tick.

## 10. Why each library is there
(Filled in as the UI lands; see CREDITS.md for licenses.)
