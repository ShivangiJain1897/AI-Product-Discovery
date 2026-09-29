import type { ReactNode } from "react";

/** Minimal renderer for the markdown we generate (headings, bold, italics, quotes, bullets). No raw HTML is ever emitted. */
function inline(s: string): ReactNode[] {
  const out: ReactNode[] = []; let i = 0; const re = /\*\*(.+?)\*\*|\*(.+?)\*/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) { if (m.index > i) out.push(s.slice(i, m.index)); out.push(m[1] ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>); i = m.index + m[0].length; }
  if (i < s.length) out.push(s.slice(i));
  return out;
}
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="prose-clarity text-[14.5px]">
      {blocks.map((b, i) => {
        if (b.startsWith("### ")) return <h3 key={i}>{inline(b.slice(4))}</h3>;
        if (b.split("\n").every((l) => l.startsWith(">"))) return <blockquote key={i}>{inline(b.split("\n").map((l) => l.replace(/^>\s?/, "")).join(" "))}</blockquote>;
        if (b.split("\n").every((l) => /^\s*- /.test(l))) return <ul key={i}>{b.split("\n").map((l, k) => <li key={k}>{inline(l.replace(/^\s*- /, ""))}</li>)}</ul>;
        if (b.includes("\n> ")) return <div key={i}>{b.split("\n").map((l, k) => l.startsWith(">") ? <blockquote key={k}>{inline(l.replace(/^>\s?/, ""))}</blockquote> : <p key={k}>{inline(l)}</p>)}</div>;
        return <p key={i}>{b.split("\n").map((l, k) => <span key={k}>{k > 0 && <br />}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}
