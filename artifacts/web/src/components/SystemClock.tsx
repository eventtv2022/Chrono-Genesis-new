import { useEffect, useState } from "react";

export function SystemClock() {
  const [localTime, setLocalTime] = useState("--:--:--");
  const [utcTime, setUtcTime] = useState("--:--:--");
  const [synced, setSynced] = useState(false);
  const [offset, setOffset] = useState(0); // server clock offset in ms

  useEffect(() => {
    const sync = async () => {
      try {
        const before = Date.now();
        const res = await fetch("/api/system/time");
        const after = Date.now();
        if (res.ok) {
          const data = (await res.json()) as { ts: number };
          const rtt = (after - before) / 2;
          setOffset(data.ts - after + rtt);
          setSynced(true);
        }
      } catch {
        setSynced(false);
      }
    };

    void sync();
    const syncTimer = setInterval(sync, 60_000);

    const tick = setInterval(() => {
      const nowLocal = new Date();
      const nowServer = new Date(Date.now() + offset);
      setLocalTime(nowLocal.toLocaleTimeString("ru-RU", { hour12: false }));
      setUtcTime(nowServer.toISOString().slice(11, 19));
    }, 1000);

    return () => {
      clearInterval(tick);
      clearInterval(syncTimer);
    };
  }, [offset]);

  return (
    <div className="px-4 pb-4 pt-2 border-t border-border mt-2 space-y-2">
      {/* Local time — primary */}
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-0.5">
          Local Time
        </div>
        <div className="text-xl font-mono font-bold text-foreground tabular-nums tracking-tight">
          {localTime}
        </div>
      </div>

      {/* UTC time — secondary */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono mb-0.5">
            UTC Time
          </div>
          <div className="text-sm font-mono text-muted-foreground tabular-nums">
            {utcTime}
          </div>
        </div>

        {/* Sync indicator */}
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{
              backgroundColor: synced ? "#22c55e" : "#f59e0b",
              boxShadow: synced ? "0 0 6px #22c55e88" : "0 0 6px #f59e0b88",
            }}
          />
          <span className="text-[9px] font-mono text-muted-foreground uppercase">
            {synced ? "SYNC" : "..."}
          </span>
        </div>
      </div>
    </div>
  );
}
