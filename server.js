import http from "node:http";

import {
  loadDb,
  saveDb,
  findItem,
  listTickets,
  findTicket,
  newItemId
} from "./lib/storage.js";
import { renderPage } from "./lib/page.js";
import {
  DomainError,
  createItem,
  fileInspection,
  addRecheck,
  editTicketValues,
  changeStorage,
  assertCanGrind,
  latestTicket,
  logOn
} from "./lib/judgment.js";

const port = Number(process.env.PORT || 3037);

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
function html(res, text) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(text);
}
function nowIso() {
  return new Date().toISOString();
}

function summarizeItem(db, item) {
  const t = latestTicket(db, item.code);
  const summary = {
    ...item,
    logCount: (item.logs || []).length + (item.tests || []).length,
    currentTicket: t
      ? {
          id: t.id,
          state: t.state,
          active: t.state !== "已失效",
          humidity: t.humidity,
          temperature: t.temperature,
          appearance: t.appearance,
          inspector: t.inspector,
          at: t.at,
          source: t.source,
          invalidReason: t.invalidReason || null,
          storage: t.storage,
          storageMoved: t.storage !== item.storage,
          rechecks: t.rechecks || []
        }
      : null
  };
  return summary;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();

    if (req.method === "GET" && url.pathname === "/") return html(res, renderPage());

    // ---------- 墨锭建档 / 列表 / 修改 ----------
    if (req.method === "GET" && url.pathname === "/api/items") {
      return send(res, 200, db.items.map((i) => summarizeItem(db, i)));
    }

    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const code = String(input.code || "").trim();
      if (!code) throw new DomainError("请填写墨锭编号");
      if (findItem(db, code)) throw new DomainError("编号已存在：" + code, 409, "duplicate_code");
      const item = {
        id: newItemId(),
        code,
        smokeSource: String(input.smokeSource || ""),
        glueRatio: String(input.glueRatio || ""),
        ageYears: input.ageYears === "" || input.ageYears == null ? null : Number(input.ageYears),
        storage: String(input.storage || "").trim(),
        status: "待试磨",
        logs: [],
        tests: []
      };
      if (!item.storage) throw new DomainError("建档须记库位");
      const at = nowIso();
      createItem(db, item, input, at);
      await saveDb(db);
      return send(res, 201, summarizeItem(db, item));
    }

    const itemRef = url.pathname.match(/^\/api\/items\/([^/]+)(?:\/(logs|action))?$/);
    if (itemRef && req.method === "PATCH" && !itemRef[2]) {
      const item = findItem(db, decodeURIComponent(itemRef[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const at = nowIso();

      if (input.storage !== undefined) {
        changeStorage(db, item, input.storage, at);
      }
      for (const key of ["smokeSource", "glueRatio", "status"]) {
        if (input[key] !== undefined) item[key] = String(input[key]);
      }
      if (input.ageYears !== undefined) {
        item.ageYears = input.ageYears === "" ? null : Number(input.ageYears);
      }
      if (input.status !== undefined) {
        logOn(item, at, "状态", "状态更新为 " + item.status);
      }
      await saveDb(db);
      return send(res, 200, summarizeItem(db, item));
    }

    if (itemRef && itemRef[2] === "logs" && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(itemRef[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      logOn(item, nowIso(), input.step || "备注", input.note || "");
      await saveDb(db);
      return send(res, 201, summarizeItem(db, item));
    }

    if (itemRef && itemRef[2] === "action" && req.method === "POST") {
      const item = findItem(db, decodeURIComponent(itemRef[1]));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      // 试磨放行：当前巡检单必须正常且库位未变；隔离/待复验一律挡住
      assertCanGrind(db, item);

      const score = Number(input.score || 0);
      item.tests ||= [];
      item.tests.push({ at: nowIso(), ...input, score });
      item.status = score >= 85 ? "已试磨" : "重点观察";
      logOn(item, nowIso(), "试磨", (input.paper || "试纸") + "，评分" + score, { score });
      await saveDb(db);
      return send(res, 201, summarizeItem(db, item));
    }

    // ---------- 巡检单 ----------
    if (req.method === "GET" && url.pathname === "/api/inspections") {
      let tickets = listTickets(db);
      const state = url.searchParams.get("state");
      if (state) tickets = tickets.filter((t) => t.state === state);
      const itemCode = url.searchParams.get("itemCode");
      if (itemCode) tickets = tickets.filter((t) => t.itemCode === itemCode);
      return send(res, 200, tickets);
    }

    if (req.method === "POST" && url.pathname === "/api/inspections") {
      const input = await body(req);
      const item = findItem(db, String(input.itemCode || ""));
      if (!item) return send(res, 404, { error: "item_not_found" });
      const ticket = fileInspection(db, item, input, { source: input.source || "试磨前", at: nowIso() });
      await saveDb(db);
      return send(res, 201, ticket);
    }

    const ticketRef = url.pathname.match(/^\/api\/inspections\/([^/]+)(?:\/(recheck))?$/);
    if (ticketRef && ticketRef[2] === "recheck" && req.method === "POST") {
      const ticket = findTicket(db, decodeURIComponent(ticketRef[1]));
      if (!ticket) return send(res, 404, { error: "ticket_not_found" });
      const item = findItem(db, ticket.itemCode);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      const result = addRecheck(db, ticket, item, input, nowIso());
      await saveDb(db);
      return send(res, 201, result);
    }

    if (ticketRef && !ticketRef[2] && req.method === "PATCH") {
      const ticket = findTicket(db, decodeURIComponent(ticketRef[1]));
      if (!ticket) return send(res, 404, { error: "ticket_not_found" });
      const item = findItem(db, ticket.itemCode);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      editTicketValues(db, ticket, item, input, nowIso());
      await saveDb(db);
      return send(res, 200, ticket);
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      const itemStats = { 待试磨: 0, 已试磨: 0, 重点观察: 0, 隔离: 0 };
      for (const item of db.items) {
        if (itemStats[item.status] !== undefined) itemStats[item.status] += 1;
      }
      const ticketStats = { 正常: 0, 待复验: 0, 已失效: 0 };
      for (const t of db.inspections) {
        if (ticketStats[t.state] !== undefined) ticketStats[t.state] += 1;
      }
      return send(res, 200, { items: itemStats, inspections: ticketStats });
    }

    send(res, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof DomainError) return send(res, error.status, { error: error.message, code: error.code });
    send(res, 500, { error: error.message });
  }
});

server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
