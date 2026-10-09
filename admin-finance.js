import { normalizePick } from "./pick-schema.js";

function asDate(value) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  return null;
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function summarizePublishedPickUnits(picks, { start = null, end = null } = {}) {
  start = start == null ? null : asDate(start);
  end = end == null ? null : asDate(end);
  if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime()))
    || (start && end && start >= end)) {
    throw new Error("Indica un rango temporal válido.");
  }

  const result = {
    count: 0, stakeUnits: 0, netResultUnits: 0, settledCount: 0, pendingCount: 0,
    missingPublicationDate: 0, missingStake: 0, unavailableResult: 0, daily: []
  };
  const days = new Map();

  for (const data of picks) {
    const pick = normalizePick(data);
    const createdAt = asDate(pick.created_at);
    if (!createdAt || !Number.isFinite(createdAt.getTime())) {
      result.missingPublicationDate++;
      continue;
    }
    if ((start && createdAt < start) || (end && createdAt >= end)) continue;

    result.count++;
    const key = dayKey(createdAt);
    if (!days.has(key)) days.set(key, { date: key, count: 0, stakeUnits: 0, netResultUnits: 0 });
    const day = days.get(key);
    day.count++;

    const validStake = Number.isFinite(pick.stake) && pick.stake > 0;
    if (validStake) {
      result.stakeUnits += pick.stake;
      day.stakeUnits += pick.stake;
    } else {
      result.missingStake++;
    }

    if (pick.status === "pending") {
      result.pendingCount++;
      continue;
    }

    result.settledCount++;
    if (pick.status === "void") continue;
    if (!validStake) {
      result.unavailableResult++;
      continue;
    }

    let returned;
    if (pick.status === "won" && Number.isFinite(pick.odds) && pick.odds >= 1.01) {
      returned = pick.stake * pick.odds;
    } else if (pick.status === "lost") {
      returned = 0;
    } else if (pick.status === "cashed_out" && Number.isFinite(pick.cashout_value) && pick.cashout_value >= 0) {
      returned = pick.cashout_value;
    } else if (pick.status === "cashed_out" && Number.isFinite(pick.cashout_odds) && pick.cashout_odds >= 0) {
      returned = pick.stake * pick.cashout_odds;
    } else {
      result.unavailableResult++;
      continue;
    }

    const net = returned - pick.stake;
    result.netResultUnits += net;
    day.netResultUnits += net;
  }

  result.daily = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return result;
}
