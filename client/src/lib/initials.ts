/** "AC" for Amy Chen, "阿明" for 阿明 — a two-character monogram for a person,
 *  falling back to the email's local part. The roster and the vote rows share it
 *  so the same person reads as the same letters everywhere. */
export function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
