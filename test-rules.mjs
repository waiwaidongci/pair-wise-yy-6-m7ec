import assert from "node:assert/strict";
import {
  createItem, fileInspection, addRecheck, changeStorage, editTicketValues,
  canGrind, DomainError
} from "./lib/judgment.js";

let db = { items: [], inspections: [] };
const H = 3600 * 1000;
const t0 = new Date("2026-09-24T00:00:00Z");
const iso = (hours) => new Date(t0.getTime() + hours * H).toISOString();
const mkItem = (code, storage = "柜A") => ({
  id: code, code, smokeSource: "油烟", glueRatio: "8%", ageYears: 2,
  storage, status: "待试磨", logs: [], tests: []
});
const expectErr = (code, fn) => assert.throws(fn, (e) => e instanceof DomainError && e.code === code, "expected " + code);

// 1. 建档正常
const i1 = mkItem("IS-T1");
let r1 = createItem(db, i1, { temperature: 22, humidity: 58, appearance: "正常", inspector: "甲" }, iso(0));
assert.equal(r1.ticket.state, "正常");
assert.ok(canGrind(db, i1), "正常单可试磨");

// 2. 建档见霉点 -> 待复验隔离
const i2 = mkItem("IS-T2");
let r2 = createItem(db, i2, { temperature: 25, humidity: 71, appearance: "霉点", inspector: "甲" }, iso(0));
assert.equal(r2.ticket.state, "待复验");
assert.equal(i2.status, "隔离");
assert.equal(canGrind(db, i2), null);

// 每锭只留一张未复验单：再来一张“正常”单应被拒
expectErr("pending_exists", () =>
  fileInspection(db, i2, { humidity: 50, appearance: "正常", inspector: "乙" }, { source: "试磨前", at: iso(1) }));

// 再来一张异常单：旧单失效、只剩一张待复验
const t2b = fileInspection(db, i2, { humidity: 72, appearance: "软边", inspector: "丙" }, { source: "试磨前", at: iso(1) });
assert.equal(t2b.state, "待复验");
assert.equal(r2.ticket.state, "已失效");
assert.equal(db.inspections.filter(t => t.itemCode === "IS-T2" && t.state === "待复验").length, 1);

// 3. 复验：换人；湿度 70 不合格
expectErr("same_inspector", () =>
  addRecheck(db, t2b, i2, { humidity: 60, appearance: "正常", inspector: "丙" }, iso(2)));
let f1 = addRecheck(db, t2b, i2, { humidity: 70, appearance: "正常", inspector: "乙" }, iso(2));
assert.equal(f1.recovered, false);
assert.equal(t2b.rechecks[0].pass, false);

// 第1次合格
let f2 = addRecheck(db, t2b, i2, { humidity: 64, appearance: "正常", inspector: "乙" }, iso(3));
assert.equal(f2.recovered, false);
assert.equal(t2b.rechecks.length, 2, "不合格也留痕");

// 第2次合格但不足12小时 -> 拒
expectErr("recheck_too_soon", () =>
  addRecheck(db, t2b, i2, { humidity: 60, appearance: "正常", inspector: "丁" }, iso(4)));

// 刚好12小时后、湿度65（不低于65）-> 不通过，重新计数
let f3 = addRecheck(db, t2b, i2, { humidity: 65, appearance: "正常", inspector: "丁" }, iso(15));
assert.equal(f3.recovered, false);
assert.equal(f3.ticket.rechecks[2].pass, false);

// 新一轮：第1次合格（iso16 丁），再隔12小时第2次（iso28 戊）合格 -> 恢复
addRecheck(db, t2b, i2, { humidity: 64, appearance: "正常", inspector: "丁" }, iso(16));
let f4 = addRecheck(db, t2b, i2, { humidity: 60, appearance: "正常", inspector: "戊" }, iso(28));
assert.equal(f4.recovered, true);
assert.equal(t2b.state, "正常");
assert.equal(i2.status, "待试磨");
assert.ok(canGrind(db, i2), "复验恢复后可试磨");

// 4. 改库位 -> 正常单失效，旧单保留
assert.equal(changeStorage(db, i2, "柜B", iso(29)), true);
assert.equal(t2b.state, "已失效");
assert.equal(t2b.invalidReason.includes("柜A"), true);
assert.equal(canGrind(db, i2), null);
assert.equal(db.inspections.filter(t => t.itemCode === "IS-T2").length, 2, "旧单全部保留");

// 改回原值无操作
assert.equal(changeStorage(db, i2, "柜B", iso(29)), false);

// 5. 改巡检值 -> 原单失效
const t3 = fileInspection(db, i2, { humidity: 55, appearance: "正常", inspector: "甲" }, { source: "试磨前", at: iso(30) });
assert.equal(canGrind(db, i2).id, t3.id);
const changed = editTicketValues(db, t3, i2, { humidity: 80 }, iso(31));
assert.equal(changed, true);
assert.equal(t3.state, "已失效");
assert.equal(canGrind(db, i2), null);
// 已失效单不可改
expectErr("ticket_invalid", () => editTicketValues(db, t3, i2, { humidity: 50 }, iso(32)));

// 6. 软边隔离
const i4 = mkItem("IS-T4");
const t4 = createItem(db, i4, { humidity: 40, appearance: "软边", inspector: "甲" }, iso(0)).ticket;
assert.equal(t4.state, "待复验");
assert.equal(i4.status, "隔离");

// 改库位时隔离状态回到待试磨
changeStorage(db, i4, "柜Z", iso(1));
assert.equal(i4.status, "待试磨");

console.log("RULES_OK", { tickets: db.inspections.length });
