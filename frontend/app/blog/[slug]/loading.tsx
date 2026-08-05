import { PaperBackground } from "@/components/editorial";

export default function BlogPostLoading() {
  return (
    <PaperBackground className="min-h-screen py-16">
      <div
        role="status"
        aria-live="polite"
        className="mx-auto w-full max-w-5xl animate-pulse px-5 md:px-8"
      >
        <span className="sr-only">Loading article…</span>
        <div className="h-3 w-36 bg-[var(--rule)]" />
        <div className="mt-10 h-14 w-4/5 bg-[var(--parchment-deep)]" />
        <div className="mt-5 h-6 w-3/5 bg-[var(--parchment-deep)]" />
        <div className="mt-10 h-80 border border-[var(--rule)] bg-[var(--parchment-deep)]" />
      </div>
    </PaperBackground>
  );
}
