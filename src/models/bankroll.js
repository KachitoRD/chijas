import { normalizePick } from "./pick-schema.js";

export const bankrollCurrencies = Object.freeze([
  { code: "PEN", label: "PEN - Soles", minorUnitDigits: 2 },
  { code: "USD", label: "USD - Dólares", minorUnitDigits: 2 },
  { code: "EUR", label: "EUR - Euros", minorUnitDigits: 2 }
]);

export function parseBankrollStake(value, currencyCode) {
  if (!value.trim()) return null;
  const currency = bankrollCurrencies.find(item => item.code === currencyCode);
  if (!currency) throw new Error("Selecciona una moneda configurada para tu registro privado.");
  const amount = Number(value);
  const scale = 10 ** currency.minorUnitDigits;
  const minorUnits = Math.round(amount * scale);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000
    || !Number.isSafeInteger(minorUnits) || amount !== minorUnits / scale) {
    throw new Error("El monto privado debe ser positivo, de hasta 1 000 000 000 y tener como máximo dos decimales.");
  }
  return { stakeAmount: minorUnits / scale, stakeMinorUnits: minorUnits, currency: currency.code };
}

export function parseCashOutReturn(value, currencyCode) {
  if (!value.trim()) throw new Error("Indica el retorno total recibido, incluido el capital recuperado.");
  if (Number(value) === 0) {
    parseBankrollStake("0.01", currencyCode);
    return { returnAmount: 0, returnMinorUnits: 0 };
  }
  const stake = parseBankrollStake(value, currencyCode);
  return { returnAmount: stake.stakeAmount, returnMinorUnits: stake.stakeMinorUnits };
}

export function parseBankrollOpening(value, currencyCode) {
  if (!value.trim()) throw new Error("Indica el saldo inicial, incluso si es cero.");
  return parseCashOutReturn(value, currencyCode).returnMinorUnits;
}

export function bankrollAccountBalance(account, movements, picks, records) {
  const validMinor = value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000000;
  const timestamp = value => value?.toMillis?.() ?? value?.getTime?.();
  const opened = timestamp(account.created_at);
  if (!bankrollCurrencies.some(item => item.code === account.currency)
    || !validMinor(account.initialMinorUnits) || !Number.isFinite(opened)) {
    throw new Error("La apertura del bankroll no tiene datos válidos.");
  }
  let deposits = 0, withdrawals = 0, profit = 0, risk = 0, financialCount = 0, withoutAmount = 0;
  for (const movement of movements) {
    if (!["deposit", "withdrawal"].includes(movement.type)
      || !validMinor(movement.amountMinorUnits) || movement.amountMinorUnits === 0) {
      throw new Error("El bankroll contiene un movimiento inválido.");
    }
    if (movement.type === "deposit") deposits += movement.amountMinorUnits;
    else withdrawals += movement.amountMinorUnits;
  }
  for (const pick of picks) {
    const created = timestamp(pick.created_at);
    if (!Number.isFinite(created)) throw new Error("Un pronóstico no tiene fecha de publicación válida.");
    if (created <= opened) continue;
    if (!records.has(pick.id)) throw new Error("Faltan importes privados por cargar; el saldo no está disponible.");
    const record = records.get(pick.id);
    if (!record) { withoutAmount++; continue; }
    if (record.currency !== account.currency) continue;
    if (!validMinor(record.stakeMinorUnits) || record.stakeMinorUnits === 0) {
      throw new Error("Un pronóstico tiene un importe privado inválido.");
    }
    const result = pickFinancialResult(pick, record);
    if (result.returned !== null && (!Number.isSafeInteger(result.returned) || result.returned < 0)) {
      throw new Error("Un pronóstico tiene un retorno privado inválido.");
    }
    financialCount++;
    if (result.returned === null) risk += result.stake;
    else profit += result.profit;
  }
  const equity = account.initialMinorUnits + deposits - withdrawals + profit;
  const available = equity - risk;
  if (![deposits, withdrawals, profit, risk, equity, available].every(Number.isSafeInteger)) {
    throw new Error("El saldo supera el límite de cálculo exacto.");
  }
  return { deposits, withdrawals, profit, risk, equity, available, financialCount, withoutAmount };
}

export function pickFinancialResult(pick, bankroll) {
  pick = normalizePick(pick);
  if (!bankroll) return null;
  const stake = bankroll.stakeMinorUnits;
  let returned = null;
  if (pick.status === "won") returned = Math.round(stake * pick.odds);
  else if (pick.status === "lost") returned = 0;
  else if (pick.status === "void") returned = stake;
  else if (pick.status === "cashed_out") {
    if (!Number.isSafeInteger(bankroll.returnMinorUnits) || bankroll.returnMinorUnits < 0) {
      throw new Error("El cierre anticipado no tiene un retorno privado válido.");
    }
    returned = bankroll.returnMinorUnits;
  }
  const profit = returned === null ? null : returned - stake;
  const yieldPercent = profit === null || pick.status === "void" ? null : profit / stake * 100;
  return { currency: bankroll.currency, stake, returned, profit, yield: yieldPercent };
}

export function summarizeBankroll(picks, records) {
  const totals = new Map();
  for (const pick of picks) {
    const result = pickFinancialResult(pick, records.get(pick.id));
    if (!result) continue;
    if (!totals.has(result.currency)) totals.set(result.currency, { currency: result.currency, count: 0, risk: 0, returned: 0, profit: 0, settledStake: 0, yield: null });
    const total = totals.get(result.currency);
    total.count++;
    if (result.returned === null) total.risk += result.stake;
    else {
      total.returned += result.returned;
      total.profit += result.profit;
      if (normalizePick(pick).status !== "void") total.settledStake += result.stake;
    }
  }
  return [...totals.values()].map(total => ({
    ...total, yield: total.settledStake ? total.profit / total.settledStake * 100 : null
  }));
}

export function eventDateRange(from, through) {
  function parse(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Indica las fechas Desde y Hasta.");
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error("El rango contiene una fecha inválida.");
    }
    return date;
  }
  const start = parse(from);
  const lastDay = parse(through);
  if (start > lastDay) throw new Error("Desde no puede ser posterior a Hasta.");
  const end = new Date(lastDay);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function filterBankrollPicks(picks, { status = "", sport = "", bookmaker = "" } = {}) {
  return picks.map(normalizePick).filter(pick => (!status || pick.status === status)
    && (!sport || pick.sport === sport)
    && (!bookmaker || (pick.bookmaker || pick.bookmaker) === bookmaker));
}

export function bankrollReportData(picks, records, filters) {
  const { start, end } = eventDateRange(filters.from, filters.through);
  const selected = filterBankrollPicks(picks, filters).filter(pick => {
    const date = pick.event_date?.toDate?.() || new Date(pick.event_date);
    if (!Number.isFinite(date.getTime())) throw new Error("Un pick no tiene una fecha de evento válida.");
    return date >= start && date < end;
  });
  if (selected.some(pick => !records.has(pick.id))) throw new Error("Faltan registros privados por cargar; no se puede exportar un reporte parcial.");
  const won = selected.filter(pick => pick.status === "won").length;
  const lost = selected.filter(pick => pick.status === "lost").length;
  return {
    filters: { ...filters }, picks: selected, totals: summarizeBankroll(selected, records),
    count: selected.length, financialCount: selected.filter(pick => records.get(pick.id)).length,
    won, lost, effectiveness: won + lost ? won / (won + lost) * 100 : null
  };
}

export function bankrollCSV(picks, records, filters, summaryOnly = false) {
  const report = bankrollReportData(picks, records, filters);
  picks = report.picks;
  const rows = [
    ["Reporte privado de bankroll"],
    ["Fecha del evento desde", filters.from, "hasta (inclusive)", filters.through],
    ["Estado", filters.status || "Todas", "Deporte", filters.sport || "Todos", "Casa", filters.bookmaker || "Todas"],
    ["Yield: profit neto / stake cerrado; excluye pendientes y anuladas. Monedas sin conversión."],
    ["Retornos de ganadas teóricos según cuota; cash out usa el retorno privado registrado."],
    ["Total de picks filtrados", report.count, "Ganadas", report.won, "Perdidas", report.lost,
      "Efectividad (%)", report.effectiveness === null ? "" : Number(report.effectiveness.toFixed(4))],
    [],
    ["Moneda", "Picks con importe", "En riesgo", "Retorno cerrado", "Profit neto", "Stake cerrado para Yield", "Yield (%)"]
  ];
  for (const total of report.totals) {
    rows.push([total.currency, total.count, total.risk / 100, total.returned / 100,
      total.profit / 100, total.settledStake / 100, total.yield === null ? "" : Number(total.yield.toFixed(4))]);
  }
  if (!summaryOnly) {
    rows.push([], ["ID pick", "Fecha evento (hora local)", "Evento", "Selección", "Deporte", "Casa", "Estado",
      "Cuota", "Confianza", "Nota", "Moneda", "Stake privado", "Retorno", "Profit neto", "Yield (%)"]);
    for (const pick of picks) {
      const date = pick.event_date?.toDate?.() || new Date(pick.event_date);
      if (!Number.isFinite(date.getTime())) throw new Error("Un pick no tiene una fecha de evento válida.");
      const financial = pickFinancialResult(pick, records.get(pick.id));
      rows.push([pick.id, date.toLocaleString("sv-SE"), pick.event, pick.selection || pick.selection,
        pick.sport, pick.bookmaker || pick.bookmaker, pick.status, pick.odds, pick.confianza,
        pick.analysis, financial?.currency, financial ? financial.stake / 100 : "",
        financial?.returned == null ? "" : financial.returned / 100,
        financial?.profit == null ? "" : financial.profit / 100,
        financial?.yield == null ? "" : Number(financial.yield.toFixed(4))]);
    }
  }
  return encodeBankrollCSV(rows);
}

function encodeBankrollCSV(rows, numericColumns = []) {
  return "\uFEFF" + rows.map(row => row.map((value, index) => {
    let text = value == null ? "" : String(value);
    const numeric = typeof value === "number" || (numericColumns.includes(index) && /^-?\d+\.\d{2}$/.test(text));
    if (!numeric && /^[\s]*[=+@\-\t\r\n]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}

export function bankrollMovementsCSV(account, movements) {
  bankrollAccountBalance(account, movements, [], new Map());
  const date = value => {
    const result = value?.toDate?.() ?? value;
    if (!(result instanceof Date) || !Number.isFinite(result.getTime())) {
      throw new Error("Falta una fecha confirmada del servidor; no se puede exportar un registro parcial.");
    }
    return result;
  };
  const opened = date(account.created_at);
  const ids = new Set();
  const entries = movements.map(movement => {
    if (typeof movement.id !== "string" || !movement.id || ids.has(movement.id)
      || typeof movement.note !== "string" || movement.note.length > 200) {
      throw new Error("Un movimiento tiene un identificador o una nota inválidos.");
    }
    ids.add(movement.id);
    const created = date(movement.created_at);
    if (created < opened) throw new Error("Un movimiento no puede ser anterior a la apertura.");
    return { ...movement, date: created };
  }).sort((a, b) => a.date - b.date || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let flow = account.initialMinorUnits;
  const amount = minorUnits => (minorUnits / 100).toFixed(2);
  const rows = [
    ["Movimientos privados de bankroll", account.currency],
    ["Contabilidad manual, sin pagos ni conversiones. No incluye resultados ni riesgo de picks."],
    ["Fechas UTC (ISO 8601). Flujo acumulado = apertura + depósitos - retiros; no es saldo contable ni saldo real."],
    ["ID", "Fecha UTC", "Movimiento", "Moneda", "Importe firmado", "Flujo acumulado", "Nota privada"],
    ["apertura", opened.toISOString(), "Apertura", account.currency, amount(flow), amount(flow), ""]
  ];
  for (const entry of entries) {
    const signed = entry.type === "deposit" ? entry.amountMinorUnits : -entry.amountMinorUnits;
    flow += signed;
    if (!Number.isSafeInteger(flow)) throw new Error("El flujo supera el límite de cálculo exacto.");
    rows.push([entry.id, entry.date.toISOString(), entry.type === "deposit" ? "Depósito" : "Retiro",
      account.currency, amount(signed), amount(flow), entry.note]);
  }
  return encodeBankrollCSV(rows, [4, 5]);
}
