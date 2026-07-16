import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";

/** Full-height centered shell. Uses grid (not flex) so the global
 *  `.flex { min-height: 0 }` reset in index.css can't collapse min-h-dvh and
 *  strand the content at the top — the bug that made this screen render up top
 *  instead of centered. min-h-dvh (not vh) tracks the mobile browser chrome. */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid place-items-center px-6 text-center" style={{ background: "var(--background)" }}>
      <div className="flex flex-col items-center gap-5 max-w-sm w-full">{children}</div>
    </div>
  );
}

export default function JoinWheel() {
  const { user, loading } = useAuth();
  const params = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const joinWheel = trpc.wheels.join.useMutation({
    onSuccess: (data) => {
      setJoined(true);
      // The invitee's own wheels.list may already be cached (e.g. they had the
      // app open before receiving the invite) — without this, the sidebar would
      // render its stale pre-join snapshot right after the redirect.
      utils.wheels.list.invalidate();
      utils.wheels.get.invalidate({ id: data.wheelId });
      // Redirect straight to the joined wheel. Guard the id so a malformed
      // response can't send us to "/app/undefined" (which lands on no wheel and
      // then auto-opens the user's default — exactly the "joined but I see my
      // own wheel" report). Log it so the redirect target is verifiable.
      const wheelId = typeof data.wheelId === "number" && Number.isFinite(data.wheelId) ? data.wheelId : null;
      console.log("[join] success", { wheelId: data.wheelId, wheelName: data.wheelName });
      setTimeout(() => navigate(wheelId ? `/app/${wheelId}` : "/app", { replace: true }), 1200);
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    if (!loading && user && params.token && !joined) {
      joinWheel.mutate({ token: params.token });
    }
  }, [user, loading, params.token]);

  if (loading || (user && joinWheel.isPending)) {
    return (
      <Centered>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--brand)" }} />
        <p className="text-muted-foreground">Joining wheel…</p>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div
          className="w-20 h-20 orb-wheel animate-orb-spin"
          style={{ boxShadow: "0 0 40px oklch(from var(--brand) l c h / 0.4)" }}
        />
        <div>
          <h1 className="text-2xl font-black mb-2" style={{ fontFamily: "var(--font-display)" }}>
            YOU'VE BEEN INVITED
          </h1>
          <p className="text-muted-foreground">Sign in to join this lunch wheel.</p>
        </div>
        <a
          href={getLoginUrl(`/join/${params.token}`)}
          className="w-full max-w-xs px-8 py-3 rounded-full font-bold text-sm transition-all active:scale-95 hover:-translate-y-0.5"
          style={{
            background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
            color: "white",
            fontFamily: "var(--font-display)",
            letterSpacing: "0.05em",
            boxShadow: "0 0 30px oklch(from var(--brand) l c h / 0.35)",
          }}
        >
          SIGN IN TO JOIN
        </a>
      </Centered>
    );
  }

  if (joined) {
    return (
      <Centered>
        <div className="text-6xl animate-float">🎉</div>
        <div>
          <h1 className="text-3xl font-black mb-1" style={{ fontFamily: "var(--font-display)", color: "var(--brand)" }}>
            JOINED!
          </h1>
          <p className="text-muted-foreground">
            {joinWheel.data?.wheelName
              ? <>You’re in <strong className="text-foreground">{joinWheel.data.wheelName}</strong> — taking you there…</>
              : "Taking you to the wheel…"}
          </p>
        </div>
        <Loader2 className="animate-spin" size={20} style={{ color: "var(--brand)" }} />
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <div className="text-6xl">😕</div>
        <div>
          <h1 className="text-2xl font-black mb-2" style={{ fontFamily: "var(--font-display)" }}>INVALID INVITE</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
        <button
          onClick={() => navigate("/app")}
          className="px-6 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
          style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          Go to App
        </button>
      </Centered>
    );
  }

  return null;
}
