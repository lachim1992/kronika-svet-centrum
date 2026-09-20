import type { AlertPriority, DemandClass } from "@/lib/demandClasses";

// Shared types for Goods Command Center (Fáze 1A)

export interface CityBasketRow {
  city_id: string;
  player_name: string;
  basket_key: string;
  turn_number: number;
  local_demand: number;
  local_supply: number;
  auto_supply: number;
  bonus_supply: number;
  recipe_bonus?: number;
  building_bonus?: number;
  domestic_satisfaction: number;
  unmet_demand?: number;
  export_surplus: number;
  demand_detail?: unknown;
}

export interface DemandDetail {
  demand_class: DemandClass;
  group: string;
  label: string;
  channels: Record<string, number>;
  coverage: number;
  basic_need: boolean;
  band: string;
  severity?: string;
  alert: AlertPriority;
  effect: string;
  tool_coverage?: number;
}

export interface BasketAgg {
  demandClass: DemandClass;
  group: string;
  coverage: number;
  alert: AlertPriority;
  effect: string;
  channels: Record<string, number>;
  key: string;
  demand: number;
  supply: number;
  auto: number;
  recipe: number;
  building: number;
  importVol: number;
  unmet: number;
  sat: number;
  cityCount: number;
}
