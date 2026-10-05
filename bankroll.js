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

export function pickFinancialResult(pick, bankroll) {
  if (!bankroll) return null;
  const stake = bankroll.stakeMinorUnits;
  let returned = null;
  if (pick.estado === "ganada") returned = Math.round(stake * pick.cuota);
  else if (pick.estado === "perdida") returned = 0;
  else if (pick.estado === "anulada") returned = stake;
  else if (pick.estado === "cash_out") {
    if (!Number.isSafeInteger(bankroll.returnMinorUnits) || bankroll.returnMinorUnits < 0) {
      throw new Error("El cierre anticipado no tiene un retorno privado válido.");
    }
    returned = bankroll.returnMinorUnits;
  }
  const profit = returned === null ? null : returned - stake;
  const yieldPercent = profit === null || pick.estado === "anulada" ? null : profit / stake * 100;
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
      if (pick.estado !== "anulada") total.settledStake += result.stake;
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
  return picks.filter(pick => (!status || pick.estado === status)
    && (!sport || pick.deporte === sport)
    && (!bookmaker || (pick.casa_de_apuestas || pick.casa_apuestas) === bookmaker));
}

export function bankrollReportData(picks, records, filters) {
  const { start, end } = eventDateRange(filters.from, filters.through);
  const selected = filterBankrollPicks(picks, filters).filter(pick => {
    const date = pick.fecha_evento?.toDate?.() || new Date(pick.fecha_evento);
    if (!Number.isFinite(date.getTime())) throw new Error("Un pick no tiene una fecha de evento válida.");
    return date >= start && date < end;
  });
  if (selected.some(pick => !records.has(pick.id))) throw new Error("Faltan registros privados por cargar; no se puede exportar un reporte parcial.");
  const won = selected.filter(pick => pick.estado === "ganada").length;
  const lost = selected.filter(pick => pick.estado === "perdida").length;
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
      const date = pick.fecha_evento?.toDate?.() || new Date(pick.fecha_evento);
      if (!Number.isFinite(date.getTime())) throw new Error("Un pick no tiene una fecha de evento válida.");
      const financial = pickFinancialResult(pick, records.get(pick.id));
      rows.push([pick.id, date.toLocaleString("sv-SE"), pick.evento, pick.seleccion || pick.prediccion,
        pick.deporte, pick.casa_de_apuestas || pick.casa_apuestas, pick.estado, pick.cuota, pick.confianza,
        pick.nota, financial?.currency, financial ? financial.stake / 100 : "",
        financial?.returned == null ? "" : financial.returned / 100,
        financial?.profit == null ? "" : financial.profit / 100,
        financial?.yield == null ? "" : Number(financial.yield.toFixed(4))]);
    }
  }
  return "\uFEFF" + rows.map(row => row.map(value => {
    let text = value == null ? "" : String(value);
    if (typeof value !== "number" && /^[\s]*[=+@\-\t\r\n]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}
