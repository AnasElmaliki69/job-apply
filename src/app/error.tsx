"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="mx-auto max-w-lg p-8"><div className="card"><h1 className="text-xl font-semibold">Something went wrong</h1><p className="my-4 text-slate-500">Please try loading the page again.</p><button className="button" onClick={reset}>Try again</button></div></main>; }
