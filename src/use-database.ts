import { useEffect, useRef, useState } from "react";
import { loadDatabase } from "./database";
export type DatabaseSession = Awaited<ReturnType<typeof loadDatabase>>;
export function useDatabase() {
  const session = useRef<DatabaseSession | null>(null);
  const epoch = useRef(0);
  const [state, setState] = useState<"loading" | "ready" | "error" | "closed">(
    "loading",
  );
  const [status, setStatus] = useState("Starting local database…");
  async function reload() {
    const current = ++epoch.current;
    if (session.current) await session.current.close();
    session.current = null;
    setState("loading");
    setStatus("Starting local database…");
    try {
      const loaded = await loadDatabase((message) => {
        if (epoch.current === current) setStatus(message);
      });
      if (epoch.current !== current) {
        await loaded.close();
        return;
      }
      session.current = loaded;
      setState("ready");
      setStatus(
        `January 2024 NYC yellow taxi data · loaded in ${(loaded.loadMs / 1000).toFixed(1)}s`,
      );
    } catch (error) {
      if (epoch.current === current) {
        setState("error");
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }
  }
  function markClosed() {
    setState("closed");
    setStatus("Database stopped. Reload the dataset to run another query.");
  }
  useEffect(() => {
    void reload();
    return () => {
      epoch.current++;
      if (session.current) void session.current.close();
    };
  }, []);
  return { session, state, status, reload, markClosed };
}
