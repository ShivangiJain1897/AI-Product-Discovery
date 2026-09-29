import Link from "next/link";
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <h1 className="font-serif text-[24px] font-semibold">We can’t find that</h1>
      <p className="mt-2 text-[14px] text-muted">It may have been deleted (deleted items can be restored from Knowledge → Recently deleted), or it belongs to a different product.</p>
      <div className="mt-4"><Link className="btn btn-primary" href="/">Back to My Products</Link></div>
    </div>
  );
}
