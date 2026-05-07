UPDATE war_declarations
SET status = 'peace_accepted', ended_turn = 34
WHERE session_id = '0de6fab4-b925-4faf-bced-14ec85730f45'
  AND status = 'peace_offered'
  AND declared_turn <= 29;