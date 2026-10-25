import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/fonts";
import "./styles/index.css";
import { adaptersReady } from "./api";

const root = createRoot(document.getElementById("root")!);

// The data source (mock simulation or backend) is chosen before the first render.
adaptersReady
  .then(async () => {
    const { App } = await import("./app/App");
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((e: unknown) => {
    root.render(
      <div style={{ padding: 32, fontFamily: "system-ui", color: "#DCEFF5" }}>
        <h1>Life could not start</h1>
        <p>{String(e)}</p>
        <p>
          Reload with <a href="?source=mock" style={{ color: "#DCEFF5" }}>?source=mock</a> to run on the simulation.
        </p>
      </div>,
    );
  });
