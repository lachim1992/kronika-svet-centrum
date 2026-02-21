# Chronicle Hub — Architecture Plan v2

## Vision

Chronicle Hub supports **two world progression systems** sharing one database engine:
1. **Turn-Based** (Singleplayer + Multiplayer)
2. **Time-Based Persistent** (flagship, phase 3+)

Priority #1: **Turn-Based Singleplayer with AI World** (premium feature).
Monetization: free/premium flag only (no Stripe yet).

---

## I. GAME MODE TAXONOMY

```
game_sessions.game_mode = 'tb_single_ai' | 'tb_single_manual' | 'tb_multi' | 'time_persistent'
game_sessions.tier       = 'free' | 'premium'
```

| Mode | Code | Players | AI Role | Status |
|------|------|---------|---------|--------|
| SP AI World | `tb_single_ai` | 1 | World generator + reactor | **Phase 1** |
| SP Manual | `tb_single_manual` | 1 | Optional lore helper | Phase 2 |
| MP Turn-Based | `tb_multi` | 2–6 | Narrator + event gen | **Existing** (current app) |
| Time-Based Persistent | `time_persistent` | 2–50+ | Autonomous event engine | Phase 3 |

---

## II. PHASE 1 — Turn-Based Singleplayer (AI World)

### A) World Generation Pipeline

When creating a `tb_single_ai` game, the system generates:

1. **World Foundation** (existing `world_foundations` table — extend)
   - World name, premise, tone, victory_style
   - NEW: `biome_template`, `world_size` (small/medium/large), `history_depth` (free: 10y, premium: 50-200y)

2. **AI World Init** — new edge function `world-generate-init`
   - Input: world_foundation params + tier
   - Generates:
     - 3–8 AI factions (stored in `civilizations` with `is_ai = true`)
     - 5–20 cities across 2–6 regions
     - Political relationships (alliances, rivalries)
     - 10–200 years of simulated pre-history (as `game_events` + `chronicle_entries`)
     - Trade routes (as `entity_traits` on cities)
     - Cultural tensions (as `world_memories`)
   - Output saved to DB in one transaction

3. **Player Placement**
   - Player chooses or is assigned a starting faction
   - Player's cities/regions highlighted
   - AI factions become NPC opponents

### B) AI Reaction System

Each turn end triggers:
1. `process-turn` (existing) — economy
2. NEW: `ai-faction-turn` — each AI faction:
   - Evaluates world state
   - Makes decisions (build, trade, declare war, ally)
   - Generates events
   - Uses **compressed world summary** (not full history)
3. `chronicle` / `world-chronicle-round` (existing) — narrate

### C) Memory & Context Management

**Free Tier:**
- AI remembers last 5 turns in detail
- Older history compressed to 1-paragraph summaries per 5 turns
- Max 20 world memories active

**Premium Tier:**
- AI remembers last 20 turns in detail
- Full entity trait history
- Unlimited world memories
- Richer narrative generation (longer prompts, more context)

#### New Table: `ai_world_summaries`
```sql
CREATE TABLE ai_world_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions NOT NULL,
  summary_type TEXT NOT NULL, -- 'world_state' | 'faction_state' | 'era_recap'
  faction_name TEXT,          -- NULL for world-level summaries
  turn_range_from INT,
  turn_range_to INT,
  summary_text TEXT NOT NULL,
  key_facts JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### New Table: `ai_factions`
```sql
CREATE TABLE ai_factions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions NOT NULL,
  faction_name TEXT NOT NULL,
  personality TEXT NOT NULL,     -- 'aggressive' | 'diplomatic' | 'mercantile' | 'isolationist'
  disposition JSONB DEFAULT '{}', -- { "player": 50, "faction_x": -20 }
  goals JSONB DEFAULT '[]',      -- ["expand_north", "build_wonder"]
  resources_snapshot JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### D) Database Changes (Phase 1)

#### Alter `game_sessions`:
```sql
ALTER TABLE game_sessions ADD COLUMN game_mode TEXT DEFAULT 'tb_multi';
ALTER TABLE game_sessions ADD COLUMN tier TEXT DEFAULT 'free';
```

#### Alter `civilizations`:
```sql
ALTER TABLE civilizations ADD COLUMN is_ai BOOLEAN DEFAULT false;
ALTER TABLE civilizations ADD COLUMN ai_personality TEXT;
```

#### New edge functions:
- `world-generate-init` — generates full world from foundation params
- `ai-faction-turn` — processes one AI faction's turn decisions
- `ai-compress-history` — compresses old turns into summaries

### E) UI Changes (Phase 1)

#### Game Creation Flow:
1. User picks mode: "AI World" / "Manual World" / "Multiplayer"
2. For AI World:
   - World size selector (small 5 cities / medium 12 / large 20)
   - Tone + premise (existing wizard)
   - History depth (free: 10y / premium: 50-200y)
   - Generate button → loading screen with progress
3. After generation → enter game as usual

#### In-Game:
- AI factions appear in Diplomacy panel as NPC partners
- AI faction decisions appear in World Feed
- Player can interact with AI factions (trade, war, diplomacy)
- "AI Turn" processing shown as animated loading between turns

---

## III. PHASE 2 — Turn-Based Singleplayer (Manual/Human-Arranged)

### Purpose
For DnD groups, tabletop RPGs, collaborative worldbuilding.

### Key Differences from AI Mode:
- No automatic world generation
- No AI faction turns
- Player(s) manually create everything
- AI available as **optional paid tool**:
  - "Generate city lore" button
  - "Generate war outcome" button
  - "Generate artifact description" button
  - Each generation costs 1 "AI credit" (tracked in DB, not real money yet)

### Database:
- Uses same tables as Phase 1
- `game_mode = 'tb_single_manual'`
- No `ai_factions` rows
- No `ai_world_summaries`

### UI:
- Simplified creation wizard (no world generation)
- Manual entity creation forms for everything
- Optional AI buttons marked with ✨ icon

---

## IV. PHASE 3 — Time-Based Persistent System

### Core Concept
World runs in real-time. Actions consume time. Distance matters.

### New Concepts:
- **Action Queue** — ordered list of pending actions with time costs
- **Time Pools** — per-player and per-city time budgets
- **Travel System** — distance-based delays between cities
- **Admin Mode** — dedicated monitoring dashboard

### New Tables:

#### `action_queue`
```sql
CREATE TABLE action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions NOT NULL,
  player_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completes_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | in_progress | completed | cancelled
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `time_pools`
```sql
CREATE TABLE time_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions NOT NULL,
  entity_type TEXT NOT NULL, -- 'player' | 'city' | 'army'
  entity_id UUID NOT NULL,
  pool_name TEXT NOT NULL,   -- 'personal' | 'governance' | 'military'
  total_minutes INT NOT NULL,
  used_minutes INT DEFAULT 0,
  resets_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `server_config`
```sql
CREATE TABLE server_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES game_sessions NOT NULL UNIQUE,
  time_scale FLOAT DEFAULT 1.0,    -- 1.0 = real-time, 10.0 = 10x speed
  tick_interval_seconds INT DEFAULT 60,
  max_players INT DEFAULT 50,
  admin_user_id UUID REFERENCES auth.users,
  economic_params JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Admin Dashboard:
- Economic monitoring (inflation, resource rates)
- Faction balance stats
- Political instability meter
- Conflict heatmap
- Player activity tracker
- Manual intervention tools

### Automated Event Engine:
- Cron job every N minutes
- Evaluates: economic imbalance, military tension, trade disruption, cultural friction
- References past history for continuity
- Generates contextual events

### Inactivity System:
- After X hours inactive: AI assumes conservative governance
- After Y days: faction can be voted out by other players
- Delegation system for temporary absence

---

## V. SHARED ENGINE (All Modes)

These systems are shared across all modes:

| System | Tables | Notes |
|--------|--------|-------|
| Chronicle Engine | `chronicle_entries`, `event_narratives` | Single source of truth |
| World Memory | `world_memories`, `city_memories` | Persistent facts |
| Entity Traits | `entity_traits` | Identity system |
| Entity Contributions | `entity_contributions` | Player-created lore |
| Wiki/Codex | `wiki_entries`, `encyclopedia_images` | Knowledge base |
| Diplomacy | `diplomacy_rooms`, `diplomacy_messages` | Player-to-player/NPC |
| Events | `game_events`, `world_events` | History nodes |
| Economy | `player_resources`, `cities`, `settlement_resource_profiles` | Resource model |

---

## VI. FREE vs PREMIUM

| Feature | Free | Premium |
|---------|------|---------|
| Multiplayer | ✅ Full | ✅ Full |
| Manual Singleplayer | ✅ Full | ✅ Full |
| AI Singleplayer | ✅ Limited | ✅ Full |
| AI history depth | 10 years | 50-200 years |
| AI memory window | 5 turns | 20 turns |
| World memories cap | 20 | Unlimited |
| AI lore generation | 3/day | Unlimited |
| World size | Small (5 cities) | Large (20 cities) |
| Time-Based servers | ❌ | ✅ |

Stored as: `game_sessions.tier = 'free' | 'premium'`

User-level premium tracked in: `profiles.is_premium BOOLEAN DEFAULT false`

---

## VII. EXECUTION ROADMAP

### Phase 1A — Foundation (Current Sprint)
1. ✅ Auth system (done)
2. ✅ Role-based permissions (done)
3. ✅ Navigation redesign (done)
4. ✅ Economy system (done)
5. Migration: Add `game_mode`, `tier` to `game_sessions`
6. Migration: Add `is_ai`, `ai_personality` to `civilizations`
7. Migration: Create `ai_factions`, `ai_world_summaries`
8. Migration: Add `is_premium` to `profiles`
9. Update game creation wizard with mode selection

### Phase 1B — AI Singleplayer Core
10. Edge function: `world-generate-init`
11. Edge function: `ai-faction-turn`
12. Edge function: `ai-compress-history`
13. AI faction display in Diplomacy panel
14. AI turn processing animation
15. World generation loading screen
16. Free/premium tier limits enforcement

### Phase 2 — Manual Singleplayer
17. Simplified creation wizard
18. Manual entity creation forms
19. Optional AI generation buttons with credit tracking
20. DnD/RPG-friendly templates

### Phase 3 — Time-Based Persistent
21. Action queue system
22. Time pool mechanics
23. Travel/distance system
24. Admin monitoring dashboard
25. Automated event engine (cron)
26. Inactivity/delegation system
27. Server configuration panel

---

## VIII. DESIGN PHILOSOPHY

> Chronicle Hub is not just a game.
> It is a **persistent world engine**, a **political simulation platform**,
> and a **narrative chronicle system**.
> **Time and consequence** are core pillars.

All modes share:
- Event-based chronicle as single source of truth
- World summary layers for AI context
- Entity state tracking
- Action audit logging

No duplicated logic between modes.
Only **time resolution** differs.
