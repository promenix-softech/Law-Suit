import Link from "next/link";
import { CourtFeeCalculator } from "./court-fee-calculator";

const FEATURES = [
  { title: "Scan to draft", body: "Upload loan files; notices and plaints are drafted from verified case data." },
  { title: "Maker–checker", body: "Approvals enforced in the database — nobody approves their own draft." },
  { title: "Court-ready", body: "A4, Times New Roman 14, e-filing margins; court fee and 12A computed in code." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:py-20">
      <section className="fade-up text-center">
        <span className="pill pill-violet">Promenix Softech · Demo</span>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">
          Bank recovery suits, <span className="gradient-text">drafted in minutes</span>
        </h1>
        <p className="muted mx-auto mt-5 max-w-2xl text-lg">
          From loan file to e-filing bundle for Indian courts (Maharashtra rules built in, more states being added) — with
          every amount computed, every approval enforced, and
          every step on the record.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/login" className="btn btn-primary px-6 py-3 text-base">
            Sign in
          </Link>
          <a href="#calculator" className="btn px-6 py-3 text-base">
            Try the court-fee check
          </a>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <div key={f.title} className="glass-card fade-up p-6" style={{ animationDelay: `${120 + i * 90}ms` }}>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="muted mt-2 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      <section id="calculator" className="glass-card fade-up mt-10 p-6 sm:p-8" style={{ animationDelay: "420ms" }}>
        <p className="label">Court fee &amp; suit type</p>
        <h2 className="mt-1 text-2xl font-semibold">Check a claim</h2>
        <p className="muted mt-1 text-sm">Maharashtra Court-fees Act, Sch. I Art. 1 · Commercial Courts Act threshold ₹3 lakh</p>
        <CourtFeeCalculator />
      </section>

      <p className="muted mt-10 text-center text-xs">Synthetic data only · No real client information is used in this demo.</p>
    </main>
  );
}
