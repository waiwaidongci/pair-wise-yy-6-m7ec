import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./storage.js";
import { page } from "./page.js";
import { allowsGrinding, NORMAL, PENDING } from "./inspection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "data", "ink-stick-testing.json");
const port = Number(process.env.PORT || 3037);
const seed = {
  "items": [
    {
      "code": "IS-001",
      "smokeSource": "黄山松烟",
      "glueRatio": "7.5%",
      "ageYears": 8,
      "storage": "恒湿柜B",
      "status": "已试磨",
      "logs": [
        { "at": "2026-06-11", "step": "试磨", "note": "宣纸20滴水，出墨快，评分86", "score": 86 }
      ]
    },
    {
      "code": "IS-002",
      "smokeSource": "桐油烟",
      "glueRatio": "8%",
      "ageYears": 3,
      "storage": "试样盒C",
      "status": "待试磨",
      "logs": []
    }
  ],
  "inspections": []
};
const stages = ["待试磨", "已试磨", "重点观察", "已隔离"];
const statLabels = ["待试磨", "已试磨", "重点观察", "已隔离"];

const store = createStore(dbPath, seed);

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
function newId() { return "IS-" + Date.now(); }
function computeStats(items) {
  const stats = Object.fromEntries(statLabels.map(label => [label, 0]));
  for (const item of items) if (stats[item.status] !== undefined) stats[item.status] += 1;
  return stats;
}
function summarize(store, db, item) {
  const id = item.id || item.code;
  const logCount = (item.logs || []).length;
  const active = store.activeFor(db, id);
  return { ...item, logCount, inspectionStatus: active ? active.status : null, inspectionId: active ? active.id : null };
}
// 巡检结论驱动墨锭隔离/恢复状态
function syncItemStatus(item, form) {
  if (form) {
    if (form.status === PENDING) item.status = "已隔离";
    else if (form.status === NORMAL && item.status === "已隔离") item.status = "待试磨";
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await store.load();
    const now = new Date();

    if (req.method === "GET" && url.pathname === "/") return html(res, page());

    if (req.method === "GET" && url.pathname === "/api/items")
      return send(res, 200, db.items.map(it => summarize(store, db, it)));

    // 建档：同时登记入库环境巡检单，按外观自动判定隔离
    if (req.method === "POST" && url.pathname === "/api/items") {
      const input = await body(req);
      const item = {
        id: newId(),
        code: input.code,
        smokeSource: input.smokeSource,
        glueRatio: input.glueRatio,
        ageYears: input.ageYears,
        storage: input.storage,
        status: input.status || "待试磨",
        logs: [{ at: now.toISOString(), step: "建档", note: "创建墨锭" }]
      };
      db.items.unshift(item);
      const form = store.createInspection(db, item, input, now);
      syncItemStatus(item, form);
      item.logs.push({ at: now.toISOString(), step: "巡检", note: "入库巡检：" + form.status });
      await store.save(db);
      return send(res, 201, summarize(store, db, item));
    }

    const patch = url.pathname.match(/^\/api\/items\/([^/]+)$/);
    if (patch && req.method === "PATCH") {
      const item = store.findItem(db, patch[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      // 状态可改；库位不允许在普通更新里直接改，必须走移库接口
      if (input.status && stages.includes(input.status)) item.status = input.status;
      item.logs ||= [];
      item.logs.push({ at: now.toISOString(), step: "状态", note: "更新为" + item.status });
      await store.save(db);
      return send(res, 200, item);
    }

    // 改库位：原巡检结论失效，旧单仍可查，须重新巡检
    const move = url.pathname.match(/^\/api\/items\/([^/]+)\/move$/);
    if (move && req.method === "POST") {
      const item = store.findItem(db, move[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const { storage } = await body(req);
      if (!storage || !String(storage).trim()) return send(res, 400, { error: "缺少新库位" });
      const old = store.invalidateActive(db, item.id || item.code, "库位变更为「" + storage + "」，原结论失效", now);
      item.storage = String(storage).trim();
      item.logs ||= [];
      item.logs.push({ at: now.toISOString(), step: "移库", note: "库位改为" + item.storage + (old ? "，原巡检单" + old.id + "失效" : "") });
      await store.save(db);
      return send(res, 200, summarize(store, db, item));
    }

    const log = url.pathname.match(/^\/api\/items\/([^/]+)\/logs$/);
    if (log && req.method === "POST") {
      const item = store.findItem(db, log[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const input = await body(req);
      item.logs ||= [];
      item.logs.push({ at: now.toISOString(), step: input.step || "记录", note: input.note || "" });
      await store.save(db);
      return send(res, 201, item);
    }

    // 试磨：必须存在“正常”的有效巡检单，否则拒绝（隔离/待复验/未巡检都不能磨）
    const action = url.pathname.match(/^\/api\/items\/([^/]+)\/action$/);
    if (action && req.method === "POST") {
      const item = store.findItem(db, action[1]);
      if (!item) return send(res, 404, { error: "item_not_found" });
      const active = store.activeFor(db, item.id || item.code);
      if (!allowsGrinding(active))
        return send(res, 409, { error: active ? "巡检结论为" + active.status + "，恢复试磨前禁止试磨" : "缺少有效巡检单，禁止试磨" });
      const input = await body(req);
      const score = Number(input.score || 0);
      item.tests ||= [];
      item.tests.push({ at: now.toISOString(), ...input, score });
      item.status = score >= 85 ? "已试磨" : "重点观察";
      item.logs ||= [];
      item.logs.push({ at: now.toISOString(), step: "试磨", note: (input.paper || "试纸") + "，评分" + score + "（巡检单" + active.id + "正常）", score });
      await store.save(db);
      return send(res, 201, summarize(store, db, item));
    }

    // 巡检单列表，可按 正常/待复验/已失效 筛选
    if (req.method === "GET" && url.pathname === "/api/inspections") {
      const status = url.searchParams.get("status") || "";
      const q = url.searchParams.get("q") || "";
      return send(res, 200, store.listForms(db, { status, q }));
    }

    // 补登记一张巡检单（每锭只留一张未复验单，旧的未失效单被替代）
    if (req.method === "POST" && url.pathname === "/api/inspections") {
      const input = await body(req);
      const item = store.findItem(db, input.itemId);
      if (!item) return send(res, 404, { error: "item_not_found" });
      if (input.humidity === undefined || !input.appearance || !input.inspector)
        return send(res, 400, { error: "巡检单须记录温度、湿度、外观和巡检人" });
      const form = store.createInspection(db, item, { ...input, storage: input.storage ?? item.storage }, now);
      syncItemStatus(item, form);
      item.logs ||= [];
      item.logs.push({ at: now.toISOString(), step: "巡检", note: "环境巡检：" + form.status + "（库位" + form.storage + "）" });
      await store.save(db);
      return send(res, 201, form);
    }

    // 复验：换人，隔12小时两次合格才恢复
    const recheck = url.pathname.match(/^\/api\/inspections\/([^/]+)\/rechecks$/);
    if (recheck && req.method === "POST") {
      const input = await body(req);
      const result = store.addRecheck(db, recheck[1], input, now);
      if (result.error) return send(res, 400, { error: result.error });
      const item = store.findItem(db, result.form.itemId);
      syncItemStatus(item, result.form);
      item.logs ||= [];
      item.logs.push({
        at: now.toISOString(),
        step: "复验",
        note: "复验" + result.form.rechecks.length + "/2，结论" + result.form.status
      });
      await store.save(db);
      return send(res, 201, result.form);
    }

    // 更正巡检值：旧单失效留痕，另开新单重判
    const correct = url.pathname.match(/^\/api\/inspections\/([^/]+)\/correct$/);
    if (correct && req.method === "POST") {
      const input = await body(req);
      const result = store.correctInspection(db, correct[1], input, now);
      if (result.error) return send(res, 400, { error: result.error });
      const item = store.findItem(db, result.form.itemId);
      syncItemStatus(item, result.form);
      await store.save(db);
      return send(res, 201, { form: result.form, old: result.old });
    }

    if (req.method === "GET" && url.pathname === "/api/stats") return send(res, 200, computeStats(db.items));
    send(res, 404, { error: "not_found" });
  } catch (error) {
    send(res, 500, { error: error.message });
  }
});
server.listen(port, () => console.log("墨锭试磨室 listening on http://localhost:" + port));
