import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";

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
      // app open in this browser before receiving the invite) — without this,
      // WheelSelector's sidebar would render that stale, pre-join snapshot
      // right after the redirect below and the joined wheel would seem to have
      // "not worked" even though membership was recorded successfully.
      utils.wheels.list.invalidate();
      utils.wheels.get.invalidate({ id: data.wheelId });
      setTimeout(() => navigate(`/app/${data.wheelId}`), 1500);
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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-primary" size={32} />
        <p className="text-muted-foreground">Joining wheel...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-16 h-16 orb-wheel" />
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            YOU'VE BEEN INVITED
          </h1>
          <p className="text-muted-foreground">Sign in to join this lunch wheel</p>
        </div>
        <a
          href={getLoginUrl(`/join/${params.token}`)}
          className="px-8 py-3 rounded-full font-semibold text-sm"
          style={{
            background: "linear-gradient(135deg, var(--brand), var(--brand-2))",
            color: "white",
            fontFamily: "var(--font-display)",
            letterSpacing: "0.05em",
          }}
        >
          SIGN IN TO JOIN
        </a>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>JOINED!</h1>
        <p className="text-muted-foreground">Redirecting to your wheel...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
        <div className="text-5xl">😕</div>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>INVALID INVITE</h1>
        <p className="text-muted-foreground">{error}</p>
        <button
          onClick={() => navigate("/app")}
          className="px-6 py-2 rounded-full text-sm font-semibold"
          style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          Go to App
        </button>
      </div>
    );
  }

  return null;
}
