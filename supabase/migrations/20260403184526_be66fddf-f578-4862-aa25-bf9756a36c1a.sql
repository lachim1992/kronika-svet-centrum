
-- =============================================
-- Chronicle Economy v4.1 — Phase 2: Core Tables
-- =============================================

-- 1. Resource Types (raw materials found on hexes)
CREATE TABLE public.resource_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'grain',
  replicable boolean NOT NULL DEFAULT true,
  base_quality_band int NOT NULL DEFAULT 1,
  strategic_weight text NOT NULL DEFAULT 'common',
  spawn_biomes text[] DEFAULT '{}',
  storable boolean NOT NULL DEFAULT false,
  icon text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.resource_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_types_select" ON public.resource_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "resource_types_insert" ON public.resource_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "resource_types_update" ON public.resource_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "resource_types_delete" ON public.resource_types FOR DELETE TO authenticated USING (true);

-- 2. Goods (system-level economic goods)
CREATE TABLE public.goods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'food',
  production_stage text NOT NULL DEFAULT 'raw',
  market_tier text NOT NULL DEFAULT 'mass',
  base_price_band int NOT NULL DEFAULT 0,
  base_price_numeric numeric NOT NULL DEFAULT 1.0,
  demand_basket text,
  substitution_map jsonb DEFAULT '{}',
  storable boolean NOT NULL DEFAULT false,
  icon text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goods_select" ON public.goods FOR SELECT TO authenticated USING (true);
CREATE POLICY "goods_insert" ON public.goods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "goods_update" ON public.goods FOR UPDATE TO authenticated USING (true);
CREATE POLICY "goods_delete" ON public.goods FOR DELETE TO authenticated USING (true);

-- 3. Good Variants (flavor/identity layer)
CREATE TABLE public.good_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_good_key text NOT NULL REFERENCES public.goods(key) ON DELETE CASCADE,
  variant_key text UNIQUE NOT NULL,
  display_name text NOT NULL DEFAULT '',
  quality_modifier int NOT NULL DEFAULT 0,
  prestige_modifier numeric NOT NULL DEFAULT 0,
  cultural_origin text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.good_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "good_variants_select" ON public.good_variants FOR SELECT TO authenticated USING (true);
CREATE POLICY "good_variants_insert" ON public.good_variants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "good_variants_update" ON public.good_variants FOR UPDATE TO authenticated USING (true);
CREATE POLICY "good_variants_delete" ON public.good_variants FOR DELETE TO authenticated USING (true);

-- 4. Production Recipes (tag-based, not subtype-bound)
CREATE TABLE public.production_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_key text UNIQUE NOT NULL,
  output_good_key text NOT NULL REFERENCES public.goods(key) ON DELETE CASCADE,
  output_quantity numeric NOT NULL DEFAULT 1,
  input_items jsonb NOT NULL DEFAULT '[]',
  required_role text NOT NULL DEFAULT 'source',
  required_tags text[] NOT NULL DEFAULT '{}',
  min_quality_input int NOT NULL DEFAULT 0,
  quality_output_bonus int NOT NULL DEFAULT 0,
  labor_cost numeric NOT NULL DEFAULT 1,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "production_recipes_select" ON public.production_recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "production_recipes_insert" ON public.production_recipes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "production_recipes_update" ON public.production_recipes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "production_recipes_delete" ON public.production_recipes FOR DELETE TO authenticated USING (true);

-- Indexes
CREATE INDEX idx_goods_category ON public.goods(category);
CREATE INDEX idx_goods_production_stage ON public.goods(production_stage);
CREATE INDEX idx_goods_demand_basket ON public.goods(demand_basket);
CREATE INDEX idx_good_variants_parent ON public.good_variants(parent_good_key);
CREATE INDEX idx_production_recipes_output ON public.production_recipes(output_good_key);
CREATE INDEX idx_production_recipes_role ON public.production_recipes(required_role);
CREATE INDEX idx_resource_types_category ON public.resource_types(category);
