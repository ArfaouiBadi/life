# Decisions

One line per call the plan left open, or where the plan had to bend. Newest at the bottom.

## Product and tooling
- The product is called **Life** (the plan calls it HabitatGuard). The emergency severity is described as "Someone is in danger" so it doesn't read as "the Life system is at risk".
- The plan's sections 11–17 and appendices A–B were not available when building started. Phases were inferred from the route table (phase column) and screens built from sections 9–10; anything else follows "simplest option that keeps the demo reliable".
- Vite 8, TypeScript 6, React 19, React Router 8 (the plan says v7; v8 is the current stable `react-router` package with the same API surface we use).
- The Vite template now ships oxlint; replaced with ESLint + typescript-eslint as the plan specifies.
- shadcn initialised with the Radix base and the Nova preset; its Geist font and `next-themes` were removed (fonts are Archivo/Newsreader, the theme is fixed per app).
- `baseUrl` is deprecated in TypeScript 6, so the `@/*` alias uses `paths` only.

## Contracts
- `PlaybookRun` gains `targetRoomId` and `targetRoomName`, so step titles like "Seal Bedroom 2 hatch" come from the server, not from UI guesswork. Documented in API_CONTRACT.md.
- `HttpError(status, message)` is the shared error shape for both adapters (mirrors Spring's status + message).

## Simulation
- Base power loads are 1.8 kW (FAMILY) / 0.9 kW (POD), not 2.6 / 1.5. With the plan's numbers a clear sol drains every battery (9 kW peak × ~7.9 sun-hours ≈ 67 kWh in, ~74 kWh out), which would put the whole fleet in battery alarm within days. Shed loads are 1.0 / 0.5 kW. Night heating stays +0.8 kW.
- Equipment starts at 86–100% health (not 82%). Starting at 82% puts most homes below the 85% advisory line, so the map would not be a dark cockpit. The 4% advisory homes are chosen explicitly.
- Water recycler recovery is 98% down to 90% health, then loses 1.5 points per point of health (71% health → 69.5% recovery). The plan's "98% × health" would put healthy homes near the 14-sol warning.
- CO₂ in ppm is a mole fraction, so a leak does not change it (only pN₂ and ppO₂ decay).
- The fit window starts where pressure leaves its plateau (onset detection). Without it, flat pre-breach samples in the 10-minute window make the fit underestimate k by ~25% for the first minutes.
- Time-to-danger for oxygen uses the pressure fit's k (a leak removes every gas at the same rate, and the pressure signal has better relative precision), with a gentle countdown smoother so the number ticks down steadily while the fit settles.
- Headline time-to-danger ignores predictions more than 48 h out and ignores water (measured in sols, it would otherwise always be "the" headline).
- Baseline warnings (two scrubbers at 62%, one recycler at 71%) open incidents that are pre-acknowledged by "Omar Farouk" from the previous shift, so they don't auto-run playbooks during the pitch.
- Equipment issues are grouped under the incident type their failure leads to: scrubber → CO2_BUILDUP, recycler → WATER_SHORTAGE, battery/solar → POWER_DEFICIT. This makes PB_CO2 and PB_WATER reachable from equipment warnings.
- HOME_OFFLINE incidents carry severity ADVISORY (offline is a link state, but an incident needs a severity).
- Home autopilot (8.13) also takes over at CRITICAL when the uplink is down, not only at EMERGENCY: nobody can acknowledge, and a 1.5 cm² breach is CRITICAL, not EMERGENCY.
- Control-room auto-run runs AUTO steps and stops at CONFIRM steps; only the home autopilot executes CONFIRM steps marked `autopilot: true` (and never seals a room with someone inside).
- VERIFY in the breach playbook also waits until the sealed room is back within 1 kPa of nominal, then reopens its hatch.
- Detection fast path: a home whose readings sit comfortably inside every limit skips the rule engine for that tick. This took a 480-home tick from 14.7 ms to 3.8 ms at 1×. At 300× the 30 sub-steps cost ~40 ms per tick, which is still 4% of the 1-second interval.
- The world has 480 homes with seed 2061 (the plan says "about 450"). The login note reads the real number from the simulation.
- Telemetry noise for the UI comes from its own seeded RNG, so opening a home's twin never changes the world.
- Mock reads clone their results (`structuredClone`) so the UI can never mutate simulation state by accident.

## Interface
- Detection also requires a minimum span of samples: 20 s for the decay fit, 2 minutes for straight-line fits. Right after a clock jump, a handful of noisy samples could otherwise produce a fake countdown.
- A pressure drop with no hissing hole in a zone that has smoke or fire is grouped into the FIRE incident (the fire is burning the oxygen), not a separate PRESSURE_LOSS.
- Map callouts at settlement zoom are only for critical and emergency homes; warnings show on the tile (a dust storm can put a hundred homes on warning).
- The critical banner is docked under the top strip rather than floating over the map, and is hidden on the affected home's own twin (which has the same controls).
- The pitch view (`/demo`) is the operator console with the family's phone docked beside it, in the same app and the same simulation. An iframe would have run a second, different world.
- The pitch view collapses the incident column so the map, twin and phone fit a 1280 × 720 projector.
- The Demo Director is a non-modal side panel without an overlay, so the console stays visible and live while beats run.
- The "Starts automatically in" countdown is recomputed by the engine when the demo changes speed (the auto-run deadline is in real seconds; `autoRunAt` is a sim instant).
- Reloading the page restarts the simulation (the world lives in the browser). The session survives in sessionStorage; incident links from before the reload say so plainly.
- Technician status changes and admin onboarding are client-side only: the contract has no endpoints for them yet. Both say what will happen once the backend exists.
- Prices are shown in "credits" (a Mars currency is fiction either way, and a dollar sign would read as Earth).
- The resident emergency header uses darker versions of the critical and emergency colors (#C2361D, #B0103D) so white text meets contrast on a light phone screen.
- Map tiles and twin people are focusable; arrow keys move between hex tiles in a dome, Enter opens the home.
