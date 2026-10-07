const legacyStatuses = {
  pendiente: "pending", ganada: "won", perdida: "lost", anulada: "void", cash_out: "cashed_out"
};
export const pickStatuses = Object.freeze(["pending", "won", "lost", "void", "cashed_out"]);
const publicFields = [
  "user_id", "event_date", "sport", "event", "league", "market", "selection", "odds",
  "stake", "bookmaker", "analysis", "status", "cashout_value", "cashout_odds",
  "confianza", "destacada", "show_on_stream", "created_at"
];

export function normalizePick(data) {
  const rawStatus = data.status ?? data.estado ?? "pending";
  const status = legacyStatuses[rawStatus] ?? rawStatus;
  if (!pickStatuses.includes(status)) throw new Error(`Estado de pronóstico inválido: ${rawStatus}`);
  const pick = {
    ...data,
    event_date: data.event_date ?? data.fecha_evento ?? data.event_start_at,
    sport: data.sport ?? data.deporte,
    event: data.event ?? data.evento,
    league: data.league ?? "",
    market: data.market ?? "",
    selection: data.selection ?? data.seleccion ?? data.prediccion ?? data.pronostico,
    odds: data.odds ?? data.cuota,
    stake: data.stake ?? null,
    bookmaker: data.bookmaker ?? data.casa_de_apuestas ?? data.casa_apuestas,
    analysis: data.analysis ?? data.nota ?? "",
    status,
    confianza: data.confianza ?? null,
    destacada: data.destacada ?? false,
    show_on_stream: data.show_on_stream ?? false
  };
  return { ...canonicalPick(pick), ...(data.id ? { id: data.id } : {}) };
}

// A whitelist prevents accidental publication of bankroll fields or historical aliases.
export function canonicalPick(pick) {
  return Object.fromEntries(publicFields.filter(key => pick[key] !== undefined).map(key => [key, pick[key]]));
}

export function summarizePerformance(picks) {
  let active = 0, wins = 0, losses = 0, settledStake = 0, profit = 0, excludedFinancial = 0;
  const odds = [];
  for (const data of picks) {
    const pick = normalizePick(data);
    if (Number.isFinite(pick.odds) && pick.odds >= 1.01) odds.push(pick.odds);
    if (pick.status === "pending") { active++; continue; }
    if (pick.status === "won") wins++;
    if (pick.status === "lost") losses++;
    if (pick.status === "void") continue;
    if (!Number.isFinite(pick.stake) || pick.stake <= 0) { excludedFinancial++; continue; }
    let returned;
    if (pick.status === "won") returned = pick.stake * pick.odds;
    else if (pick.status === "lost") returned = 0;
    else if (pick.cashout_value !== undefined) returned = pick.cashout_value;
    else if (pick.cashout_odds !== undefined) returned = pick.stake * pick.cashout_odds;
    else { excludedFinancial++; continue; }
    if (!Number.isFinite(returned) || returned < 0) throw new Error("El retorno público en unidades es inválido.");
    settledStake += pick.stake;
    profit += returned - pick.stake;
  }
  return {
    active, wins, losses, winRate: wins + losses ? 100 * wins / (wins + losses) : null,
    averageOdds: odds.length ? odds.reduce((sum, value) => sum + value, 0) / odds.length : null,
    settledStake, profit, yield: settledStake ? profit / settledStake * 100 : null, excludedFinancial
  };
}
