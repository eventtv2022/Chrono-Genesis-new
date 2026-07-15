import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type LangCode, UI, type UIStrings } from "@/lib/i18n";

const STORAGE_KEY = "@timenation/lang";

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
  const [lang, setLangState] = useState<LangCode>("ru");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in UI) setLangState(stored as LangCode);
    });
  }, []);

  function setLang(code: LangCode) {
    setLangState(code);
    AsyncStorage.setItem(STORAGE_KEY, code);
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
