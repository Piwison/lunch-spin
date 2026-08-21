import { Crown, Users, ChevronDown } from "lucide-react";
import { useState } from "react";

interface Member {
  userId: number;
  name: string | null;
  email: string | null;
}

interface WheelMembersProps {
  ownerId: number;
  owner?: { id: number; name: string | null; email: string | null } | null;
  members: Member[];
  currentUserId: number;
  /** User ids currently watching this wheel (live presence). */
  presentUserIds?: number[];
  /** When true, the roster collapses behind its header (collapsed by default). */
  collapsible?: boolean;
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

/**
 * Roster for a shared wheel: shows who's in and who's the creator. The owner is
 * always listed first with a crown, even if they aren't in the members table.
 *
 * Ember: the old seven-hue palette gave every teammate a saturated identity
 * colour, which fought the one rule the direction actually has — persimmon is
 * the only saturated colour in the app. The hues were decorative anyway (each
 * chip already carries the person's name in text), so the roster is now neutral
 * glass, and persimmon is spent only on the two things that mean something:
 * who is here right now, and who owns the wheel.
 */
export default function WheelMembers({ ownerId, owner, members, currentUserId, presentUserIds = [], collapsible = false }: WheelMembersProps) {
  const [open, setOpen] = useState(false);
  const present = new Set(presentUserIds);
  // Owner first, then members, de-duped by userId.
  const seen = new Set<number>();
  const roster: { userId: number; name: string | null; email: string | null; isOwner: boolean }[] = [];

  if (owner) {
    roster.push({ userId: owner.id, name: owner.name, email: owner.email, isOwner: true });
    seen.add(owner.id);
  }
  for (const m of members) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    roster.push({ userId: m.userId, name: m.name, email: m.email, isOwner: m.userId === ownerId });
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-2">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={`flex items-center justify-between gap-2 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        style={collapsible ? { minHeight: 56 } : undefined}
      >
        <span className="type-eyebrow flex items-center gap-2" style={{ color: "var(--brand-text)" }}>
          <Users size={12} /> Team
          <span style={{ color: "var(--body-warm)" }}>· {roster.length}</span>
          {present.size > 0 && <span style={{ color: "var(--ok)" }}>· {present.size} here now</span>}
        </span>
        {collapsible && (
          <ChevronDown
            size={14}
            className="text-muted-foreground transition-transform duration-200"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        )}
      </button>
      {(!collapsible || open) && (
      <div className="flex items-center gap-1.5 flex-wrap">
        {roster.map((m) => {
          const label = m.name?.trim() || m.email?.split("@")[0] || "Member";
          const isHere = present.has(m.userId);
          return (
            <div
              key={m.userId}
              className="glass-chip flex items-center gap-2 pl-1.5 pr-3 py-1.5"
              style={{
                borderColor: isHere ? "oklch(from var(--brand) l c h / 0.45)" : undefined,
                opacity: isHere || present.size === 0 ? 1 : 0.5,
              }}
              title={`${m.isOwner ? `${label} · creator` : label}${isHere ? " · here now" : ""}`}
            >
              <span
                className="relative w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0"
                style={{
                  background: isHere ? "var(--brand-solid)" : "oklch(from var(--ink-warm) l c h / 0.08)",
                  color: isHere ? "var(--on-accent)" : "var(--body-warm)",
                }}
              >
                {initials(m.name, m.email)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-warm)" }}>
                {m.userId === currentUserId ? "You" : label}
              </span>
              {m.isOwner && <Crown size={12} style={{ color: "var(--brand-text)" }} />}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
