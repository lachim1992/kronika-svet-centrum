import { describe, expect, it } from 'vitest';
import { MATERIAL_SOURCES, MATERIAL_RAW_GOODS, MATERIAL_DERIVED, MATERIAL_PROCESSING } from './materialResources.ts';
import { microResourceProbability, surveyMicroSquare } from './microResources.ts';
import { depositKey, siteSpecs, availableMacroReserve } from './ruralSites.ts';
import { RECIPES } from './productionCatalog.ts';

describe('Natural material physical contract', () => {
  it('keeps source identities unique and tied to one existing building type', () => {
    expect(MATERIAL_SOURCES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(MATERIAL_SOURCES.map(x => x.good)).size).toBe(MATERIAL_SOURCES.length);
    expect(new Set(MATERIAL_SOURCES.map(x => x.harvest)).size).toBe(MATERIAL_SOURCES.length);
    expect(MATERIAL_SOURCES.every(x => x.building && x.capacity > 0 &&
      Object.values(x.biomes).every(ch => ch > 0 && ch <= 1))).toBe(true);
    const goods = new Set([...MATERIAL_RAW_GOODS, ...MATERIAL_DERIVED].map(g=>g.key));
    expect(goods.has('iron_ore')).toBe(true);
    expect(goods.has('copper_ore')).toBe(true);
    expect(goods.has('raw_clay')).toBe(true);
    expect(goods.has('raw_wool')).toBe(true);
  });

  it('never unlocks private copper/tin ore without real macro geology', () => {
    expect(microResourceProbability('copper', 'hillock', 'hills', [])).toBe(0);
    expect(microResourceProbability('tin', 'hillock', 'hills', [])).toBe(0);
    const copper = [{kind: 'copper', good: 'copper_ore', grade: 2, reserve: 300,
      regenerates: false, implemented: true}] as any;
    expect(microResourceProbability('copper', 'hillock', 'hills', copper)).toBeGreaterThan(0);
    expect(microResourceProbability('copper', 'sand_flat', 'plains', copper)).toBe(0);
  });

  it('gates cotton farming by appropriate macro temperature and moisture', () => {
    expect(microResourceProbability('cotton', 'fertile_silt', 'plains', [],
      {temp_band:1,moisture_band:3})).toBe(0);
    expect(microResourceProbability('cotton', 'fertile_silt', 'plains', [],
      {temp_band:4,moisture_band:1})).toBe(0);
    expect(microResourceProbability('cotton', 'fertile_silt', 'plains', [],
      {temp_band:4,moisture_band:3})).toBeGreaterThan(0);
  });

  it('uses deterministic resource chance for repeated paid surveys', () => {
    const geological = [{kind:'tin',good:'tin_ore',grade:2,reserve:250,
       regenerates:false,implemented:true}] as any;
    const a=surveyMicroSquare('stable-test-salt',4,7,'hillock','hills',geological);
    const b=surveyMicroSquare('stable-test-salt',4,7,'hillock','hills',geological);
    expect(a).toEqual(b);
  });

  it('does not allow a source building to mint unknown, unsurveyed ore', () => {
    const site={recipeKeys:['mine_copper'],level:1,owner:'Neutral:test'};
    const required=new Set([depositKey('Neutral:test',3,4,'copper')]);
    const without=siteSpecs([],site,3,4,required,new Set(),'hillock');
    expect(without.specs.some(s=>s.recipe==='mine_copper')).toBe(false);
    expect(without.blocked.some(b=>b.recipe==='mine_copper')).toBe(true);
    const surveyed=siteSpecs([],site,3,4,required,new Set(['copper']),'hillock');
    expect(surveyed.specs.some(s=>s.recipe==='mine_copper')).toBe(true);
    const withoutMacro=siteSpecs([],site,3,4,new Set(),new Set(['copper']),'hillock');
    expect(withoutMacro.specs.some(s=>s.recipe==='mine_copper')).toBe(false);
  });

  it('never replenishes exhausted physical macro reserves on rediscovery', () => {
    expect(availableMacroReserve(100,0)).toBe(0);
    expect(availableMacroReserve(100,999)).toBe(100);
    expect(availableMacroReserve(100,-10)).toBe(0);
  });

  it('requires real copper and tin for bronze, iron ore for iron, clay for pottery', () => {
    const inputKeys=(key:string)=> (RECIPES.find(r=>r.key===key)?.inputs || []).map(i=>i.good);
    expect(inputKeys('smelt_iron')).toContain('iron_ore');
    expect(inputKeys('smelt_copper')).toContain('copper_ore');
    expect(inputKeys('smelt_iron')).not.toContain('copper_ore');
    expect(inputKeys('make_pottery')).toContain('raw_clay');
    const bronze=MATERIAL_PROCESSING.find(p=>p.key==='cast_bronze')!;
    expect(bronze.inputs.map(i=>i[0]).sort()).toEqual(['copper_ingot','tin_ingot']);
  });
});
