import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const STORAGE_ENABLED = "timenation.anthem.enabled";
const STORAGE_VOLUME = "timenation.anthem.volume.v2";
const DEFAULT_VOLUME = 0.28;
const ANTHEM_URL = `${import.meta.env.BASE_URL}audio/timenation-anthem.mp3`;

export function AnthemPlayer({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_ENABLED) !== "false";
    } catch {
      return true;
    }
  });
  const [volume, setVolume] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_VOLUME);
      const saved = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
      return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : DEFAULT_VOLUME;
    } catch {
      return DEFAULT_VOLUME;
    }
  });
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    try {
      localStorage.setItem(STORAGE_VOLUME, String(volume));
    } catch {
      // Audio controls remain usable when browser storage is unavailable.
    }
  }, [volume]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ENABLED, String(enabled));
    } catch {
      // Audio controls remain usable when browser storage is unavailable.
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (!active || !enabled) {
      audio.pause();
      setAutoplayBlocked(false);
      return;
    }
    void audio.play().then(
      () => setAutoplayBlocked(false),
      () => setAutoplayBlocked(true),
    );
  }, [active, enabled]);

  const togglePlayback = () => {
    if (enabled && !playing) {
      const audio = audioRef.current;
      if (audio) void audio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
      return;
    }
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    if (nextEnabled) {
      const audio = audioRef.current;
      if (audio) void audio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    }
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={ANTHEM_URL}
        loop
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {active && (
        <div
          aria-label="Гимн TimeNation"
          style={{
            position: "fixed",
            zIndex: 80,
            right: 18,
            bottom: 18,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 14,
            color: "#e8e8f4",
            background: "rgba(4,8,30,0.9)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3), 0 0 18px rgba(0,212,255,0.08)",
            backdropFilter: "blur(14px)",
            fontFamily: "'Exo 2', sans-serif",
          }}
        >
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={playing ? "Отключить гимн" : "Включить гимн"}
            title={playing ? "Отключить гимн" : "Включить гимн"}
            style={{
              width: 34,
              height: 34,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              border: "1px solid rgba(201,168,76,0.4)",
              borderRadius: 9,
              color: "#f5cc6a",
              background: "rgba(201,168,76,0.1)",
              cursor: "pointer",
            }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div style={{ minWidth: 94 }}>
            <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>Гимн TimeNation</div>
            <div style={{ color: "#9ba3ba", fontSize: 10, marginTop: 2 }}>
              {autoplayBlocked ? "Нажмите ▶ для запуска" : playing ? "Воспроизведение" : "Отключён"}
            </div>
          </div>
          {volume === 0 ? <VolumeX size={15} color="#9ba3ba" /> : <Volume2 size={15} color="#9ba3ba" />}
          <input
            type="range"
            aria-label="Громкость гимна"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => setVolume(Number(event.currentTarget.value))}
            style={{ width: 76, accentColor: "#c9a84c", cursor: "pointer" }}
          />
        </div>
      )}
    </>
  );
}
