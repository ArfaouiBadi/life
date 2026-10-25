# Life

Round-the-clock life-safety monitoring for family homes on Mars. Other alarms tell you something is wrong; Life tells you how much time you have.

This is the React frontend, running on a live in-browser simulation of 452 homes in five settlements. A Spring Boot + MySQL backend can replace the simulation later through the same two interfaces (`HabitatApi`, `RealtimeClient`) without a UI rewrite.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Useful URLs:

| URL | What |
|---|---|
| `/` | Landing page |
| `/login` | Choose a demo identity (operator, supervisor, homeowner, technician, admin) |
| `/demo` | Pitch view: control room plus the family's phone, beats on the Space bar |
| `?seed=2061` | Same seed, same world |
| `?source=mock` | Force the simulation, even if configured for the backend. Sticks for the tab; `?source=http` switches back |

## The pitch in three beats

Open `/demo`, press **P** for presentation mode if projecting, then **Space** for each beat (or **Shift D** for the Demo Director):

1. **The descent**: a fresh world at 03:07 in New Jezero, one camera move from the planet to the Trabelsi home.
2. **The countdown**: a micrometeorite punctures Bedroom 2. "Unsafe air in 1:47", with the physics beside it.
3. **The save**: Youssef leaves, the hatch seals, the countdown turns to "Stable", each person's phone says what to do.

Then **Help arrives** (the rover crosses the settlement) and **Safe again**.

## Run against the backend

Start the Spring Boot backend on port 8080, then:

```bash
VITE_DATA_SOURCE=http npm run dev
```

On Windows, put `VITE_DATA_SOURCE=http` in `.env.local` instead. The dev server forwards `/api` and `/ws` to `localhost:8080`; set `VITE_API_BASE` and `VITE_WS_URL` to use another server. If the backend isn't answering, the page says so and links to `?source=mock` to run on the simulation instead. Details in [How it works](docs/HOW_IT_WORKS.md#12-switching-to-the-backend).

## Checks

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Docs

- [How it works](docs/HOW_IT_WORKS.md): architecture, simulation math, prediction model. Read this before the Q&A.
- [Decisions](docs/DECISIONS.md): every call the plan left open.
- [API contract](docs/API_CONTRACT.md): the shapes the backend must serve.
- [Credits](docs/CREDITS.md): every library and its license.

The "Simulated telemetry" badge is always visible in mock mode. No real sensors are connected.
