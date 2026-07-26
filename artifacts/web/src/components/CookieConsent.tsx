import { useState, useEffect } from "react";

interface CookiePreferences {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

const STORAGE_KEY = "tn_cookie_consent";

export function getCookieConsent(): CookiePreferences | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export interface CookieStrings {
  cookie_title: string;
  cookie_body: string;
  cookie_accept: string;
  cookie_decline: string;
  cookie_settings: string;
  cookie_necessary: string;
  cookie_analytics: string;
  cookie_marketing: string;
  cookie_save: string;
}

interface CookieConsentProps {
  isRtl?: boolean;
  strings: CookieStrings;
  onAccept?: (prefs: CookiePreferences) => void;
}

export function CookieConsent({ isRtl = false, strings, onAccept }: CookieConsentProps) {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = getCookieConsent();
    if (!stored) setVisible(true);
  }, []);

  if (!visible) return null;

  function save(prefs: CookiePreferences) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    setVisible(false);
    onAccept?.(prefs);
  }

  function acceptAll() {
    save({ necessary: true, analytics: true, marketing: true });
  }

  function acceptNecessary() {
    save({ necessary: true, analytics: false, marketing: false });
  }

  function saveCustom() {
    save({ necessary: true, analytics, marketing });
  }

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: "#1a1a2e",
        color: "#e8e8f0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 24px" }}>
        <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 16 }}>
          {strings.cookie_title}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.6, color: "#c0c0d0" }}>
          {strings.cookie_body}
        </p>

        {showDetails && (
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked disabled readOnly />
              <span>{strings.cookie_necessary}</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={analytics}
                onChange={e => setAnalytics(e.target.checked)}
              />
              <span>{strings.cookie_analytics}</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={marketing}
                onChange={e => setMarketing(e.target.checked)}
              />
              <span>{strings.cookie_marketing}</span>
            </label>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            onClick={acceptAll}
            style={{
              background: "#6c63ff",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "9px 20px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {strings.cookie_accept}
          </button>
          <button
            onClick={acceptNecessary}
            style={{
              background: "rgba(255,255,255,0.08)",
              color: "#e8e8f0",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8,
              padding: "9px 20px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {strings.cookie_decline}
          </button>
          {!showDetails ? (
            <button
              onClick={() => setShowDetails(true)}
              style={{
                background: "transparent",
                color: "#a0a0c0",
                border: "none",
                padding: "9px 12px",
                fontSize: 14,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {strings.cookie_settings}
            </button>
          ) : (
            <button
              onClick={saveCustom}
              style={{
                background: "rgba(108,99,255,0.2)",
                color: "#a89eff",
                border: "1px solid rgba(108,99,255,0.4)",
                borderRadius: 8,
                padding: "9px 20px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {strings.cookie_save}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
