import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-black font-mono">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="border-b border-green-500/30 pb-6">
          <h1 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            GRIFT<span className="text-green-400">FINDER</span>
          </h1>
          <p className="mt-3 text-sm uppercase tracking-widest text-green-400/70">
            It&apos;s all public record
          </p>
        </div>

        <p className="mt-8 text-lg leading-relaxed text-zinc-400">
          Search the database. Dig the receipts. The platform is here.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/analysis"
            className="inline-flex h-12 items-center justify-center rounded border border-green-500/50 bg-green-950/20 px-6 text-green-400 transition-colors hover:border-green-400 hover:bg-green-950/40"
          >
            Open analysis dashboard →
          </Link>
          <a
            href="https://x.com/GriftFinder"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded border border-zinc-600 px-6 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-300"
          >
            @GriftFinder on X
          </a>
        </div>
      </main>
    </div>
  );
}
