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

  const joinWheel = trpc.wheels.join.useMutation({
    onSuccess: (data) => {
      setJoined(true);
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
        <div
          className="w-16 h-16 rounded-full"
          style={{ background: "conic-gradient(from 0deg, var(--brand), var(--brand-2), var(--brand))" }}
        />
        <div>
          <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
            YOU'VE BEEN INVITED
          </h1>
          <p className="text-muted-foreground">Sign in to join this lunch wheel</p>
        </div>
        <a
          href={getLoginUrl()}
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
