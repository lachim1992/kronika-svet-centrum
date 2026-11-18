/** One meaning for military_stacks.is_active across economy, movement, AI, battles and supply:
 * is_active=false is a disbanded/inactive unit, whatever is_deployed still says. */
export const STACK_INACTIVE_TEXT = "Armáda je rozpuštěná (neaktivní).";
export const isStackActive = (s: { is_active?: boolean | null } | null | undefined) => !!s && s.is_active !== false;
/** In the field = active AND deployed; is_deployed alone never makes a unit fight, move or besiege. */
export const isFieldStack = (s: { is_active?: boolean | null; is_deployed?: boolean | null } | null | undefined) =>
  isStackActive(s) && s!.is_deployed === true;
