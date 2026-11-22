import { Chip } from "@/components/ui/chip";
import { useLang } from "@/i18n";

export interface TeamWheel {
  id: number;
  name: string;
  members: { userId: number; name: string | null; email: string | null }[];
}

/** For each team wheel: the member it goes to, or "delete". Unset = undecided. */
export type Handover = Record<number, number | "delete">;

interface TeamWheelHandoverProps {
  wheels: TeamWheel[];
  choices: Handover;
  onChoose: (wheelId: number, choice: number | "delete") => void;
  disabled?: boolean;
}

/**
 * Before an account is deleted: every wheel it owns that teammates are also on
 * needs an answer — hand it to one of them, or delete it with the account.
 * Deleting used to take the whole team's wheel and three weeks of history with
 * it, without asking.
 */
export default function TeamWheelHandover({ wheels, choices, onChoose, disabled = false }: TeamWheelHandoverProps) {
  const { t } = useLang();
  if (wheels.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <p>{t("app.account.teamWheels")}</p>
      {wheels.map((w) => (
        <div key={w.id} className="flex flex-col gap-2" role="group" aria-label={w.name}>
          <p className="font-semibold" style={{ color: "var(--ink-warm)" }}>
            {w.name}
          </p>
          <div className="flex flex-wrap gap-2">
            {w.members.map((m) => {
              const who = m.name?.trim() || m.email?.split("@")[0] || t("app.teammate");
              return (
                <Chip key={m.userId} pressed={choices[w.id] === m.userId} disabled={disabled} onClick={() => onChoose(w.id, m.userId)}>
                  {t("app.account.giveTo", { name: who })}
                </Chip>
              );
            })}
            <Chip pressed={choices[w.id] === "delete"} disabled={disabled} onClick={() => onChoose(w.id, "delete")}>
              {t("app.account.deleteIt")}
            </Chip>
          </div>
        </div>
      ))}
    </div>
  );
}
