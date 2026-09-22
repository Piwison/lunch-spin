import { Languages } from "lucide-react";
import { useLang } from "@/i18n";

/**
 * Traditional Chinese / English switch for the public site.
 *
 * Sits beside ThemeToggle as floating chrome, so it is glass for the same reason
 * (it floats over the page rather than sitting on bare paper). The label shows
 * the language you would switch TO, which is the convention every bilingual site
 * in Taiwan uses — a button reading "中文" while the page is already Chinese is
 * the classic version of this control being wrong.
 */
export default function LangToggle() {
  const { t, toggleLang } = useLang();
  return (
    <button
      type="button"
      onClick={toggleLang}
      aria-label={t("lang.label")}
      className="glass-card inline-flex items-center gap-1.5 px-3 transition-opacity hover:opacity-80"
      style={{
        minHeight: 40,
        borderRadius: "var(--radius-control)",
        color: "var(--ink-warm)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <Languages size={15} aria-hidden="true" />
      {t("lang.switch")}
    </button>
  );
}
