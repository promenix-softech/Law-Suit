import Link from "next/link";
import { findFirm, requestFirm } from "@/lib/firm-server";
import { createClient } from "@/lib/supabase/server";
import { FirmCodeForm, LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Civil Suits" };

/** Firm first (its subdomain or the code typed here), then that firm's people sign in. */
export default async function LoginPage() {
  const supabase = await createClient();
  const code = (await requestFirm())?.code ?? null;
  const firm = code && supabase ? await findFirm(supabase, code) : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass-card fade-up w-full max-w-sm p-8">
        <Link href="/" className="label hover:underline">
          ← Civil Suits
        </Link>
        {firm ? (
          <>
            <div className="mt-4 flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-semibold text-white shadow-lg shadow-violet-500/30">
                {firm.name
                  .replace(/\(.*?\)/g, "")
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{firm.name}</p>
                <p className="muted text-xs">
                  {code}
                </p>
              </div>
            </div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">Welcome back</h1>
            <p className="muted mt-1 text-sm">Sign in to your firm&apos;s workspace</p>
            <LoginForm />
          </>
        ) : (
          <>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="muted mt-1 text-sm">Start with your firm code. Your office admin can tell you what it is.</p>
            {code && <p className="mt-4 text-sm text-red-600 dark:text-red-400">No firm has the code “{code}”.</p>}
            <FirmCodeForm />
          </>
        )}
      </div>
    </main>
  );
}
