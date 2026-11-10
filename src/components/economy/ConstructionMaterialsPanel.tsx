import { CONSTRUCTION_FIELDS } from '@/lib/economyFieldContract';
const labels: Record<string,string> = { raw_timber:'Surové dřevo', raw_stone:'Surový kámen', lumber:'Řezivo', stone_blocks:'Kamenné bloky', construction_materials:'Stavební materiály' };
export default function ConstructionMaterialsPanel({rows,name,reserve}: {rows:any[];name:(id:string)=>string;reserve?:number}) {
  const materials=rows.filter(b=>labels[b.good]);
  if(!materials.length)return null;
  return <details open className="border-t pt-2">
    <summary className="font-semibold cursor-pointer">Materiály a stavební rezerva{reserve!=null?` · ${reserve.toFixed(2)} bodů`:''}</summary>
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr><th className="p-2 text-left">Město / materiál</th>{CONSTRUCTION_FIELDS.map(f=><th className="p-2 text-right" key={f.key}>{f.label}</th>)}</tr></thead>
      <tbody>{materials.map(b=><tr className="border-t" key={`${b.city}:${b.good}`}><td className="p-2">{name(b.city)} · {labels[b.good]}</td>{CONSTRUCTION_FIELDS.map(f=><td className="p-2 text-right" key={f.key}>{typeof b[f.key]==='number'?b[f.key].toFixed(2):'—'}</td>)}</tr>)}</tbody>
    </table></div>
  </details>;
}