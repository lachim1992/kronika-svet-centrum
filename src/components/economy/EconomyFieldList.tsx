import { CITY_ACCOUNT_FIELDS, formatField, type EconomyField } from "@/lib/economyFieldContract";
import { InfoTip } from "@/components/ui/info-tip";

/** Shared renderer of the economy field contract — used by the Economy tab and Economy Dev Mode. */
export default function EconomyFieldList({ row, showSource = false, fields = CITY_ACCOUNT_FIELDS }: { row: Record<string, unknown> | null | undefined; showSource?: boolean; fields?: EconomyField[] }) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
      {fields.map(f => {
        const v = formatField(f, row);
        return (
          <div key={f.key} className="flex flex-wrap items-baseline gap-1 min-w-0">
            <dt className="text-muted-foreground">{f.label}</dt>
            <InfoTip>{f.tip}{showSource ? ` Zdroj: ${f.source}.${f.key}` : ""}</InfoTip>
            <dd className={v.missing ? "italic text-muted-foreground" : "font-medium"}>{v.text}</dd>
          </div>
        );
      })}
    </dl>
  );
}
