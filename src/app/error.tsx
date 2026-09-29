"use client";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center" role="alert">
      <h1 className="font-serif text-[24px] font-semibold">Something went wrong loading this page</h1>
      <p className="mt-2 text-[14px] text-muted">Your saved work is safe — nothing on this screen changes it. {error.digest ? `(Reference ${error.digest})` : ""}</p>
      <div className="mt-4 flex justify-center gap-2"><button className="btn btn-primary" onClick={reset}>Try again</button><a className="btn" href="/">Back to My Products</a></div>
    </div>
  );
}
