import { generateTileParcels, type TileTerrain } from './tileParcels.ts';
import { PARCEL_ECONOMY_VERSION } from './parcelEconomy.ts';

/** Preflight is read-only; the RPC snapshots and applies all city seats atomically. */
export async function prepareParcelRollout(db: any, session: string) {
  const [g,c,h,p] = await Promise.all([
    db.from('game_sessions').select('current_turn,resolving_turn,parcel_economy_version').eq('id',session).single(),
    db.from('cities').select('*').eq('session_id',session),
    db.from('province_hexes').select('*').eq('session_id',session).range(0,9999),
    db.from('tile_parcels').select('*').eq('session_id',session).range(0,9999),
  ]);
  for(const r of [g,c,h,p]) if(r.error) throw r.error;
  if(g.data.resolving_turn !== null) throw new Error('Turn resolution in progress');
  if(g.data.parcel_economy_version === PARCEL_ECONOMY_VERSION) return { already_applied:true, turn:g.data.current_turn, parcels:[], seats:[] };
  if((h.data || []).length >= 10000 || (p.data || []).length >= 10000) throw new Error('Rollout exceeds bounded preflight');
  const parcels:any[] = [], seats:any[] = [], existing=p.data || [];
  const terrain = (row:any): TileTerrain => ({biome_family:row.biome_family,elevation:row.mean_height,has_river:row.has_river,
    river_direction:row.river_direction,is_coastal:row.coastal,is_passable:row.is_passable});
  for(const city of c.data || []) {
    if(!city.owner_player || city.status && city.status!=='ok') continue;
    const tile=(h.data || []).find((x:any)=> city.grid_x!=null && city.grid_y!=null ? x.grid_x===city.grid_x&&x.grid_y===city.grid_y : x.q===city.province_q&&x.r===city.province_r);
    if(!tile || tile.is_passable===false) throw new Error(`Missing habitable macro square for ${city.id}`);
    const x=tile.grid_x??tile.q,y=tile.grid_y??tile.r;
    const held=existing.filter((a:any)=>a.city_id===city.id);
    if(held.length) {
      const seat=held.find((a:any)=>a.status==='occupied') || held.find((a:any)=>a.grid_x===x&&a.grid_y===y);
      if(!seat) throw new Error(`Existing claims have no home seat for ${city.id}`);
      seats.push({city_id:city.id,owner_player:city.owner_player,grid_x:x,grid_y:y,parcel_index:seat.parcel_index});
      // Lazy map seating may already have materialized the 36 plots with only a four-plot
      // starter footprint. Complete this rollout's eight-plot founding grant on unowned
      // home land only; never replace a paid/occupied/foreign claim.
      const candidates=existing.filter((a:any)=>a.grid_x===x&&a.grid_y===y&&a.status==='wild'&&a.buildable&&!a.city_id&&!a.owner_player)
        .sort((a:any,b:any)=>Number(!/forest|woods|grassland|boggy/.test(a.sub_biome))-Number(!/forest|woods|grassland|boggy/.test(b.sub_biome))
          ||Math.abs(a.parcel_x-seat.parcel_x)+Math.abs(a.parcel_y-seat.parcel_y)-Math.abs(b.parcel_x-seat.parcel_x)-Math.abs(b.parcel_y-seat.parcel_y)||a.parcel_index-b.parcel_index);
      for(const a of candidates.slice(0,Math.max(0,8-held.length)))parcels.push({...a,status:'claimed',land_use:'open',city_id:city.id,owner_player:city.owner_player,claimed_turn:g.data.current_turn});
      continue;
    }
    const neighbors = [[1,0],[-1,0],[0,1],[0,-1]].flatMap(([dx,dy])=>{
      const t=(h.data || []).find((a:any)=>(a.grid_x??a.q)===x+dx&&(a.grid_y??a.r)===y+dy);
      return t ? [{dx,dy,terrain:terrain(t)}]:[];
    });
    const specs=generateTileParcels(session,x,y,terrain(tile),neighbors);
    const free=specs.filter(a=>a.buildable && !existing.some((b:any)=>b.grid_x===x&&b.grid_y===y&&b.parcel_index===a.parcelIndex))
      .sort((a,b)=>Math.abs(a.parcelX-2.5)+Math.abs(a.parcelY-2.5)-Math.abs(b.parcelX-2.5)-Math.abs(b.parcelY-2.5)||a.parcelIndex-b.parcelIndex);
    if(free.length<8) throw new Error(`Insufficient physical founding land for ${city.id}`);
    const seat=free[0],claim=new Set(free.slice(0,8).map(a=>a.parcelIndex));
    for(const s of specs) parcels.push({session_id:session,grid_x:x,grid_y:y,parcel_index:s.parcelIndex,parcel_x:s.parcelX,parcel_y:s.parcelY,
      sub_biome:s.subBiome,elevation:s.elevation,buildable:s.buildable,build_cost_multiplier:s.buildCostMultiplier,capacity_slots:s.capacitySlots,
      status:s.parcelIndex===seat.parcelIndex?'occupied':claim.has(s.parcelIndex)?'claimed':s.buildable?'wild':'blocked',
      land_use:s.parcelIndex===seat.parcelIndex?'civic':null,owner_player:claim.has(s.parcelIndex)?city.owner_player:null,
      city_id:claim.has(s.parcelIndex)?city.id:null,claimed_turn:claim.has(s.parcelIndex)?g.data.current_turn:null});
    seats.push({city_id:city.id,owner_player:city.owner_player,grid_x:x,grid_y:y,parcel_index:seat.parcelIndex});
  }
  if(!seats.length) throw new Error('No inhabited cities to roll out');
  return {already_applied:false,turn:g.data.current_turn,parcels,seats};
}

export async function applyParcelRollout(db:any,session:string) {
  const prepared=await prepareParcelRollout(db,session);
  if(prepared.already_applied) return prepared;
  const {data,error}=await db.rpc('apply_parcel_economy_rollout',{p_session:session,p_turn:prepared.turn,p_parcels:prepared.parcels,p_seats:prepared.seats});
  if(error) throw error;
  return {...data,cities:prepared.seats.length,parcels:prepared.parcels.length};
}