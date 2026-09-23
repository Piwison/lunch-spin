/**
 * Language for the whole app. English unless the visitor has chosen otherwise.
 *
 * A visitor's choice is stored and wins on every later visit; with no choice
 * stored the answer is English — deliberately NOT the browser locale (owner's
 * call, 2026-09-23: a Chinese-language browser used to land in Chinese). Only
 * an explicit switch writes the key, so the default is never "remembered" as a
 * choice and changing the default later still reaches everyone who never chose.
 *
 * `<html lang>` is rewritten on change. index.html still ships
 * `lang="zh-Hant-TW"` and Chinese title/description, because the static shell is
 * what crawlers and link previews read — so the provider corrects it on mount,
 * or the page claims to be Chinese to every screen reader and translation
 * prompt.
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

/** The language a visitor gets before they have chosen one. */
export const DEFAULT_LANG: Lang = "en";

/** Stored choice wins; otherwise the default. */
export function detectLang(): Lang {
  return readStored() ?? DEFAULT_LANG;
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

/** The `t` every component gets from `useLang()` — for helpers that format with it. */
export type Translate = LangContextValue["t"];

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

/**
 * `t` without the provider, for the one component that has to render after the
 * tree below it — LangProvider included — has crashed: the ErrorBoundary
 * fallback. It sits OUTSIDE LangProvider, so `useLang()` there throws inside the
 * fallback itself and React unmounts everything: a blank page instead of the
 * error screen. No placeholders, no live switching; it only has to say what
 * happened in the language the visitor chose.
 */
export function translateWithoutProvider(key: MessageKey): string {
  return DICTS[detectLang()][key];
}

export function useLang(): LangContextValue {
  const context = useContext(LangContext);
  if (!context) throw new Error("useLang must be used within LangProvider");
  return context;
}
