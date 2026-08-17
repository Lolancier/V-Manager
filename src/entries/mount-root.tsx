import React, { type ReactNode } from "react";
import ReactDOM from "react-dom/client";

export function mountWindowRoot(node: ReactNode) {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      {node}
    </React.StrictMode>
  );
}
