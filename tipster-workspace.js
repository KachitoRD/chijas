function searchable(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function filterTipsterHistory(picks, { mode = "all", search = "", now = Date.now(), inOBS = () => false } = {}) {
  const terms = searchable(search).trim().split(/\s+/).filter(Boolean);
  return picks.filter(pick => {
    if (mode === "pending" && pick.status !== "pending") return false;
    if (mode === "closed" && pick.status === "pending") return false;
    if (mode === "obs" && !inOBS(pick)) return false;
    if (mode === "needs-result") {
      const date = pick.event_date?.toDate?.() ?? new Date(pick.event_date ?? NaN);
      if (pick.status !== "pending" || !Number.isFinite(date.getTime()) || date.getTime() > now) return false;
    }
    const text = searchable([pick.event, pick.selection, pick.league, pick.market].join(" "));
    return terms.every(term => text.includes(term));
  });
}
