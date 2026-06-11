import { Crown, Users } from "lucide-react";

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
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function colorFor(id: number): string {
  const colors = ["#f43f5e", "#fb923c", "#facc15", "#4ade80", "#22d3ee", "#818cf8", "#e879f9"];
  return colors[id % colors.length]!;
}

/**
 * Roster for a shared wheel: shows who's in and who's the creator. The owner is
 * always listed first with a crown, even if they aren't in the members table.
 */
export default function WheelMembers({ ownerId, owner, members, currentUserId, presentUserIds = [] }: WheelMembersProps) {
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
    <div className="w-full max-w-2xl flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-muted-foreground tracking-widest flex items-center gap-1.5" style={{ fontFamily: "var(--font-display)" }}>
        <Users size={12} /> TEAM
        {present.size > 0 && (
          <span className="text-[10px] font-normal" style={{ color: "oklch(0.72 0.18 150)" }}>
            · {present.size} here now
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {roster.map((m) => {
          const color = colorFor(m.userId);
          const label = m.name?.trim() || m.email?.split("@")[0] || "Member";
          const isHere = present.has(m.userId);
          return (
            <div
              key={m.userId}
              className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full"
              style={{ background: color + "1f", border: `1px solid ${color}55`, opacity: isHere || present.size === 0 ? 1 : 0.5 }}
              title={`${m.isOwner ? `${label} · creator` : label}${isHere ? " · here now" : ""}`}
            >
              <span
                className="relative w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: color + "33", color }}
              >
                {initials(m.name, m.email)}
                {isHere && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{ background: "oklch(0.72 0.18 150)", boxShadow: "0 0 0 1.5px oklch(0.12 0.025 260)" }}
                  />
                )}
              </span>
              <span className="text-xs" style={{ color }}>
                {m.userId === currentUserId ? "You" : label}
              </span>
              {m.isOwner && <Crown size={11} style={{ color }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
