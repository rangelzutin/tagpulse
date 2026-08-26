import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

export function App() {
  return (
    <main>
      <h1>TagPulse</h1>
      <p>A aplicação está funcionando.</p>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
