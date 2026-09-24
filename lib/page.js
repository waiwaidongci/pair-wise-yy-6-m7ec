// 页面业务：墨锭建档/巡检/复验/试磨录入界面与巡检单列表筛选。
// 只产出 HTML，不持有数据；数据全部来自 /api。

const fields = [
  ["code", "墨锭编号", "text"],
  ["smokeSource", "烟料来源", "text"],
  ["glueRatio", "胶料比例", "text"],
  ["ageYears", "存放年限", "number"],
  ["storage", "库位", "text"]
];
const stages = ["待试磨", "已试磨", "重点观察", "隔离"];
const ticketStates = ["正常", "待复验", "已失效"];
const appearances = ["正常", "霉点", "软边"];
const extraFields = [
  ["paper", "试磨纸张"],
  ["water", "加水量"],
  ["speed", "出墨速度"],
  ["colorLayer", "墨色层次"],
  ["sediment", "沉淀情况"],
  ["score", "评分"]
];

export function renderPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室 · 环境巡检</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --hold:#8a6d1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:17px; } h3 { margin:0; }
    main { display:grid; grid-template-columns:390px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    form { margin-bottom:14px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:68px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; margin-top:12px; } button.secondary { background:#69736a; } button.danger { background:var(--warn); }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:22px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; align-items:center; } .toolbar select,.toolbar input { width:auto; min-width:150px; }
    .tabs { display:flex; gap:6px; margin-bottom:12px; } .tabs button { background:#e3e8df; color:var(--ink); margin:0; } .tabs button.active { background:var(--accent); color:#fff; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(290px,1fr)); gap:12px; } .card { display:grid; gap:6px; align-content:start; }
    .meta { color:var(--muted); font-size:13px; } .warn { color:var(--warn); font-weight:700; } .hold { color:var(--hold); font-weight:700; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 9px; font-size:12px; margin-right:6px; }
    .pill.normal { background:#eef4e9; color:var(--accent); border-color:#bccdb0; }
    .pill.pending { background:#f7efdc; color:var(--hold); border-color:#ddc98e; }
    .pill.invalid { background:#e7e9e6; color:var(--muted); }
    .pill.isolated { background:#f6e5e0; color:var(--warn); border-color:#d8aca1; }
    .logs { border-top:1px solid var(--line); padding-top:8px; margin-top:6px; max-height:110px; overflow:auto; }
    .rechecks { border-top:1px dashed var(--line); padding-top:8px; margin-top:6px; display:grid; gap:4px; }
    #msg { display:none; margin:0 0 12px; padding:10px 14px; border-radius:6px; font-size:14px; } #msg.ok { display:block; background:#eef4e9; color:var(--accent); } #msg.err { display:block; background:#f6e5e0; color:var(--warn); }
    .hint { font-size:12px; color:var(--muted); margin-top:8px; line-height:1.6; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .row label { margin-top:6px; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>墨锭试磨室 · 环境巡检</h1><div class="meta">建档/试磨前巡检：库位、温度、湿度、外观；霉点软边即隔离，复验换人、隔 12 小时两次合格才恢复</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <section>
      <form id="createForm">
        <h2>建档（含首次巡检）</h2>
        <div id="fields"></div>
        <div class="row">
          <div><label>温度 ℃</label><input name="temperature" type="number" step="0.1" placeholder="如 22"></div>
          <div><label>湿度 %</label><input name="humidity" type="number" step="0.1" required placeholder="如 58"></div>
        </div>
        <label>外观</label><select name="appearance">${appearances.map((a) => "<option>" + a + "</option>").join("")}</select>
        <label>巡检人</label><input name="inspector" required placeholder="建档即记首次巡检">
        <button>建档并巡检</button>
      </form>

      <form id="inspectForm">
        <h2>试磨前巡检</h2>
        <label>墨锭</label><select name="itemCode" id="inspectSelect"></select>
        <div class="row">
          <div><label>温度 ℃</label><input name="temperature" type="number" step="0.1"></div>
          <div><label>湿度 %</label><input name="humidity" type="number" step="0.1" required></div>
        </div>
        <label>外观</label><select name="appearance">${appearances.map((a) => "<option>" + a + "</option>").join("")}</select>
        <label>巡检人</label><input name="inspector" required>
        <button>登记巡检单</button>
        <div class="hint">见霉点或软边自动隔离。每锭只留一张未复验单：新单仍异常则旧单失效；隔离中不能用一张“正常”新单替代复验。</div>
      </form>

      <form id="recheckForm">
        <h2>复验登记</h2>
        <label>待复验单</label><select name="ticketId" id="recheckSelect"></select>
        <div class="row">
          <div><label>温度 ℃</label><input name="temperature" type="number" step="0.1"></div>
          <div><label>湿度 %</label><input name="humidity" type="number" step="0.1" required></div>
        </div>
        <label>外观</label><select name="appearance">${appearances.map((a) => "<option>" + a + "</option>").join("")}</select>
        <label>复验人（须与原巡检人不同）</label><input name="inspector" required>
        <button class="danger">提交复验</button>
        <div class="hint">两次合格复验须隔满 12 小时，且两次湿度均低于 65%、外观正常，方可恢复试磨；中途不合格重新计数。</div>
      </form>

      <form id="grindForm">
        <h2>创建试磨记录</h2>
        <label>墨锭（隔离/无有效正常巡检单者不可试磨）</label><select name="id" id="grindSelect"></select>
        <div id="extraFields"></div>
        <button>提交试磨</button>
      </form>
    </section>

    <section>
      <div id="msg"></div>
      <div class="stats" id="stats"></div>
      <div class="tabs">
        <button id="tabItems" class="active">墨锭</button>
        <button id="tabTickets">巡检单</button>
      </div>
      <div class="toolbar">
        <select id="statusFilter"></select>
        <input id="search" placeholder="搜索编号 / 库位 / 巡检人">
      </div>
      <div class="panel">
        <div class="grid" id="cards"></div>
      </div>
    </section>
  </main>
  <script>
    const fields = ${JSON.stringify(fields)};
    const stages = ${JSON.stringify(stages)};
    const ticketStates = ${JSON.stringify(ticketStates)};
    const appearances = ${JSON.stringify(appearances)};
    const extraFields = ${JSON.stringify(extraFields)};

    let items = [], tickets = [], tab = "items";
    const $ = (sel) => document.querySelector(sel);
    const createForm = $("#createForm"), inspectForm = $("#inspectForm"), recheckForm = $("#recheckForm"), grindForm = $("#grindForm");
    const cards = $("#cards"), statsEl = $("#stats"), msg = $("#msg");

    function esc(v) {
      return String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
    }
    function fmt(at) {
      const d = new Date(at);
      return isNaN(d) ? esc(at) : d.toLocaleString("zh-CN", { hour12:false });
    }
    function flash(text, ok) {
      msg.textContent = text;
      msg.className = ok ? "ok" : "err";
    }
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers: { "Content-Type": "application/json" } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    function stateClass(s) {
      return s === "正常" ? "normal" : s === "待复验" ? "pending" : "invalid";
    }
    function byCode(code) { return items.find(i => i.code === code); }

    function renderForms() {
      $("#fields").innerHTML = fields.map(([key,label,type]) =>
        '<label>'+label+'</label><input name="'+key+'" type="'+(type||"text")+'" '+(key==="code"?"required":"")+'>'
      ).join("");
      $("#extraFields").innerHTML = extraFields.map(([key,label]) =>
        '<label>'+label+'</label><input name="'+key+'">'
      ).join("");
    }

    function renderSelects() {
      $("#inspectSelect").innerHTML = items.map(i => '<option value="'+esc(i.code)+'">'+esc(i.code)+' · '+esc(i.storage)+'</option>').join("");
      const pending = tickets.filter(t => t.state === "待复验");
      $("#recheckSelect").innerHTML = pending.length
        ? pending.map(t => '<option value="'+esc(t.id)+'">'+esc(t.itemCode)+' · '+esc(t.id)+'（原巡检 '+esc(t.inspector)+'，已复验 '+t.rechecks.length+' 次）</option>').join("")
        : '<option value="">暂无待复验单</option>';

      $("#grindSelect").innerHTML = items.map(i => {
        const t = i.currentTicket;
        let reason = "";
        if (i.status === "隔离" || (t && t.state === "待复验")) reason = "隔离待复验";
        else if (!t) reason = "无有效巡检单";
        else if (t.storageMoved) reason = "库位已变，原单失效";
        else if (t.state !== "正常") reason = "无正常巡检单";
        return '<option value="'+esc(i.code)+'" '+(reason?"disabled":"")+'>'+esc(i.code)+(reason ? "（"+reason+"，不可试磨）" : " · 可试磨")+'</option>';
      }).join("");
    }

    function render() {
      renderSelects();
      $("#tabItems").className = tab === "items" ? "active" : "";
      $("#tabTickets").className = tab === "tickets" ? "active" : "";
      $("#statusFilter").innerHTML = tab === "items"
        ? '<option value="">全部状态</option>' + stages.map(s => '<option>'+s+'</option>').join("")
        : '<option value="">全部结论</option>' + ticketStates.map(s => '<option>'+s+'</option>').join("");
      if (tab === "items") renderStats();
      else renderTicketStats();
      cards.innerHTML = tab === "items" ? renderItemCards() : renderTicketCards();
      bindCardActions();
    }

    function renderStats() {
      const stats = Object.fromEntries(stages.map(s => [s, 0]));
      items.forEach(i => { if (stats[i.status] !== undefined) stats[i.status]++; });
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) =>
        '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>'
      ).join("");
    }
    function renderTicketStats() {
      const stats = Object.fromEntries(ticketStates.map(s => [s, 0]));
      tickets.forEach(t => { if (stats[t.state] !== undefined) stats[t.state]++; });
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) =>
        '<div class="stat"><span>巡检单·'+k+'</span><strong>'+v+'</strong></div>'
      ).join("");
    }

    function ticketSummary(i) {
      const t = i.currentTicket;
      if (!t) return '<div class="meta">巡检：<span class="warn">未巡检（不可试磨）</span></div>';
      const cls = stateClass(t.state);
      const moved = t.storageMoved ? ' <span class="warn">库位已变更，原单失效</span>' : "";
      const invalidNote = (!t.active && !t.storageMoved && t.invalidReason) ? ' <span class="warn">'+esc(t.invalidReason)+'</span>' : "";
      const ab = (t.appearance !== "正常") ? ' <span class="warn">外观：'+esc(t.appearance)+'</span>' : "";
      return '<div class="meta">巡检：<span class="pill '+cls+'">'+t.state+'</span> 湿度 '+esc(t.humidity)+'% · '+ab+moved+invalidNote+'</div>';
    }

    function renderItemCards() {
      const status = $("#statusFilter").value;
      const q = $("#search").value.trim();
      const visible = items.filter(i =>
        (!status || i.status === status) &&
        (!q || (i.code+" "+i.storage+" "+i.smokeSource+" "+JSON.stringify(i)).includes(q))
      );
      return visible.map(i => {
        const main = fields.map(([key,label]) => '<div class="meta"><b>'+label+'</b> '+esc(i[key])+'</div>').join("");
        const isolated = i.status === "隔离" ? ' <span class="pill isolated">隔离中</span>' : "";
        const logs = (i.logs || []).slice(-5).map(l =>
          '<div>'+fmt(l.at)+' '+esc(l.step)+'：'+esc(l.note)+'</div>'
        ).join("");
        return '<article class="card">'
          + '<h3>'+esc(i.code)+'</h3>'
          + '<div><span class="pill '+(i.status==="隔离"?"isolated":"")+'">'+esc(i.status)+'</span>'+isolated+'</div>'
          + ticketSummary(i) + main
          + '<label>状态</label><select data-status="'+esc(i.code)+'">'
          + stages.map(s => '<option '+(s===i.status?"selected":"")+'>'+s+'</option>').join("")
          + '</select>'
          + '<div><button class="secondary" data-storage="'+esc(i.code)+'">改库位</button>'
          + '<button class="secondary" data-note="'+esc(i.code)+'">追加备注</button></div>'
          + '<div class="logs meta">'+(logs || "暂无记录")+'</div>'
          + '</article>';
      }).join("") || '<div class="meta">没有匹配的墨锭</div>';
    }

    function renderTicketCards() {
      const status = $("#statusFilter").value;
      const q = $("#search").value.trim();
      const visible = tickets.filter(t =>
        (!status || t.state === status) &&
        (!q || (t.id+" "+t.itemCode+" "+t.storage+" "+t.inspector+" "+t.appearance).includes(q))
      );
      return visible.map(t => {
        const item = byCode(t.itemCode);
        const moved = item && item.storage !== t.storage;
        const abNormal = t.appearance !== "正常";
        const rechecks = (t.rechecks || []).map((r, idx) =>
          '<div class="'+(r.pass?"":"warn")+'">第'+(idx+1)+'次复验 '+fmt(r.at)+' · '+esc(r.inspector)
          + ' · 湿度 '+esc(r.humidity)+'% · '+esc(r.appearance)+(r.pass ? " ✓合格" : " ✗不合格")+'</div>'
        ).join("");
        return '<article class="card">'
          + '<h3>'+esc(t.itemCode)+' <span class="meta">'+esc(t.id)+'</span></h3>'
          + '<div><span class="pill '+stateClass(t.state)+'">'+t.state+'</span>'
          + '<span class="pill">'+esc(t.source)+'巡检</span></div>'
          + '<div class="meta">单记库位：'+esc(t.storage)+(moved ? ' <span class="warn">（当前库位已改为 '+esc(item.storage)+'）</span>' : "")+'</div>'
          + '<div class="meta">温度 '+esc(t.temperature ?? "—")+'℃ · 湿度 <span class="'+(t.humidity>=65?"warn":"")+'">'+esc(t.humidity)+'%</span></div>'
          + '<div class="meta">外观：<span class="'+(abNormal?"warn":"")+'">'+esc(t.appearance)+'</span></div>'
          + '<div class="meta">巡检人 '+esc(t.inspector)+' · '+fmt(t.at)+'</div>'
          + (t.invalidReason ? '<div class="warn">失效原因：'+esc(t.invalidReason)+'<br><span class="meta">'+fmt(t.invalidatedAt)+'（旧单仍可查）</span></div>' : "")
          + (rechecks ? '<div class="rechecks">'+rechecks+'</div>' : "")
          + (t.state !== "已失效"
              ? '<button class="secondary" data-edit-ticket="'+esc(t.id)+'">修改巡检值</button>'
              : '<div class="hint">已失效单据只读；改值/改库位后旧单保留备查。</div>')
          + '</article>';
      }).join("") || '<div class="meta">没有匹配的巡检单</div>';
    }

    function bindCardActions() {
      document.querySelectorAll("[data-status]").forEach(sel => sel.onchange = async () => {
        try { await api("/api/items/"+encodeURIComponent(sel.dataset.status), { method:"PATCH", body: JSON.stringify({ status: sel.value }) }); await load(); flash("状态已更新", true); }
        catch (e) { flash(e.message); await load(); }
      });
      document.querySelectorAll("[data-note]").forEach(btn => btn.onclick = async () => {
        const note = prompt("记录备注");
        if (!note) return;
        try { await api("/api/items/"+encodeURIComponent(btn.dataset.note)+"/logs", { method:"POST", body: JSON.stringify({ step:"备注", note }) }); await load(); }
        catch (e) { flash(e.message); }
      });
      document.querySelectorAll("[data-storage]").forEach(btn => btn.onclick = async () => {
        const next = prompt("新库位（修改后该锭现有巡检结论立即失效，旧单仍可查）");
        if (!next) return;
        if (!confirm("确认改库位为「"+next+"」？需重新巡检后方可试磨。")) return;
        try { await api("/api/items/"+encodeURIComponent(btn.dataset.storage), { method:"PATCH", body: JSON.stringify({ storage: next }) }); await load(); flash("库位已变更，原巡检结论失效", true); }
        catch (e) { flash(e.message); await load(); }
      });
      document.querySelectorAll("[data-edit-ticket]").forEach(btn => btn.onclick = async () => {
        const t = tickets.find(x => x.id === btn.dataset.editTicket);
        const temperature = prompt("温度 ℃（取消则不改）", t.temperature ?? "");
        if (temperature === null) return;
        const humidity = prompt("湿度 %", t.humidity);
        if (humidity === null) return;
        const appearance = prompt("外观：正常 / 霉点 / 软边", t.appearance);
        if (appearance === null) return;
        if (!confirm("修改巡检值会使该单结论立即失效（旧单保留可查），确认？")) return;
        try { await api("/api/inspections/"+encodeURIComponent(t.id), { method:"PATCH", body: JSON.stringify({ temperature, humidity, appearance }) }); await load(); flash("巡检值已修改，原结论失效", true); }
        catch (e) { flash(e.message); await load(); }
      });
    }

    async function load() {
      const [it, tk] = await Promise.all([api("/api/items"), api("/api/inspections")]);
      items = it; tickets = tk; render();
    }

    createForm.onsubmit = async ev => {
      ev.preventDefault();
      try {
        await api("/api/items", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) });
        createForm.reset(); await load(); flash("建档完成，首次巡检单已登记", true);
      } catch (e) { flash(e.message); }
    };
    inspectForm.onsubmit = async ev => {
      ev.preventDefault();
      try {
        await api("/api/inspections", { method:"POST", body: JSON.stringify(Object.fromEntries(new FormData(inspectForm).entries())) });
        inspectForm.reset(); await load(); flash("巡检单已登记", true);
      } catch (e) { flash(e.message); }
    };
    recheckForm.onsubmit = async ev => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(recheckForm).entries());
      if (!data.ticketId) return flash("暂无待复验单");
      try {
        const r = await api("/api/inspections/"+encodeURIComponent(data.ticketId)+"/recheck", { method:"POST", body: JSON.stringify(data) });
        recheckForm.reset(); await load(); flash(r.message || "复验已记录", true);
      } catch (e) { flash(e.message); }
    };
    grindForm.onsubmit = async ev => {
      ev.preventDefault();
      const data = Object.fromEntries(new FormData(grindForm).entries());
      try {
        await api("/api/items/"+encodeURIComponent(data.id)+"/action", { method:"POST", body: JSON.stringify(data) });
        grindForm.reset(); await load(); flash("试磨记录已提交", true);
      } catch (e) { flash(e.message); }
    };

    $("#statusFilter").onchange = render;
    $("#search").oninput = render;
    $("#reload").onclick = () => load();
    $("#tabItems").onclick = () => { tab = "items"; $("#search").value = ""; render(); };
    $("#tabTickets").onclick = () => { tab = "tickets"; $("#search").value = ""; render(); };

    renderForms();
    load().catch(e => flash(e.message));
  </script>
</body>
</html>`;
}
