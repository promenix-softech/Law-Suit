"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
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
    </form>
  );
}
