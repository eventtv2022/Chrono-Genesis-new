import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const STORAGE_ENABLED = "timenation.anthem.enabled";
const STORAGE_VOLUME = "timenation.anthem.volume.v2";
const STORAGE_TRACK = "timenation.anthem.track";
const DEFAULT_VOLUME = 0.28;
const TRACKS = {
  ru: { label: "Рус. версия", src: `${import.meta.env.BASE_URL}audio/timenation-anthem.mp3` },
  en: { label: "English version", src: `${import.meta.env.BASE_URL}audio/timenation-anthem-en.mp3` },
} as const;
type TrackId = keyof typeof TRACKS;

export function AnthemPlayer({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<TrackId>(() => {
    try {
      return localStorage.getItem(STORAGE_TRACK) === "en" ? "en" : "ru";
    } catch {
      return "ru";
    }
  });
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
      localStorage.setItem(STORAGE_TRACK, track);
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
  }, [active, enabled, track]);

  const selectTrack = (nextTrack: TrackId) => {
    const audio = audioRef.current;
    if (track === nextTrack) {
      if (enabled && playing) {
        setEnabled(false);
        return;
      }
      setEnabled(true);
      if (audio) void audio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
      return;
    }
    setTrack(nextTrack);
    setEnabled(true);
    setPlaying(false);
    if (audio) {
      audio.src = TRACKS[nextTrack].src;
      audio.load();
      if (active) void audio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    }
  };

  const playIcon = (trackId: TrackId) => {
    if (trackId === track && playing) return <Pause size={15} />;
    return <Play size={15} />;
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={TRACKS[track].src}
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
            width: 248,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 10,
            border: "1px solid rgba(0,212,255,0.25)",
            borderRadius: 14,
            color: "#e8e8f4",
            background: "rgba(4,8,30,0.92)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3), 0 0 18px rgba(0,212,255,0.08)",
            backdropFilter: "blur(14px)",
            fontFamily: "'Exo 2', sans-serif",
          }}
        >
          {(Object.keys(TRACKS) as TrackId[]).map((trackId) => (
            <button
              key={trackId}
              type="button"
              onClick={() => selectTrack(trackId)}
              aria-label={`${TRACKS[trackId].label}${trackId === track && playing ? ", pause" : ", play"}`}
              aria-pressed={trackId === track}
              style={{
                minHeight: 36,
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "5px 8px",
                border: `1px solid ${trackId === track ? "rgba(201,168,76,0.48)" : "rgba(120,140,180,0.18)"}`,
                borderRadius: 9,
                color: trackId === track ? "#f5cc6a" : "#c0c7d9",
                background: trackId === track ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.025)",
                cursor: "pointer",
                textAlign: "left",
                font: "inherit",
                fontSize: 12,
                fontWeight: trackId === track ? 700 : 500,
              }}
            >
              {playIcon(trackId)}
              <span>{TRACKS[trackId].label}</span>
              {trackId === track && (
                <span style={{ marginLeft: "auto", color: "#9ba3ba", fontSize: 10 }}>
                  {autoplayBlocked ? "Нажмите для запуска" : playing ? "Играет" : "Пауза"}
                </span>
              )}
            </button>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 4px 0" }}>
            {volume === 0 ? <VolumeX size={15} color="#9ba3ba" /> : <Volume2 size={15} color="#9ba3ba" />}
            <input
              type="range"
              aria-label="Громкость гимна"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => setVolume(Number(event.currentTarget.value))}
              style={{ flex: 1, accentColor: "#c9a84c", cursor: "pointer" }}
            />
          </div>
        </div>
      )}
    </>
  );
}
