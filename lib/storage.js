// 存储业务：JSON 档案读写、巡检单与墨锭查询。只管存取，不含判定规则。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const dbPath = join(__dirname, "..", "data", "ink-stick-testing.json");

const seed = {
  items: [
    {
      code: "IS-001",
      smokeSource: "黄山松烟",
      glueRatio: "7.5%",
      ageYears: 8,
      storage: "恒湿柜B",
      status: "已试磨",
      logs: [
        { at: "2026-06-10T08:00:00.000Z", step: "建档", note: "创建墨锭，库位 恒湿柜B" },
        { at: "2026-06-10T08:00:00.000Z", step: "巡检", note: "建档巡检正常，湿度 58%，外观正常" },
        { at: "2026-06-11T09:00:00.000Z", step: "试磨", note: "宣纸20滴水，出墨快，评分86", score: 86 }
      ]
    },
    {
      code: "IS-002",
      smokeSource: "桐油烟",
      glueRatio: "8%",
      ageYears: 3,
      storage: "隔离架Q",
      status: "隔离",
      logs: [
        { at: "2026-06-20T08:00:00.000Z", step: "建档", note: "创建墨锭，库位 试样盒C" },
        { at: "2026-06-20T08:00:00.000Z", step: "巡检", note: "建档巡检正常，湿度 60%，外观正常" },
        { at: "2026-06-20T09:00:00.000Z", step: "试磨", note: "棉连纸，评分79", score: 79 },
        { at: "2026-06-22T07:30:00.000Z", step: "巡检隔离", note: "试磨前巡检见「软边」，湿度 71%，移入隔离区，暂停试磨" }
      ]
    },
    {
      code: "IS-003",
      smokeSource: "漆烟",
      glueRatio: "8.5%",
      ageYears: 12,
      storage: "恒湿柜A",
      status: "待试磨",
      logs: [
        { at: "2026-06-18T02:00:00.000Z", step: "建档", note: "创建墨锭，库位 恒湿柜A" },
        { at: "2026-06-18T02:00:00.000Z", step: "巡检", note: "建档巡检正常，湿度 62%，外观正常" },
        { at: "2026-06-21T01:00:00.000Z", step: "库位变更", note: "库位由「货架D」改为「恒湿柜A」，原巡检结论失效，需重新巡检" },
        { at: "2026-06-21T02:30:00.000Z", step: "巡检", note: "重新巡检正常，湿度 61%，外观正常" }
      ]
    }
  ],
  inspections: [
    // IS-001：当前正常单
    {
      id: "INSP-20260610080000-01",
      itemCode: "IS-001",
      source: "建档",
      storage: "恒湿柜B",
      temperature: 22,
      humidity: 58,
      appearance: "正常",
      inspector: "周师傅",
      at: "2026-06-10T08:00:00.000Z",
      state: "正常",
      rechecks: []
    },
    // IS-002：待复验，已完成第 1 次合格复验（隔离架Q）
    {
      id: "INSP-20260622073000-02",
      itemCode: "IS-002",
      source: "试磨前",
      storage: "隔离架Q",
      temperature: 25,
      humidity: 71,
      appearance: "软边",
      inspector: "周师傅",
      at: "2026-06-22T07:30:00.000Z",
      state: "待复验",
      rechecks: [
        {
          at: "2026-06-22T20:00:00.000Z",
          temperature: 24,
          humidity: 63,
          appearance: "正常",
          inspector: "吴师傅",
          pass: true
        }
      ]
    },
    // IS-003：库位变更导致的旧失效单（旧单仍可查）
    {
      id: "INSP-20260618020000-03",
      itemCode: "IS-003",
      source: "建档",
      storage: "货架D",
      temperature: 23,
      humidity: 62,
      appearance: "正常",
      inspector: "周师傅",
      at: "2026-06-18T02:00:00.000Z",
      state: "已失效",
      rechecks: [],
      invalidReason: "库位变更：货架D → 恒湿柜A",
      invalidatedAt: "2026-06-21T01:00:00.000Z"
    },
    {
      id: "INSP-20260621023000-04",
      itemCode: "IS-003",
      source: "试磨前",
      storage: "恒湿柜A",
      temperature: 22,
      humidity: 61,
      appearance: "正常",
      inspector: "吴师傅",
      at: "2026-06-21T02:30:00.000Z",
      state: "正常",
      rechecks: []
    }
  ]
};

// 旧数据补结构：无 inspections 字段时置空，巡检流程从空开始
function migrate(db) {
  db.items ||= [];
  db.inspections ||= [];
  for (const item of db.items) item.logs ||= [];
  return db;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return structuredClone(seed);
  }
  return migrate(JSON.parse(await readFile(dbPath, "utf8")));
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function findItem(db, ref) {
  return db.items.find((x) => x.id === ref || x.code === ref) || null;
}

export function listTickets(db) {
  // 新单在前
  return [...db.inspections].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

export function findTicket(db, id) {
  return db.inspections.find((t) => t.id === id) || null;
}

let itemSeq = 0;
export function newItemId() {
  itemSeq += 1;
  return "IS-NEW-" + Date.now() + "-" + itemSeq;
}
