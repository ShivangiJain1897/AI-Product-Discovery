"use client";
import { useMemo, useState } from "react";
import { CATALOG, GROUPS, readiness, TOPIC_TYPES, type Group, type Knowledge, type TopicType } from "@/lib/catalog";
import { Icon } from "./icon";

const PILL: Record<string, string> = { ready: "bg-accent-soft text-accent-strong", better: "bg-warn-soft text-warn", needs: "bg-sunken text-muted" };
const PILL_LABEL: Record<string, string> = { ready: "Ready", better: "Better later", needs: "Needs input" };

export function CatalogPicker({ knowledge, topicType, selected, onChange, exclude = [] }: { knowledge: Knowledge; topicType?: TopicType; selected: string[]; onChange: (s: string[]) => void; exclude?: string[] }) {
  const [q, setQ] = useState("");
  const items = useMemo(() => CATALOG.filter((c) => !exclude.includes(c.key) && (c.label + " " + c.produces).toLowerCase().includes(q.toLowerCase())), [q, exclude]);
  const suggested = topicType ? CATALOG.filter((c) => c.suggestedFor.includes(topicType) && !exclude.includes(c.key)).map((c) => c.key).slice(0, 5) : [];
  const toggle = (k: string) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <label className="sr-only" htmlFor="cat-q">Search things to do</label>
          <input id="cat-q" className="input !pl-9" placeholder="Search — e.g. journey, PRD, root cause…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {suggested.length > 0 && <button type="button" className="btn" onClick={() => onChange([...new Set([...selected, ...suggested])])}><Icon name="spark" size={15} />Select the {suggested.length} suggested for {/^[aeiou]/i.test(TOPIC_TYPES[topicType!].label) ? "an" : "a"} {TOPIC_TYPES[topicType!].label.toLowerCase()}</button>}
        {selected.length > 0 && <button type="button" className="btn btn-quiet" onClick={() => onChange([])}>Clear</button>}
      </div>
      {(Object.keys(GROUPS) as Group[]).map((g) => {
        const list = items.filter((c) => c.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="mb-6" aria-labelledby={`grp-${g}`}>
            <div className="mb-2 flex items-baseline gap-2"><h3 id={`grp-${g}`} className="text-[15px] font-semibold">{GROUPS[g].label}</h3><p className="text-[12.5px] text-muted">{GROUPS[g].blurb}</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => {
                const on = selected.includes(c.key); const r = readiness(c.key, knowledge);
                return (
                  <button key={c.key} type="button" role="checkbox" aria-checked={on} data-on={on} className="tile" onClick={() => toggle(c.key)}>
                    <span className="flex items-start gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${on ? "bg-accent text-white" : "bg-sunken text-accent-strong"}`}><Icon name={c.icon} size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5"><span className="text-[14px] font-semibold leading-tight">{c.label}</span>{suggested.includes(c.key) && <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent-strong">Suggested</span>}</span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{c.produces}</span>
                        <span className="mt-2 flex items-center gap-1.5 text-[11.5px]"><span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${PILL[r.state]}`}>{PILL_LABEL[r.state]}</span><span className="min-w-0 truncate text-muted" title={r.note}>{r.note}</span></span>
                      </span>
                      <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-white transition-colors ${on ? "border-accent bg-accent" : "border-line-strong bg-surface"}`}>{on && <Icon name="check" size={13} className="[&_circle]:hidden" />}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {items.length === 0 && <p className="py-6 text-center text-[14px] text-muted">Nothing matches “{q}”.</p>}
    </div>
  );
}
