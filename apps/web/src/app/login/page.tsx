import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Civil Suits" };

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-500">Civil Suits · demo uses synthetic data only</p>
      <LoginForm />
    </main>
  );
}
