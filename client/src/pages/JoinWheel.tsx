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
    <div className="min-h-dvh grid place-items-center px-6 text-center" style={{ background: "var(--ground)" }}>
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
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--brand-text)" }} />
        <p className="text-muted-foreground">Joining wheel…</p>
      </Centered>
    );
  }

  if (!user) {
    return (
      <Centered>
        <div
          className="w-20 h-20 orb-wheel animate-orb-spin" />
        <div>
          <h1 className="type-title mb-2" style={{ color: "var(--ink-warm)" }}>
            You&apos;ve been invited
          </h1>
          <p className="text-muted-foreground">Sign in to join this lunch wheel.</p>
        </div>
        <a
          href={getLoginUrl(`/join/${params.token}`)}
          className="w-full max-w-xs inline-flex items-center justify-center px-8 transition-colors active:scale-[var(--press-scale)]"
          style={{
            minHeight: 56,
            borderRadius: "var(--radius-control)",
            background: "var(--brand-solid)",
            color: "var(--on-accent)",
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.05em",
          }}
        >
          Sign in to join
        </a>
      </Centered>
    );
  }

  if (joined) {
    return (
      <Centered>
        <div className="text-6xl">🎉</div>
        <div>
          <h1 className="type-title mb-1.5" style={{ color: "var(--brand-text)" }}>
            Joined!
          </h1>
          <p className="text-muted-foreground">
            {joinWheel.data?.wheelName
              ? <>You’re in <strong className="text-foreground">{joinWheel.data.wheelName}</strong> — taking you there…</>
              : "Taking you to the wheel…"}
          </p>
        </div>
        <Loader2 className="animate-spin" size={20} style={{ color: "var(--brand-text)" }} />
      </Centered>
    );
  }

  if (error) {
    return (
      <Centered>
        <div className="text-6xl">😕</div>
        <div>
          <h1 className="type-title mb-2" style={{ color: "var(--ink-warm)" }}>Invalid invite</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
        <button
          onClick={() => navigate("/app")}
          className="px-6 transition-colors active:scale-[var(--press-scale)]"
          style={{
            minHeight: 56,
            borderRadius: "var(--radius-control)",
            background: "var(--paper)",
            border: "1px solid var(--border)",
            color: "var(--ink-warm)",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          Go to the app
        </button>
      </Centered>
    );
  }

  return null;
}
