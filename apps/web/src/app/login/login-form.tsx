"use client";

import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { changeFirm, chooseFirm, signIn, type LoginState } from "./actions";

export function FirmCodeForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(chooseFirm, {});
  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block">
        <span className="label">Firm code</span>
        <input
          name="firm"
          required
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          placeholder="e.g. nirmal"
          className="input-glass mt-2 lowercase"
        />
      </label>
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button disabled={pending} className="btn btn-primary w-full py-3">
        {pending ? "Checking…" : "Continue →"}
      </button>
    </form>
  );
}

/** Sends a reset email that lands on /auth/set-password. The answer never says whether the email exists. */
function ForgotPassword({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("sending");
        await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/set-password` });
        setState("sent");
      }}
    >
      <label className="block">
        <span className="label">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" className="input-glass mt-2" />
      </label>
      {state === "sent" ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">If this email has an account, a link to set a new password is on its way.</p>
      ) : (
        <button disabled={state === "sending"} className="btn btn-primary w-full py-3">
          {state === "sending" ? "Sending…" : "Email me a reset link"}
        </button>
      )}
      <button type="button" onClick={onBack} className="muted w-full text-sm hover:underline">
        ← Back to sign in
      </button>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  const [forgot, setForgot] = useState(false);
  if (forgot) return <ForgotPassword onBack={() => setForgot(false)} />;
  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="username" className="input-glass mt-2" />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className="input-glass mt-2" />
      </label>
      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button disabled={pending} className="btn btn-primary w-full py-3">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <button type="button" onClick={() => setForgot(true)} className="muted w-full text-sm hover:underline">
        Forgot password?
      </button>
      <button type="button" onClick={() => void changeFirm()} className="muted w-full text-xs hover:underline">
        Not your firm? Change firm code
      </button>
    </form>
  );
}
