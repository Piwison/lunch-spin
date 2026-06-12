import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

type ChipVariant = "error" | "success" | "info" | "loading";

interface StatusChipProps {
  variant: ChipVariant;
  message: string;
  /** Auto-dismiss after ms. 0 = never. Default: 0 */
  autoDismiss?: number;
  onDismiss?: () => void;
  className?: string;
}

const CHIP_STYLES: Record<ChipVariant, { bg: string; border: string; color: string; glow: string }> = {
  error: {
    bg: "oklch(0.60 0.22 25 / 0.12)",
    border: "oklch(0.60 0.22 25 / 0.35)",
    color: "oklch(0.82 0.14 30)",
    glow: "oklch(0.60 0.22 25 / 0.15)",
  },
  success: {
    bg: "oklch(0.65 0.20 145 / 0.12)",
    border: "oklch(0.65 0.20 145 / 0.35)",
    color: "oklch(0.78 0.15 148)",
    glow: "oklch(0.65 0.20 145 / 0.15)",
  },
  info: {
    bg: "oklch(0.65 0.25 280 / 0.10)",
    border: "oklch(0.65 0.25 280 / 0.30)",
    color: "oklch(0.75 0.15 285)",
    glow: "oklch(0.65 0.25 280 / 0.12)",
  },
  loading: {
    bg: "oklch(0.72 0.22 30 / 0.08)",
    border: "oklch(0.72 0.22 30 / 0.25)",
    color: "oklch(0.80 0.12 40)",
    glow: "oklch(0.72 0.22 30 / 0.10)",
  },
};

const CHIP_ICONS: Record<ChipVariant, React.FC<{ size: number; className?: string }>> = {
  error: ({ size, className }) => <AlertCircle size={size} className={className} />,
  success: ({ size, className }) => <CheckCircle2 size={size} className={className} />,
  info: ({ size, className }) => <Info size={size} className={className} />,
  loading: ({ size, className }) => <Loader2 size={size} className={`animate-spin ${className ?? ""}`} />,
};

export function StatusChip({ variant, message, autoDismiss = 0, onDismiss, className }: StatusChipProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const styles = CHIP_STYLES[variant];
  const Icon = CHIP_ICONS[variant];

  useEffect(() => {
    // Trigger entrance animation
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (autoDismiss > 0) {
      const t = setTimeout(() => dismiss(), autoDismiss);
      return () => clearTimeout(t);
    }
  }, [autoDismiss]);

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 250);
  };

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-xs transition-all duration-250 ${className ?? ""}`}
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        color: styles.color,
        boxShadow: `0 0 12px ${styles.glow}`,
        opacity: visible && !exiting ? 1 : 0,
        transform: visible && !exiting ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.97)",
        transition: "opacity 250ms cubic-bezier(0.23, 1, 0.32, 1), transform 250ms cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    >
      <Icon size={13} className="flex-shrink-0 mt-0.5" />
      <span className="flex-1 leading-relaxed">{message}</span>
      {onDismiss && variant !== "loading" && (
        <button
          onClick={dismiss}
          className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1 mt-0.5"
          aria-label="Dismiss"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

/** Inline error chip — shows only when `error` is truthy */
export function ErrorChip({ error, onDismiss }: { error: string | null | undefined; onDismiss?: () => void }) {
  if (!error) return null;
  return <StatusChip variant="error" message={error} onDismiss={onDismiss} />;
}

/** Inline loading chip */
export function LoadingChip({ message = "Loading..." }: { message?: string }) {
  return <StatusChip variant="loading" message={message} />;
}
