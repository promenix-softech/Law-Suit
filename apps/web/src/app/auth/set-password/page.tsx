import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Set your password — Civil Suits" };

/** Invitation and password-reset emails land here. Public route: the link itself signs the person in. */
export default function SetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="glass-card fade-up w-full max-w-sm p-8">
        <p className="label">Civil Suits</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Set your password</h1>
        <p className="muted mt-1 text-sm">Choose the password you will use to sign in to your office workspace.</p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
