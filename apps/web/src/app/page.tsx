import { CourtFeeCalculator } from "./court-fee-calculator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-3xl font-semibold">Civil Suits</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Bank-recovery suit automation — Phase 0 setup. Demo uses synthetic data only.
      </p>

      <section className="mt-10 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-xl font-medium">Court fee &amp; suit-type check</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Maharashtra Court-fees Act, Sch. I Art. 1 · Commercial Courts Act threshold ₹3 lakh
        </p>
        <CourtFeeCalculator />
      </section>
    </main>
  );
}
