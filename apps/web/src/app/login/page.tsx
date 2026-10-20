import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Civil Suits" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass-card fade-up w-full max-w-sm p-8">
        <Link href="/" className="label hover:underline">
          ← Civil Suits
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="muted mt-1 text-sm">Sign in to your office workspace</p>
        <LoginForm />
      </div>
    </main>
  );
}
