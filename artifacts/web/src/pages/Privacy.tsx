import { useState, useEffect, useRef } from "react";
import type { LangCode } from "@/i18n/ui";
import { privacyStrings, LANG_NAMES, RTL_LANGS } from "@/i18n/privacyStrings";
import { privacyContentRu, privacyContentEn } from "@/i18n/privacyContent";
import { CookieConsent } from "@/components/CookieConsent";

const SECTION_KEYS: Array<keyof typeof privacyStrings["en"]> = [
  "sec_general", "sec_controller", "sec_data_collected", "sec_purposes",
  "sec_legal_basis", "sec_retention", "sec_sharing", "sec_rights",
  "sec_security", "sec_cookies", "sec_contact",
];
const SECTION_IDS = [
  "general", "controller", "data", "purposes", "legal",
  "retention", "sharing", "rights", "security", "cookies", "contact",
];

function detectLang(): LangCode {
  const nav = navigator.language?.split("-")[0] as LangCode;
  return nav in privacyStrings ? nav : "en";
}

export function Privacy() {
  const [lang, setLang] = useState<LangCode>(detectLang);
  const [dark, setDark] = useState(true);
  const [activeId, setActiveId] = useState<string>("general");
  const topRef = useRef<HTMLDivElement>(null);

  const s = privacyStrings[lang];
  const content = lang === "ru" ? privacyContentRu : privacyContentEn;
  const isRtl = RTL_LANGS.includes(lang);

  // Intersection observer to highlight active TOC section
  useEffect(() => {
    const sections = SECTION_IDS.map(id => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    sections.forEach(el => observer.observe(el!));
    return () => observer.disconnect();
  }, []);

  const bg = dark ? "#0f0f1a" : "#f4f4f8";
  const fg = dark ? "#e8e8f4" : "#1a1a2e";
  const cardBg = dark ? "#1a1a2e" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const muted = dark ? "#8080a0" : "#606080";
  const accent = "#6c63ff";

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      style={{ minHeight: "100vh", background: bg, color: fg, fontFamily: "'Inter', system-ui, sans-serif", transition: "background 0.3s, color 0.3s" }}
    >
      <div ref={topRef} />

      {/* Header */}
      <header style={{
        borderBottom: `1px solid ${border}`,
        background: dark ? "rgba(15,15,26,0.95)" : "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href="/" style={{ color: accent, fontWeight: 800, fontSize: 18, textDecoration: "none", letterSpacing: "-0.5px" }}>
              TimeNation
            </a>
            <span style={{ color: muted, fontSize: 14 }}>/ {s.page_title}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Language selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: muted }}>{s.lang_select}:</span>
              <select
                value={lang}
                onChange={e => setLang(e.target.value as LangCode)}
                style={{
                  background: dark ? "rgba(255,255,255,0.08)" : "#f0f0f8",
                  color: fg,
                  border: `1px solid ${border}`,
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {(Object.keys(LANG_NAMES) as LangCode[]).map(code => (
                  <option key={code} value={code}>{LANG_NAMES[code]}</option>
                ))}
              </select>
            </div>
            {/* Dark mode toggle */}
            <button
              onClick={() => setDark(d => !d)}
              title={s.theme_toggle}
              style={{
                background: dark ? "rgba(255,255,255,0.08)" : "#e8e8f4",
                border: "none",
                borderRadius: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 16,
                color: fg,
              }}
            >
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div style={{
        background: dark
          ? "linear-gradient(135deg, #0f0f1a 0%, #1a1040 50%, #0f1a2e 100%)"
          : "linear-gradient(135deg, #f0f0ff 0%, #e8e0ff 50%, #f0f8ff 100%)",
        padding: "60px 24px 40px",
        textAlign: "center",
        borderBottom: `1px solid ${border}`,
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(24px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-1px" }}>
          {s.page_title}
        </h1>
        <p style={{ margin: "0 0 8px", color: muted, fontSize: 16 }}>{s.page_subtitle}</p>
        <p style={{ margin: 0, color: muted, fontSize: 13 }}>{s.last_updated}</p>
      </div>

      {/* Main layout */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 120px", display: "flex", gap: 40, alignItems: "flex-start" }}>

        {/* Sidebar TOC */}
        <aside style={{
          width: 220,
          flexShrink: 0,
          position: "sticky",
          top: 80,
          display: "none",
        }}
          className="privacy-toc"
        >
          <div style={{
            background: cardBg,
            border: `1px solid ${border}`,
            borderRadius: 12,
            padding: "16px 0",
          }}>
            <div style={{ padding: "0 16px 12px", fontWeight: 700, fontSize: 12, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {s.toc_title}
            </div>
            {SECTION_KEYS.map((key, i) => (
              <a
                key={SECTION_IDS[i]}
                href={`#${SECTION_IDS[i]}`}
                style={{
                  display: "block",
                  padding: "7px 16px",
                  fontSize: 13,
                  color: activeId === SECTION_IDS[i] ? accent : muted,
                  textDecoration: "none",
                  fontWeight: activeId === SECTION_IDS[i] ? 600 : 400,
                  borderLeft: isRtl ? "none" : `3px solid ${activeId === SECTION_IDS[i] ? accent : "transparent"}`,
                  borderRight: isRtl ? `3px solid ${activeId === SECTION_IDS[i] ? accent : "transparent"}` : "none",
                  transition: "color 0.2s",
                }}
              >
                {s[key]}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0 }}>

          {/* Policy body */}
          {content.map((section, i) => (
            <section
              key={section.id}
              id={SECTION_IDS[i]}
              style={{
                marginBottom: 36,
                background: cardBg,
                border: `1px solid ${border}`,
                borderRadius: 14,
                padding: "28px 32px",
                scrollMarginTop: 80,
              }}
            >
              <h2 style={{ margin: "0 0 16px", fontSize: 20, fontWeight: 700, color: fg, borderBottom: `1px solid ${border}`, paddingBottom: 12 }}>
                {section.title}
              </h2>
              {section.paragraphs.map((para, j) => (
                <p key={j} style={{ margin: j === 0 ? 0 : "10px 0 0", lineHeight: 1.75, fontSize: 15, color: j === 0 ? fg : dark ? "#c0c0d8" : "#444466" }}>
                  {para}
                </p>
              ))}
            </section>
          ))}

          {/* Account Deletion Card */}
          <section
            id="deletion"
            style={{
              background: dark ? "rgba(220, 80, 80, 0.07)" : "rgba(220, 80, 80, 0.04)",
              border: `1px solid ${dark ? "rgba(220,80,80,0.25)" : "rgba(220,80,80,0.15)"}`,
              borderRadius: 14,
              padding: "28px 32px",
              marginBottom: 36,
              scrollMarginTop: 80,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 700, color: dark ? "#ff8080" : "#cc2020" }}>
              🗑️ {s.delete_title}
            </h2>
            <p style={{ margin: "0 0 14px", lineHeight: 1.75, fontSize: 15 }}>{s.delete_body}</p>
            <p style={{ margin: "0 0 8px", fontSize: 14, color: muted }}>{s.delete_note}</p>
            <div style={{ margin: "16px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: muted }}>{s.delete_email_label}</span>
              <a
                href={`mailto:${s.delete_email_value}?subject=Account%20deletion%20request`}
                style={{ color: accent, fontWeight: 600, fontSize: 14 }}
              >
                {s.delete_email_value}
              </a>
            </div>
            <a
              href={`mailto:${s.delete_email_value}?subject=Account%20deletion%20request`}
              style={{
                display: "inline-block",
                marginTop: 8,
                background: dark ? "rgba(220,80,80,0.2)" : "rgba(220,80,80,0.1)",
                color: dark ? "#ff8080" : "#cc2020",
                border: `1px solid ${dark ? "rgba(220,80,80,0.4)" : "rgba(220,80,80,0.3)"}`,
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              {s.delete_btn}
            </a>
            <p style={{ margin: "14px 0 0", fontSize: 13, color: muted, fontStyle: "italic" }}>
              {s.delete_mobile_note}
            </p>
          </section>

          {/* Back to top */}
          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => topRef.current?.scrollIntoView({ behavior: "smooth" })}
              style={{
                background: "transparent",
                color: accent,
                border: `1px solid ${accent}`,
                borderRadius: 8,
                padding: "10px 24px",
                fontSize: 14,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ↑ {s.back_to_top}
            </button>
          </div>
        </main>
      </div>

      {/* Cookie consent banner */}
      <CookieConsent
        lang={lang}
        strings={s}
        onAccept={() => {}}
      />

      {/* Responsive TOC */}
      <style>{`
        @media (min-width: 768px) {
          .privacy-toc { display: block !important; }
        }
      `}</style>
    </div>
  );
}
