import { createContext, useContext, useState, useEffect } from "react";
import { type LangCode, UI, type UIStrings } from "@/i18n/ui";

const STORAGE_KEY = "timenation_lang";

interface LanguageContextType {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: UIStrings;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "ru",
  setLang: () => {},
  t: UI["ru"],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as LangCode | null;
      if (stored && stored in UI) return stored;
    } catch {}
    return "ru";
  });

  function setLang(code: LangCode) {
    setLangState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch {}
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: UI[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
