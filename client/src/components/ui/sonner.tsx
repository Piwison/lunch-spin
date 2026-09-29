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
const Toaster = ({ toastOptions, ...props }: ToasterProps) => {
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
      toastOptions={{
        ...toastOptions,
        // Sonner's action button is 24px tall; a toast action is a real control
        // (a teammate's "See result"), so it gets the app's 44px target.
        actionButtonStyle: {
          minHeight: "var(--control-md)",
          padding: "0 14px",
          borderRadius: "var(--radius-control)",
          fontSize: "var(--control-label-md)",
          ...toastOptions?.actionButtonStyle,
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
