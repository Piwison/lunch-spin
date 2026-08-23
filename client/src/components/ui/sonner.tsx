import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Sonner, wired to the app's own theme.
 *
 * The shadcn original reads `useTheme` from `next-themes`. This app has no
 * next-themes provider — it has `contexts/ThemeContext` — so that hook always
 * fell back to "system", and `ThemedToaster` in App.tsx was overriding the
 * result with the real theme anyway. The package was shipping in the entry
 * bundle to compute a value that was then thrown away.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
