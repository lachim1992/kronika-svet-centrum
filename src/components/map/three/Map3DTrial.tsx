import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { supabase } from "@/integrations/supabase/client";
import { Tile3D, isWater, tileHeight, BIOME_COLOR, SEA_SHALLOW, SEA_DEEP, seeded, treeCount, hasMountain } from "./terrain3d";

type City3D = { id: string; name: string; grid_x: number | null; grid_y: number | null };

function Tiles({ tiles }: { tiles: Tile3D[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return;
    const o = new THREE.Object3D(); const c = new THREE.Color();
    tiles.forEach((t, i) => {
      const h = tileHeight(t);
      o.position.set(t.grid_x, h / 2, t.grid_y); o.scale.set(1, h, 1); o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      if (isWater(t.biome_family)) c.set(t.coastal ? SEA_SHALLOW : SEA_DEEP);
      else c.set(BIOME_COLOR[t.biome_family] || "#8fae3c").offsetHSL(0, 0, (seeded(t.grid_x, t.grid_y, 9) - 0.5) * 0.06);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [tiles]);
  return <instancedMesh ref={ref} args={[undefined, undefined, tiles.length]} receiveShadow castShadow>
    <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial roughness={0.85} />
  </instancedMesh>;
}

function Instanced({ items, geo, color, cast = true }: { items: { p: [number, number, number]; s: number; r?: number }[]; geo: THREE.BufferGeometry; color: string; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current; if (!m) return; const o = new THREE.Object3D();
    items.forEach((it, i) => { o.position.set(...it.p); o.scale.setScalar(it.s); o.rotation.y = it.r ?? 0; o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.instanceMatrix.needsUpdate = true;
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, undefined, items.length]} castShadow={cast} receiveShadow><meshStandardMaterial color={color} roughness={0.8} flatShading /></instancedMesh>;
}

function GridLines({ tiles }: { tiles: Tile3D[] }) {
  const [major, minor] = useMemo(() => {
    const a: number[] = [], b: number[] = [];
    for (const t of tiles) {
      const y = tileHeight(t) + 0.004, x0 = t.grid_x - 0.5, z0 = t.grid_y - 0.5;
      a.push(x0, y, z0, x0 + 1, y, z0, x0, y, z0, x0, y, z0 + 1);
      if (!isWater(t.biome_family)) for (let k = 1; k < 6; k++) { const d = k / 6; b.push(x0 + d, y, z0, x0 + d, y, z0 + 1, x0, y, z0 + d, x0 + 1, y, z0 + d); }
    }
    const g = (arr: number[]) => { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3)); return geo; };
    return [g(a), g(b)];
  }, [tiles]);
  return <>
    <lineSegments geometry={major}><lineBasicMaterial color="#f4f1e6" transparent opacity={0.35} /></lineSegments>
    <lineSegments geometry={minor}><lineBasicMaterial color="#f4f1e6" transparent opacity={0.08} /></lineSegments>
  </>;
}

function Scene({ tiles, cities }: { tiles: Tile3D[]; cities: City3D[] }) {
  const geos = useMemo(() => ({
    crown: new THREE.ConeGeometry(0.07, 0.22, 6).translate(0, 0.15, 0),
    trunk: new THREE.CylinderGeometry(0.012, 0.015, 0.06, 5).translate(0, 0.03, 0),
    mountain: new THREE.ConeGeometry(0.32, 0.7, 7).translate(0, 0.35, 0),
    snow: new THREE.ConeGeometry(0.13, 0.28, 7).translate(0, 0.56, 0),
    river: new THREE.BoxGeometry(1, 0.01, 0.16),
    house: new THREE.BoxGeometry(0.12, 0.08, 0.1).translate(0, 0.04, 0),
    roof: new THREE.ConeGeometry(0.1, 0.07, 4).rotateY(Math.PI / 4).translate(0, 0.115, 0),
  }), []);
  const { trees, mountains, rivers, houses } = useMemo(() => {
    const trees: { p: [number, number, number]; s: number }[] = [], mountains: typeof trees = [], rivers: { p: [number, number, number]; s: number; r: number }[] = [], houses: typeof trees = [];
    const cityAt = new Set(cities.map((c) => `${c.grid_x},${c.grid_y}`));
    for (const t of tiles) {
      const y = tileHeight(t), b = t.biome_family;
      if (hasMountain(b)) for (let i = 0; i < 2; i++) mountains.push({ p: [t.grid_x + (seeded(t.grid_x, t.grid_y, i) - 0.5) * 0.4, y, t.grid_y + (seeded(t.grid_y, t.grid_x, i) - 0.5) * 0.4], s: 0.7 + seeded(t.grid_x, t.grid_y, i + 5) * 0.5 });
      if (!cityAt.has(`${t.grid_x},${t.grid_y}`)) for (let i = 0; i < treeCount(b); i++) trees.push({ p: [t.grid_x + (seeded(t.grid_x, t.grid_y, i + 20) - 0.5) * 0.9, y, t.grid_y + (seeded(t.grid_y, t.grid_x, i + 40) - 0.5) * 0.9], s: 0.7 + seeded(t.grid_x, t.grid_y, i + 60) * 0.6 });
      if (t.has_river && !isWater(b)) rivers.push({ p: [t.grid_x, y + 0.006, t.grid_y], s: 1, r: seeded(t.grid_x, t.grid_y, 3) > 0.5 ? 0 : Math.PI / 2 });
    }
    const tileH = new Map(tiles.map((t) => [`${t.grid_x},${t.grid_y}`, tileHeight(t)]));
    for (const c of cities) {
      if (c.grid_x == null || c.grid_y == null) continue; const y = tileH.get(`${c.grid_x},${c.grid_y}`) ?? 0.2;
      for (let i = 0; i < 9; i++) houses.push({ p: [c.grid_x + ((i % 3) - 1) * 0.22 + (seeded(c.grid_x, i, 1) - 0.5) * 0.08, y, c.grid_y + (Math.floor(i / 3) - 1) * 0.22], s: 0.9 + seeded(c.grid_y, i, 2) * 0.5 });
    }
    return { trees, mountains, rivers, houses };
  }, [tiles, cities]);
  const center = useMemo(() => { const n = Math.max(1, tiles.length); return [tiles.reduce((s, t) => s + t.grid_x, 0) / n, tiles.reduce((s, t) => s + t.grid_y, 0) / n] as const; }, [tiles]);
  const tileH = useMemo(() => new Map(tiles.map((t) => [`${t.grid_x},${t.grid_y}`, tileHeight(t)])), [tiles]);
  return <>
    <color attach="background" args={["#0b1e2c"]} />
    <hemisphereLight args={["#fff4dc", "#2b4a5a", 0.6]} />
    <directionalLight position={[center[0] + 12, 18, center[1] + 6]} intensity={2.2} color="#ffe6b8" castShadow shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-30} shadow-camera-right={30} shadow-camera-top={30} shadow-camera-bottom={-30} />
    <Environment resolution={64}><Lightformer intensity={1.5} position={[0, 5, 0]} scale={[10, 10, 1]} /><Lightformer intensity={0.6} color="#8bd" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} /></Environment>
    <mesh rotation-x={-Math.PI / 2} position={[center[0], -0.01, center[1]]} receiveShadow><planeGeometry args={[200, 200]} /><meshStandardMaterial color={SEA_DEEP} roughness={0.3} metalness={0.1} /></mesh>
    <Tiles tiles={tiles} />
    <GridLines tiles={tiles} />
    <Instanced items={trees} geo={geos.crown} color="#2f5a24" />
    <Instanced items={trees} geo={geos.trunk} color="#5a3d22" />
    <Instanced items={mountains} geo={geos.mountain} color="#8a8f93" />
    <Instanced items={mountains} geo={geos.snow} color="#f2f4f5" />
    <Instanced items={rivers} geo={geos.river} color="#3fa6d8" cast={false} />
    <Instanced items={houses} geo={geos.house} color="#e3d6b8" />
    <Instanced items={houses} geo={geos.roof} color="#b5482f" />
    {cities.filter((c) => c.grid_x != null).map((c) => (
      <Html key={c.id} position={[c.grid_x!, (tileH.get(`${c.grid_x},${c.grid_y}`) ?? 0.2) + 0.45, c.grid_y!]} center>
        <div className="pointer-events-none whitespace-nowrap rounded border border-border bg-card/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">{c.name}</div>
      </Html>
    ))}
    <OrbitControls target={[center[0], 0, center[1]]} maxPolarAngle={1.2} minDistance={4} maxDistance={60} />
  </>;
}

/** Trial 3D view. Read-only: same squares (grid_x/grid_y), no game actions. */
export default function Map3DTrial({ sessionId }: { sessionId: string }) {
  const [tiles, setTiles] = useState<Tile3D[]>([]);
  const [cities, setCities] = useState<City3D[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("province_hexes").select("grid_x, grid_y, biome_family, mean_height, has_river, coastal").eq("session_id", sessionId).not("grid_x", "is", null).limit(4000),
      supabase.from("cities").select("id, name, grid_x, grid_y").eq("session_id", sessionId).limit(500),
    ]).then(([h, c]) => {
      if (!live) return;
      if (h.error || c.error) { setError((h.error || c.error)!.message); return; }
      setTiles((h.data || []) as Tile3D[]); setCities((c.data || []) as City3D[]);
    });
    return () => { live = false; };
  }, [sessionId]);
  if (error) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Mapu nelze načíst: {error}</div>;
  if (!tiles.length) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Načítám 3D mapu…</div>;
  return <div className="h-full w-full" data-scene-ready="true">
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 14, 14], fov: 40 }} gl={{ antialias: true }}
      onCreated={({ camera }) => { const n = tiles.length; const cx = tiles.reduce((s, t) => s + t.grid_x, 0) / n, cz = tiles.reduce((s, t) => s + t.grid_y, 0) / n; camera.position.set(cx + 10, 14, cz + 14); }}>
      <Scene tiles={tiles} cities={cities} />
    </Canvas>
  </div>;
}
