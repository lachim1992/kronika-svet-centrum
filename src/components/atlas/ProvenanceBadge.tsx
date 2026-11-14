import { PROVENANCE_HINT, PROVENANCE_LABEL, type Provenance } from "@/lib/atlas/provenance";

const tone: Record<Provenance, string> = {
  confirmed: "border-primary/40 bg-primary/10 text-primary",
  actual: "border-accent/40 bg-accent/15 text-accent-foreground",
  potential: "border-secondary/50 bg-secondary/30 text-secondary-foreground",
  derived: "border-border bg-muted/50 text-muted-foreground",
  unavailable: "border-destructive/40 bg-destructive/10 text-destructive",
};

export default function ProvenanceBadge({ status, source }: { status: Provenance; source?: string }) {
  return <span data-provenance={status} title={`${PROVENANCE_HINT[status]}${source ? ` Zdroj: ${source}` : ""}`}
    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone[status]}`}>
    {PROVENANCE_LABEL[status]}{source ? <span className="normal-case opacity-75">· {source}</span> : null}
  </span>;
}

export function AtlasCard({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return <section className="rounded-xl border border-border/70 bg-card/60 p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-base text-foreground">{title}</h3>{aside}</div>
    {children}
  </section>;
}
