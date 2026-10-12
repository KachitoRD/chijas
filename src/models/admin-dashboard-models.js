export function groupPicksByTipster(picks) {
  const grouped = new Map();
  for (const pick of picks) {
    if (typeof pick.user_id !== "string" || !pick.user_id) continue;
    const tipsterPicks = grouped.get(pick.user_id);
    if (tipsterPicks) tipsterPicks.push(pick);
    else grouped.set(pick.user_id, [pick]);
  }
  return grouped;
}
