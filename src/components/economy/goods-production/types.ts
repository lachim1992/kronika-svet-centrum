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
}

export interface BasketAgg {
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
