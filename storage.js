// 巡检存储：JSON 文件持久化与巡检单集合的不变量维护
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  judgeInitial,
  applyRecheck,
  invalidate,
  NORMAL,
  PENDING,
  INVALID
} from "./inspection.js";

export function createStore(dbPath, seed) {
  async function load() {
    if (!existsSync(dbPath)) {
      await mkdir(dirname(dbPath), { recursive: true });
      await writeFile(dbPath, JSON.stringify(seed, null, 2));
    }
    const db = JSON.parse(await readFile(dbPath, "utf8"));
    db.inspections ||= [];
    return db;
  }
  async function save(db) {
    await writeFile(dbPath, JSON.stringify(db, null, 2));
  }

  function findItem(db, id) {
    return db.items.find(x => x.id === id || x.code === id);
  }

  // 该墨锭当前未失效（正常/待复验）的巡检单
  function activeFor(db, itemId) {
    return db.inspections
      .filter(f => f.itemId === itemId && f.status !== INVALID)
      .sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;
  }

  // 每锭只留一张未复验单：新单登记前，旧的未失效单一律失效
  function supersede(db, itemId, reason, now) {
    for (const form of db.inspections) {
      if (form.itemId === itemId && form.status !== INVALID) {
        Object.assign(form, invalidate(form, reason, now));
      }
    }
  }

  // 登记初次巡检单（建档案时带巡检，或事后补巡检都走这里）
  function createInspection(db, item, input, now = new Date()) {
    const itemId = item.id || item.code; // 统一挂到墨锭真实主键
    supersede(db, itemId, "新巡检单替代原结论", now);
    const form = {
      id: "INSP-" + now.getTime() + "-" + Math.floor(Math.random() * 1e4),
      itemId,
      itemCode: item.code,
      storage: input.storage ?? item.storage ?? "", // 巡检时快照库位
      temperature: input.temperature === undefined ? "" : Number(input.temperature),
      humidity: input.humidity === undefined ? "" : Number(input.humidity),
      appearance: input.appearance || "",
      inspector: String(input.inspector || "").trim(),
      at: now.toISOString(),
      status: judgeInitial(input),
      rechecks: [],
      failedRechecks: []
    };
    db.inspections.push(form);
    return form;
  }

  // 提交一次复验
  function addRecheck(db, formId, input, now = new Date()) {
    const form = db.inspections.find(f => f.id === formId);
    if (!form) return { error: "巡检单不存在" };
    const result = applyRecheck(form, input, now);
    if (result.error) return { error: result.error };
    Object.assign(form, result.form);
    return { form };
  }

  // 改库位或改巡检值会让原结论失效
  function invalidateActive(db, itemId, reason, now = new Date()) {
    const active = activeFor(db, itemId);
    if (active) Object.assign(active, invalidate(active, reason, now));
    return active;
  }

  // 改正巡检值：旧单失效并留痕，另开一张新单重新判定
  function correctInspection(db, formId, input, now = new Date()) {
    const old = db.inspections.find(f => f.id === formId);
    if (!old) return { error: "巡检单不存在" };
    const item = findItem(db, old.itemId);
    if (!item) return { error: "墨锭不存在" };
    Object.assign(old, invalidate(old, "巡检值更正，原结论失效", now));
    const form = createInspection(db, item, { ...input, storage: old.storage }, now);
    return { form, old };
  }

  function listForms(db, { status, q } = {}) {
    let forms = [...db.inspections].sort((a, b) => new Date(b.at) - new Date(a.at));
    if (status) forms = forms.filter(f => f.status === status);
    if (q) forms = forms.filter(f => JSON.stringify(f).includes(q));
    return forms;
  }

  return {
    load, save, findItem, activeFor, createInspection, addRecheck,
    invalidateActive, correctInspection, listForms
  };
}

export { NORMAL, PENDING, INVALID };
