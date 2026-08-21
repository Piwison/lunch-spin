import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

/**
 * The one confirmation for anything that destroys data permanently — deleting a
 * wheel, deleting an account.
 *
 * Two reasons it exists rather than another `window.confirm()`:
 *
 * 1. It says what is lost. A native confirm can only ask "Delete X?", which
 *    reads like something the trash can undo. Nothing here is recoverable, so
 *    the dialog states that in its own line rather than burying it in a title.
 * 2. `confirm()` blocks the main thread from inside whatever handler called it —
 *    in the wheel kebab that meant a Radix menu item synchronously unmounting
 *    its own row mid-commit. This renders at the owner's root and only reports a
 *    decision, so nothing tears down under the click that started it.
 *
 * `confirmWord` escalates to type-to-confirm for the truly unrecoverable case
 * (the whole account). Omit it and a single deliberate click is enough.
 */
export default function ConfirmDangerDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmWord,
  confirmLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  /** When set, the confirm button stays disabled until this is typed exactly. */
  confirmWord?: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  // Never carry a previous "DELETE" into the next open — that would turn the
  // second deletion into a single click.
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const armed = !confirmWord || typed.trim() === confirmWord;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="glass-sheet max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="type-section flex items-center gap-2" style={{ color: "var(--ink-warm)" }}>
            <AlertTriangle size={18} style={{ color: "var(--destructive)" }} className="flex-shrink-0" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-muted-foreground space-y-2 text-left">{body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {confirmWord && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              Type <strong className="text-foreground font-mono">{confirmWord}</strong> to confirm
            </span>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Type ${confirmWord} to confirm`}
              className="bg-secondary/50 border-border/50 font-mono"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!armed || pending}
            onClick={(e) => {
              // Radix closes the dialog on action by default; keep it open while
              // the request is in flight so a failure can still be shown here.
              e.preventDefault();
              onConfirm();
            }}
            style={{ background: "var(--destructive)", color: "var(--destructive-foreground)", minHeight: 56, borderRadius: "var(--radius-control)", fontSize: 16, fontWeight: 500 }}
          >
            {pending ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
