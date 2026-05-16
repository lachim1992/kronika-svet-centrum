-- Strip city-like suffix "– Centrální" / "– Hlavní" from resource_node names to prevent visual confusion with cities.
-- Pattern came from worldgen: province name "X – Centrální" was concatenated into node label "🏘️ Hvozd X – Centrální".

UPDATE public.province_nodes
SET name = regexp_replace(name, '\s*[–-]\s*(Centrální|Hlavní)\s*$', '', 'i'),
    updated_at = now()
WHERE node_type IN ('resource_node', 'trade_hub')
  AND name ~* '\s*[–-]\s*(Centrální|Hlavní)\s*$';
