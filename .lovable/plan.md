

# Chronicle Hub -- Complete Overhaul Plan

## Overview

This plan implements four major changes simultaneously:
1. User authentication (email + Google) with persistent profiles
2. World Foundation setup when creating a new game
3. Role-based permissions (Admin / Player)
4. Full navigation redesign (bottom nav + nested pages)

---

## 1. Database Changes (Migrations)

### New Tables

**profiles**
- `id` (uuid, PK, references auth.users ON DELETE CASCADE)
- `username` (text, NOT NULL)
- `avatar_url` (text, nullable)
- `bio` (text, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())
- RLS: users can read all profiles, update only their own
- Trigger: auto-create profile row on auth.users insert

**user_roles**
- `id` (uuid, PK)
- `user_id` (uuid, references auth.users ON DELETE CASCADE)
- `role` (app_role enum: admin, moderator, user)
- UNIQUE(user_id, role)
- RLS via security definer function `has_role()`

**game_memberships**
- `id` (uuid, PK)
- `user_id` (uuid, references auth.users ON DELETE CASCADE)
- `session_id` (uuid, references game_sessions ON DELETE CASCADE)
- `player_name` (text, NOT NULL) -- the in-game identity
- `role` (text, default 'player') -- 'admin' or 'player'
- `joined_at` (timestamptz, default now())
- UNIQUE(user_id, session_id)
- RLS: authenticated users can read memberships for their games, insert for themselves

**world_foundations**
- `id` (uuid, PK)
- `session_id` (uuid, references game_sessions, UNIQUE)
- `world_name` (text, NOT NULL)
- `premise` (text, NOT NULL) -- short world description
- `tone` (text, default 'mythic') -- mythic / realistic / dark_fantasy / sci_fi
- `victory_style` (text, default 'story') -- domination / survival / story
- `initial_factions` (text[], default '{}')
- `created_by` (uuid, references auth.users)
- `created_at` (timestamptz, default now())
- RLS: readable by all authenticated, writable by game admin only

### Modified Tables

**game_sessions**: Add column `created_by` (uuid, nullable, references auth.users) to track the game creator.

**game_players**: Add column `user_id` (uuid, nullable, references auth.users) to link players to authenticated users.

### Security Definer Function

```sql
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;
```

### Auto-Create Profile Trigger

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', 'Player'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 2. Authentication Implementation

### New Pages / Components

**`src/pages/Auth.tsx`** -- Login/Register page
- Email + password form (sign up / sign in toggle)
- Google OAuth button (using `lovable.auth.signInWithOAuth("google", ...)`)
- Username field on registration
- Redirect to `/` after successful auth

**`src/pages/ResetPassword.tsx`** -- Password reset page at `/reset-password`

**`src/hooks/useAuth.ts`** -- Auth context/hook
- `onAuthStateChange` listener (set up BEFORE `getSession()`)
- Exposes: `user`, `profile`, `loading`, `signOut()`
- Wraps the app in an AuthProvider

**`src/components/AuthGuard.tsx`** -- Protected route wrapper
- Redirects to `/auth` if not logged in
- Shows loading skeleton during auth check

### Auth Flow

1. Unauthenticated users see `/auth` (login/register)
2. After login, redirect to `/` which shows "My Games" dashboard
3. Game creation/joining now links to `game_memberships`
4. Re-entering a game loads the same `game_memberships.player_name`
5. No more localStorage-based identity (`ch_playerName` replaced by DB lookup)

---

## 3. World Foundation Setup

### New Component: `src/components/WorldSetupWizard.tsx`

Shown as a modal/step after clicking "Create New Game":
- Step 1: World name + premise (text inputs)
- Step 2: Tone selector (mythic / realistic / dark fantasy / sci-fi)
- Step 3: Victory condition (domination / survival / story-based)
- Step 4: Initial factions/civilizations (add 2-6)
- Submit creates `game_sessions` + `world_foundations` + `game_memberships` (role: admin)

### World Codex Page

New section under the World tab showing the immutable `world_foundations` data. AI edge functions will receive `world_foundation` as context when generating narratives.

---

## 4. Role-Based Permissions

### Rules

**Game Admin** (the creator of the game, stored in `game_memberships.role = 'admin'`):
- Generate AI Chronicle entries
- Generate World Feed summaries
- Edit/delete official world history
- Approve legendary events
- Access Dev Mode / Simulation

**Player** (`game_memberships.role = 'player'`):
- Add personal actions (city upgrades, battles, diplomacy)
- Write comments, annotations, local city descriptions
- Submit events as "pending" (not auto-confirmed)

### Implementation

- `useGameSession` hook gains `myRole` field from `game_memberships`
- AI generation buttons are conditionally rendered: `{myRole === 'admin' && <Button>Generate Chronicle</Button>}`
- Event confirmation: players submit as `confirmed: false`, admin confirms
- Chronicle generation buttons hidden from players

---

## 5. Navigation Redesign

### Remove

- The massive `TabsList` with 19+ tabs in `Dashboard.tsx`
- The sticky imperial header (simplified)

### New Structure

**`src/components/layout/BottomNav.tsx`** -- 5 tabs + center FAB
- Tabs: World, Civ, Cities, Feed, Profile
- Center "+" floating action button

**`src/components/layout/ActionChooser.tsx`** -- Modal opened by "+"
- Add City Action (build/upgrade)
- Add Battle
- Add Diplomacy Move
- Add Event (normal/memorable/legendary)
- Add Comment/Note

**`src/components/layout/AppHeader.tsx`** -- Minimal header
- App name, current game selector, turn indicator (Year N), user avatar

### Tab Content (nested pages using accordion/sections)

**World Tab** (`src/pages/game/WorldTab.tsx`)
- World Chronicle (ChronicleFeed -- official canon entries)
- World Codex (WorldFoundation / rules / base premise)
- Wonders of the World (WondersPanel)
- World Timeline (WorldHistoryPanel -- turn-by-turn summaries)
- City States (CityStatesPanel)

**Civ Tab** (`src/pages/game/CivTab.tsx`)
- My Civilization overview (CivilizationDNA)
- Other Nations / Entity Traits (EntityTraitsPanel)
- Diplomacy (DiplomacyPanel)
- War Map (WarRoomPanel)
- Rankings / Scores (LeaderboardsPanel)
- Declarations (DeclarationsPanel)
- Secret Objectives (SecretObjectivesPanel)

**Cities Tab** (`src/pages/game/CitiesTab.tsx`)
- My Cities list (CityDirectory)
- Economy overview (EmpireManagement -- resources/armies/trades)
- Great Persons (GreatPersonsPanel)

**Feed Tab** (`src/pages/game/FeedTab.tsx`)
- Rumors and News feed (intelligence_reports)
- Event Timeline with filters
- Player Chronicle (PlayerChroniclePanel)

**Profile Tab** (`src/pages/game/ProfileTab.tsx`)
- My profile (username/avatar/bio, editable)
- My games list (from game_memberships)
- My role per game
- Settings
- Dev Mode (DevModePanel -- hidden in collapsible, admin only)

### Migration Mapping (old tab to new location)

| Old Tab | New Location |
|---------|-------------|
| overview | World Tab (top section) |
| chronicle | World Tab > World Chronicle |
| worldhistory | World Tab > World Timeline |
| playerchronicle | Feed Tab > My Chronicle |
| civdna | Civ Tab > My Civilization |
| traits | Civ Tab > Other Nations |
| persons | Cities Tab > Great Persons |
| cities | Cities Tab > My Cities |
| empire | Cities Tab > Economy |
| events | Feed Tab > Event Timeline |
| declarations | Civ Tab > Declarations |
| warroom | Civ Tab > War Map |
| wonders | World Tab > Wonders |
| diplomacy | Civ Tab > Diplomacy |
| destiny | Civ Tab > Secret Objectives |
| leaderboards | Civ Tab > Rankings |
| citystates | World Tab > City States |
| wiki | World Tab > Wiki / Codex |
| devmode | Profile Tab > Dev Mode |

---

## 6. Updated Routing

```
/auth              -- Login / Register
/reset-password    -- Password reset
/                  -- My Games dashboard (authenticated)
/game/:sessionId   -- Game view with bottom nav
```

The game view no longer uses URL-based tab routing -- bottom nav manages internal state.

---

## 7. Files to Create

- `src/hooks/useAuth.ts`
- `src/components/AuthGuard.tsx`
- `src/pages/Auth.tsx`
- `src/pages/ResetPassword.tsx`
- `src/pages/MyGames.tsx`
- `src/components/WorldSetupWizard.tsx`
- `src/components/WorldCodex.tsx`
- `src/components/layout/BottomNav.tsx`
- `src/components/layout/ActionChooser.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/pages/game/WorldTab.tsx`
- `src/pages/game/CivTab.tsx`
- `src/pages/game/CitiesTab.tsx`
- `src/pages/game/FeedTab.tsx`
- `src/pages/game/ProfileTab.tsx`

## 8. Files to Modify

- `src/App.tsx` -- Add AuthProvider, new routes, AuthGuard
- `src/pages/Dashboard.tsx` -- Complete rewrite: bottom nav layout, remove TabsList
- `src/pages/Index.tsx` -- Becomes MyGames dashboard (or redirect)
- `src/hooks/useGameSession.ts` -- Add `myRole`, `user_id` linking, World Foundation fetch
- `src/components/ChronicleFeed.tsx` -- Admin-only generation buttons
- `src/components/EventInput.tsx` -- Players submit as pending
- `src/components/DevModePanel.tsx` -- Admin-only access
- Edge functions -- Include `world_foundation` context in AI prompts

---

## 9. Execution Order

1. Database migration (profiles, user_roles, game_memberships, world_foundations, alter game_sessions/game_players)
2. Configure Google OAuth via social auth tool
3. Auth hook, AuthGuard, Auth page, ResetPassword page
4. MyGames dashboard page
5. WorldSetupWizard (game creation flow)
6. Game membership logic in useGameSession
7. Bottom navigation + AppHeader + ActionChooser
8. Five tab pages (World, Civ, Cities, Feed, Profile)
9. Rewrite Dashboard.tsx to use new layout
10. Role-based conditional rendering throughout

