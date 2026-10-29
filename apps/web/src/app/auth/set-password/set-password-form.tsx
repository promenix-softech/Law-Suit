"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const MIN = 10;
type Phase = "checking" | "ready" | "invalid" | "saving" | "done";

/**
 * Landing page of invitation and password-reset emails. The link signs the person in (token in the
 * URL hash, a PKCE code, or a token hash, depending on the email template); the tokens are removed
 * from the address bar at once, then the person chooses their own password.
 */
export function SetPasswordForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const clean = () => window.history.replaceState(null, "", url.pathname);
    (async () => {
      const linkError = hash.get("error_description") ?? url.searchParams.get("error_description");
      if (linkError) {
        clean();
        setError("This link has expired or was already used. Ask your office admin to send a new invitation.");
        return setPhase("invalid");
      }
      let ok = false;
      if (hash.get("access_token") && hash.get("refresh_token")) {
        ok = !(await supabase.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! })).error;
      } else if (url.searchParams.get("code")) {
        ok = !(await supabase.auth.exchangeCodeForSession(url.searchParams.get("code")!)).error;
      } else if (url.searchParams.get("token_hash") && url.searchParams.get("type")) {
        ok = !(await supabase.auth.verifyOtp({ token_hash: url.searchParams.get("token_hash")!, type: url.searchParams.get("type") as EmailOtpType })).error;
      }
      // No link, no password change: an existing session alone (e.g. an unlocked shared PC) is not enough.
      clean();
      if (ok) setEmail((await supabase.auth.getUser()).data.user?.email ?? null);
      if (!ok) setError("This link has expired or was already used. Ask your office admin to send a new invitation.");
      setPhase(ok ? "ready" : "invalid");
    })();
  }, []);

  async function save() {
    if (password.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setError(null);
    setPhase("saving");
    const supabase = createClient();
    const { error: e } = await supabase.auth.updateUser({ password });
    if (e) {
      setError(e.message.includes("weak") || e.message.includes("short") ? "Choose a stronger password." : "Could not save the password. Try again.");
      return setPhase("ready");
    }
    // A reset should end every other session of this account.
    await supabase.auth.signOut({ scope: "others" });
    setPhase("done");
    router.replace("/dashboard");
  }

  if (phase === "checking") return <p className="muted mt-6 text-sm">Checking your link…</p>;
  if (phase === "invalid")
    return (
      <div className="mt-6 space-y-3">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        <a href="/login" className="btn w-full">
          Go to sign in
        </a>
      </div>
    );

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {/* A link can carry someone else's session: show whose password this is. */}
      <p className="rounded-xl bg-violet-500/10 px-3 py-2 text-sm">
        Setting the password for <span className="font-semibold">{email ?? "this account"}</span>.{" "}
        <button
          type="button"
          className="underline"
          onClick={async () => {
            await createClient().auth.signOut();
            window.location.replace("/login");
          }}
        >
          Not you? Sign out
        </button>
      </p>
      <label className="block">
        <span className="label">New password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={MIN} autoComplete="new-password" className="input-glass mt-2" />
      </label>
      <label className="block">
        <span className="label">Type it again</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={MIN} autoComplete="new-password" className="input-glass mt-2" />
      </label>
      <p className="muted text-xs">At least {MIN} characters. Only you will know it.</p>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button disabled={phase === "saving" || phase === "done"} className="btn btn-primary w-full py-3">
        {phase === "saving" ? "Saving…" : phase === "done" ? "Opening your dashboard…" : "Save password and continue"}
      </button>
    </form>
  );
}
