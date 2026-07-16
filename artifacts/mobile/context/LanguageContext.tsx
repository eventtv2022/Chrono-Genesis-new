import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type LangCode, UI, type UIStrings } from "@/lib/i18n";

const STORAGE_KEY = "@timenation/lang";

function detectDeviceLang(): LangCode {
  try {
    const lang = (navigator.language ?? "").toLowerCase();
    return lang.startsWith("ru") ? "ru" : "en";
  } catch {
    return "en";
  }
}

interface LanguageContextType {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  t: UIStrings;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: UI["en"],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in UI) {
        setLangState(stored as LangCode);
      } else {
        setLangState(detectDeviceLang());
      }
    });
  }, []);

  function setLang(code: LangCode) {
    setLangState(code);
    void AsyncStorage.setItem(STORAGE_KEY, code);
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
