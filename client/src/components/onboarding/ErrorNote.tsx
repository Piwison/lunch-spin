import { AlertTriangle } from "lucide-react";

/** An inline error or limit notice. "warn" is for a spent map quota — a limit,
 *  not a crash — so it takes the calmer brand tone. */
export default function ErrorNote({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "warn";
}) {
  const token = tone === "warn" ? "--brand" : "--destructive";
  return (
    <div
      className="flex items-start gap-2.5 px-3.5 py-2.5 type-meta w-full text-left"
      style={{
        borderRadius: "var(--radius-chip)",
        background: `oklch(from var(${token}) l c h / 0.10)`,
        border: `1px solid oklch(from var(${token}) l c h / 0.25)`,
        color: `var(${token})`,
      }}
    >
      <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}
