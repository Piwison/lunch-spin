import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

/**
 * Light/dark toggle. Uses theme tokens so it sits correctly in either mode and
 * on glass chrome. Defaults to a compact icon button; pass `large` for the
 * roomier mobile/header placement.
 */
export default function ThemeToggle({ large = false }: { large?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
        large ? "h-11 w-11" : "h-9 w-9"
      }`}
    >
      {isDark ? <Sun size={large ? 18 : 16} /> : <Moon size={large ? 18 : 16} />}
    </button>
  );
}
