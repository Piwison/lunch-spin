/**
 * Language for the public site. Traditional Chinese first, English kept.
 *
 * Same shape as ThemeContext (stored choice wins, else follow the browser), with
 * one addition: `<html lang>` is rewritten on change. index.html ships
 * `lang="zh-Hant-TW"` because the static shell is what crawlers read and Taiwan is
 * the primary audience — so an English visitor who switches has to correct it, or
 * the page claims to be Chinese to every screen reader and translation prompt.
 *
 * Deliberately not i18next: the public surface is one page of strings, and the
 * landing page is the entry route this project has spent three measured rounds
 * keeping cheap (AGENTS.md failure modes 12, 48, 49). A dictionary lookup adds
 * nothing to that path; a framework would.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEMO_PLACES, en, zhTW, type MessageKey } from "./dict";

export type Lang = "zh-TW" | "en";

const STORAGE_KEY = "lang";
const DICTS: Record<Lang, Record<MessageKey, string>> = { "zh-TW": zhTW, en };

/** `<html lang>` value per language — a BCP-47 tag, not our internal key. */
const HTML_LANG: Record<Lang, string> = { "zh-TW": "zh-Hant-TW", en: "en" };

/**
 * localStorage throws in a private window and on a blocked-cookies origin, and
 * the landing page is exactly where an unknown visitor arrives — so a read that
 * can throw must never be the thing that blanks the page.
 */
function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "zh-TW" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

function writeStored(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* private window — the choice just doesn't persist */
  }
}

/** Stored choice wins; otherwise any Chinese browser locale gets Chinese. */
export function detectLang(): Lang {
  const stored = readStored();
  if (stored) return stored;
  if (typeof navigator === "undefined") return "zh-TW";
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return tags.some((t) => t?.toLowerCase().startsWith("zh")) ? "zh-TW" : "en";
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Look up a string, substituting `{name}` placeholders from `vars`. */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** Demo-wheel seed places for the active language. */
  demoPlaces: readonly string[];
}

const LangContext = createContext<LangContextValue | undefined>(undefined);

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const value = useMemo<LangContextValue>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      setLang: (next) => {
        writeStored(next);
        setLang(next);
      },
      toggleLang: () => {
        const next: Lang = lang === "zh-TW" ? "en" : "zh-TW";
        writeStored(next);
        setLang(next);
      },
      t: (key, vars) => {
        const raw = dict[key];
        if (!vars) return raw;
        return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
          name in vars ? String(vars[name]) : match,
        );
      },
      demoPlaces: DEMO_PLACES[lang],
    };
  }, [lang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const context = useContext(LangContext);
  if (!context) throw new Error("useLang must be used within LangProvider");
  return context;
}
