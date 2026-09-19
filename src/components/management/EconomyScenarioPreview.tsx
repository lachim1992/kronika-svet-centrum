import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useManagementReport} from '@/hooks/useManagementReport';
import {ActionPreviewCard} from './ManagementCockpit';
import {Button} from '@/components/ui/button';

export default function EconomyScenarioPreview({sessionId,playerName,currentTurn}:{sessionId:string;playerName:string;currentTurn:number}){
  const {data:report}=useManagementReport(sessionId,playerName,currentTurn);
  const [kind,setKind]=useState('recruitment'),[target,setTarget]=useState(''),[amount,setAmount]=useState(100);
  const [preview,setPreview]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  if(!report)return null;
  const choices=kind==='production'?report.producers.map(p=>({id:p.producer,label:`${report.cities.find(c=>c.id===p.city)?.name} · ${p.good}`})):kind==='route'?report.routes.map(r=>({id:r.id,label:`${r.from} → ${r.to}`})):report.cities.map(c=>({id:c.id,label:c.name}));
  const selected=choices.find(c=>c.id===target)?.id||choices[0]?.id;
  async function calculate(){
    setBusy(true);setPreview(null);setError('');
    try{
      const scenario=kind==='recruitment'?{kind,soldiers:amount}:kind==='production'?{kind,producer:selected,capacityMultiplier:1+amount/100}:kind==='route'?{kind,route:selected,capacityMultiplier:1+amount/100,costMultiplier:1}:{kind,city:selected,allocation:{farming:amount,crafting:(100-amount)*0.5,administration:(100-amount)/6,logistics:(100-amount)/3}};
      const {data,error}=await supabase.functions.invoke('preview-economy',{body:{sessionId,playerName,turn:currentTurn,scenario}});
      if(error)throw error;if(!data?.ok)throw new Error(data?.error||'Náhled není dostupný');setPreview(data);
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <details className="rounded-xl border p-4 space-y-3"><summary className="font-semibold cursor-pointer">Porovnat ekonomický dopad rozhodnutí</summary>
    <p className="text-sm text-muted-foreground">Náhled používá stejný výpočet výroby, spotřeby a dopravy jako hra. Jeho spuštění rozhodnutí neprovede.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Změna<select className="block border rounded bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value);setPreview(null);setTarget('');setAmount(e.target.value==='labor'?40:100);}}><option value="recruitment">Nábor vojáků</option><option value="labor">Práce v zemědělství</option><option value="production">Rozšíření výrobní kapacity</option><option value="route">Zvýšení kapacity cesty</option></select></label>
      {kind!=='recruitment'&&<label className="text-sm">Místo<select className="block border rounded bg-background p-2 max-w-72" value={selected||''} onChange={e=>{setTarget(e.target.value);setPreview(null);}}>{choices.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>}
      <label className="text-sm">{kind==='recruitment'?'Noví vojáci':kind==='labor'?'Podíl zemědělství (%)':'Navýšení kapacity (%)'}<input className="block border rounded bg-background p-2 w-32" type="number" min="0" max={kind==='recruitment'?undefined:kind==='labor'?100:200} value={amount} onChange={e=>{setAmount(Number(e.target.value));setPreview(null);}}/></label>
      <Button disabled={busy||(kind!=='recruitment'&&!selected)} onClick={calculate}>{busy?'Počítám…':'Spočítat dopad'}</Button>
    </div>
    {kind==='labor'&&<p className="text-xs text-muted-foreground">Zbytek práce: řemesla 50 %, správa 16,7 %, logistika 33,3 % ze zbývajícího podílu.</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {preview&&<ActionPreviewCard title="Dopad navržené změny" rows={preview.rows} assumption={preview.assumption}/>}
  </details>;
}
