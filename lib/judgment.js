// 判定业务：巡检结论、隔离与复验规则、试磨放行。
// 纯业务规则，不读写文件；所有时间由参数传入，便于校验 12 小时间隔。

export const TICKET_STATES = ["正常", "待复验", "已失效"];
export const APPEARANCES = ["正常", "霉点", "软边"];
export const HUMIDITY_LIMIT = 65; // 复验合格线：湿度低于 65%
export const RECHECK_GAP_MS = 12 * 60 * 60 * 1000; // 两次合格复验间隔 12 小时

export class DomainError extends Error {
  constructor(message, status = 400, code = "domain_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function toNumber(value, label) {
  const n = Number(value);
  if (value === "" || value == null || Number.isNaN(n)) {
    throw new DomainError(label + "需填写数字");
  }
  return n;
}

// 外观见霉点或软边即异常
export function hasMoldOrSoftEdge(appearance) {
  const text = String(appearance || "");
  return text.includes("霉") || text.includes("软边");
}

// 单次巡检结论：霉点/软边 -> 待复验（隔离），否则正常
export function judgeInspection({ appearance }) {
  return hasMoldOrSoftEdge(appearance) ? "待复验" : "正常";
}

// 归一化巡检单上的环境值
export function normalizeEnv(input = {}) {
  const inspector = String(input.inspector || "").trim();
  if (!inspector) throw new DomainError("请填写巡检人");
  const appearance = String(input.appearance || "").trim();
  if (!appearance) throw new DomainError("请填写外观（正常/霉点/软边）");
  const humidity = toNumber(input.humidity, "湿度");
  const temperature =
    input.temperature === "" || input.temperature == null
      ? null
      : toNumber(input.temperature, "温度");
  return { inspector, appearance, humidity, temperature };
}

// 某锭巡检单排序（新的在前）
function listSorted(db, itemCode) {
  return db.inspections
    .filter((t) => t.itemCode === itemCode)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

// 某锭当前有效（未失效）的巡检单
export function activeTickets(db, itemCode) {
  return listSorted(db, itemCode).filter((t) => t.state !== "已失效");
}

export function currentTicket(db, itemCode) {
  return activeTickets(db, itemCode)[0] || null;
}

// 最近一张巡检单（含已失效），供页面展示“原结论已失效”
export function latestTicket(db, itemCode) {
  return listSorted(db, itemCode)[0] || null;
}

export function canGrind(db, item) {
  const t = currentTicket(db, item.code);
  return !!t && t.state === "正常" && t.storage === item.storage ? t : null;
}

export function assertCanGrind(db, item) {
  const t = currentTicket(db, item.code);
  if (!t) {
    const latest = latestTicket(db, item.code);
    if (latest && latest.storage !== item.storage) {
      throw new DomainError("库位已变更，原巡检单已失效，请重新巡检", 403, "storage_moved");
    }
    if (latest) {
      throw new DomainError(
        "原巡检单已失效" + (latest.invalidReason ? "（" + latest.invalidReason + "）" : "") + "，请重新巡检",
        403,
        "conclusion_invalid"
      );
    }
    throw new DomainError("该锭尚无有效巡检单，请先巡检再试磨", 403, "no_inspection");
  }
  if (t.state === "待复验") {
    throw new DomainError(
      "该锭隔离待复验：须换人、隔 12 小时做两次，两次湿度均低于 65% 且外观正常才能恢复试磨",
      403,
      "isolated"
    );
  }
  if (t.storage !== item.storage) {
    throw new DomainError("库位已变更，原巡检单已失效，请重新巡检", 403, "storage_moved");
  }
  return t;
}

function markInvalid(ticket, reason, at) {
  ticket.state = "已失效";
  ticket.invalidReason = reason;
  ticket.invalidatedAt = at;
}

export function logOn(item, at, step, note, extra = {}) {
  item.logs ||= [];
  item.logs.push({ at, step, note, ...extra });
}

let ticketSeq = 0;
export function newTicketId(atIso) {
  ticketSeq += 1;
  const stamp = String(atIso).replace(/[-:T.Z]/g, "").slice(0, 14);
  return "INSP-" + stamp + "-" + String(ticketSeq).padStart(2, "0");
}

// 登记一张巡检单（建档 / 试磨前巡检都走这里）。
// 规则：每锭只留一张未复验单——再次巡检仍异常则旧单失效；
// 已有未复验单时不得用一张“正常”新单绕过复验流程。
export function fileInspection(db, item, rawInput, { source, at }) {
  const env = normalizeEnv(rawInput);
  const state = judgeInspection(env);
  const pending = db.inspections.filter(
    (t) => t.itemCode === item.code && t.state === "待复验"
  );
  if (pending.length) {
    if (state === "正常") {
      throw new DomainError(
        "该锭已有未复验单，须由他人按复验流程处理（隔 12 小时两次合格），不能另开正常单",
        409,
        "pending_exists"
      );
    }
    pending.forEach((t) => markInvalid(t, "新巡检单替代", at));
  }

  const ticket = {
    id: newTicketId(at),
    itemCode: item.code,
    source,
    storage: item.storage, // 库位随单留痕
    ...env,
    at,
    state,
    rechecks: [],
  };
  db.inspections.unshift(ticket);

  if (state === "待复验") {
    item.status = "隔离";
    logOn(
      item,
      at,
      "巡检隔离",
      source + "巡检见「" + env.appearance + "」，湿度 " + env.humidity + "%，移入隔离区，暂停试磨"
    );
  } else {
    logOn(item, at, "巡检", source + "巡检正常，湿度 " + env.humidity + "%，外观正常");
  }
  return ticket;
}

// 建档：墨锭与首张巡检单一起落账
export function createItem(db, item, rawEnv, at) {
  logOn(item, at, "建档", "创建墨锭，库位 " + item.storage);
  db.items.unshift(item);
  const ticket = fileInspection(db, item, rawEnv, { source: "建档", at });
  return { item, ticket };
}

// 复验一轮。换人；两次合格复验间隔满 12 小时，湿度均 <65 且外观正常才恢复。
export function addRecheck(db, ticket, item, rawInput, atIso) {
  if (ticket.state !== "待复验") {
    throw new DomainError("该巡检单不在待复验状态", 409, "not_pending");
  }
  const env = normalizeEnv(rawInput);
  if (env.inspector === ticket.inspector) {
    throw new DomainError("复验须换由他人执行，不能与原巡检人「" + ticket.inspector + "」相同", 409, "same_inspector");
  }

  const at = Date.parse(atIso);
  const pass = env.humidity < HUMIDITY_LIMIT && !hasMoldOrSoftEdge(env.appearance);

  if (!pass) {
    ticket.rechecks.push({ at: atIso, ...env, pass: false });
    logOn(
      item,
      atIso,
      "复验",
      "复验不合格（湿度 " + env.humidity + "%，外观 " + env.appearance + "），保持隔离，两次合格复验重新计数"
    );
    return { recovered: false, ticket, message: "复验不合格，保持隔离，需重新开始两次合格复验" };
  }

  // 只统计最近一次不合格复验之后的合格轮次
  let lastFail = -1;
  ticket.rechecks.forEach((r, i) => {
    if (!r.pass) lastFail = i;
  });
  const chain = ticket.rechecks
    .map((r, i) => [r, i])
    .filter(([r, i]) => r.pass && i > lastFail)
    .map(([r]) => r);

  if (chain.length === 0) {
    ticket.rechecks.push({ at: atIso, ...env, pass: true });
    logOn(item, atIso, "复验", "第 1 次合格复验：湿度 " + env.humidity + "%，外观正常；满 12 小时后由他人进行第 2 次");
    return { recovered: false, ticket, message: "已记录第 1 次合格复验，满 12 小时后进行第 2 次" };
  }

  const first = chain[0];
  const gap = at - Date.parse(first.at);
  if (gap < RECHECK_GAP_MS) {
    const hours = Math.ceil((RECHECK_GAP_MS - gap) / 3600000);
    throw new DomainError("第 2 次合格复验须与第 1 次间隔满 12 小时（还差约 " + hours + " 小时）", 409, "recheck_too_soon");
  }

  ticket.rechecks.push({ at: atIso, ...env, pass: true });
  ticket.state = "正常";
  ticket.recoveredAt = atIso;
  if (item.status === "隔离") item.status = "待试磨";
  logOn(item, atIso, "复验恢复", "两次合格复验间隔 " + Math.round(gap / 3600000) + " 小时，湿度均低于 65% 且外观正常，恢复试磨");
  return { recovered: true, ticket, message: "两次复验合格，恢复试磨" };
}

// 改库位：该锭所有未失效单结论作废，旧单保留可查
export function changeStorage(db, item, nextStorage, at) {
  const old = String(item.storage || "");
  const next = String(nextStorage || "").trim();
  if (!next || next === old) return false;
  item.storage = next;
  const actives = db.inspections.filter(
    (t) => t.itemCode === item.code && t.state !== "已失效"
  );
  actives.forEach((t) => markInvalid(t, "库位变更：" + old + " → " + next, at));
  if (actives.length) {
    logOn(item, at, "库位变更", "库位由「" + old + "」改为「" + next + "」，原巡检结论失效，需重新巡检");
  }
  if (item.status === "隔离") item.status = "待试磨";
  return true;
}

// 改巡检值（温度/湿度/外观）：原结论立即失效，旧单保留可查
export function editTicketValues(db, ticket, item, patch, at) {
  if (ticket.state === "已失效") {
    throw new DomainError("已失效单据不可修改，可重新登记巡检单", 409, "ticket_invalid");
  }
  const next = {
    temperature:
      patch.temperature !== undefined && patch.temperature !== ""
        ? toNumber(patch.temperature, "温度")
        : ticket.temperature,
    humidity:
      patch.humidity !== undefined && patch.humidity !== ""
        ? toNumber(patch.humidity, "湿度")
        : ticket.humidity,
    appearance:
      patch.appearance !== undefined && String(patch.appearance).trim()
        ? String(patch.appearance).trim()
        : ticket.appearance,
  };
  if (!Number.isFinite(next.humidity) || !next.appearance) {
    throw new DomainError("巡检值不完整");
  }
  const changed = ["temperature", "humidity", "appearance"].some(
    (k) => String(next[k]) !== String(ticket[k])
  );
  Object.assign(ticket, next);
  if (patch.note) ticket.note = String(patch.note);
  if (changed) {
    markInvalid(ticket, "巡检值修改", at);
    logOn(item, at, "巡检单失效", ticket.id + " 巡检值被修改，原结论失效，需重新巡检");
    if (item.status === "隔离") item.status = "待试磨";
  }
  return changed;
}
