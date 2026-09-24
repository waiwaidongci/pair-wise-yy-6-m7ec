// 页面渲染：墨锭建档/试磨 + 环境巡检的交互页面
import { STATUSES, NORMAL, PENDING } from "./inspection.js";

const fields = [["code","墨锭编号","text"],["smokeSource","烟料来源","text"],["glueRatio","胶料比例","text"],["ageYears","存放年限","number"],["storage","存放位置","text"]];
const stages = ["待试磨","已试磨","重点观察","已隔离"];
const extraFields = [["paper","试磨纸张"],["water","加水量"],["speed","出墨速度"],["colorLayer","墨色层次"],["sediment","沉淀情况"],["score","评分"]];

export function page() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>墨锭试磨室</title>
  <style>
    :root { --bg:#f1f3ef; --panel:#fff; --ink:#20241f; --muted:#687066; --line:#d4ddd0; --accent:#526f43; --warn:#9b4937; --hold:#9a6a1f; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } h2 { margin:0 0 12px; font-size:18px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.stat { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select,textarea { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; background:#fff; } textarea { min-height:56px; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:10px 13px; font-weight:700; cursor:pointer; } button.secondary { background:#69736a; } button:disabled { background:#b3bbb4; cursor:not-allowed; }
    .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-bottom:14px; } .stat strong { display:block; font-size:24px; }
    .toolbar { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; } .toolbar select,.toolbar input { width:auto; min-width:160px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; } .card { display:grid; gap:8px; }
    .meta { color:var(--muted); font-size:13px; } .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .pill.normal { color:var(--accent); border-color:var(--accent); } .pill.pending { color:var(--hold); border-color:var(--hold); } .pill.invalid { color:var(--warn); border-color:var(--warn); }
    .logs { border-top:1px solid var(--line); padding-top:8px; max-height:90px; overflow:auto; } .warn { color:var(--warn); font-weight:700; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; } .row > * { flex:1; }
    .recheck { border-top:1px dashed var(--line); padding-top:8px; margin-top:4px; }
    @media (max-width:900px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header><div><h1>墨锭试磨室</h1><div class="meta">墨锭建档、环境巡检、复验与试磨记录</div></div><button id="reload">刷新</button></header>
  <main>
    <section>
      <form id="createForm"><h2>新增墨锭建档</h2><div id="fields"></div>
        <h2 style="margin-top:14px">入库环境巡检单</h2>
        <div class="row"><div><label>温度 ℃</label><input name="temperature" type="number" step="0.1" required></div><div><label>湿度 %</label><input name="humidity" type="number" step="0.1" required></div></div>
        <label>外观（见霉点或软边即隔离）</label><input name="appearance" placeholder="如：正常 / 有霉点 / 边缘发软" required>
        <label>巡检人</label><input name="inspector" required>
        <label>初始状态</label><select name="status">${stages.map(s => '<option>'+s+'</option>').join('')}</select>
        <button style="margin-top:12px">建档并巡检</button>
      </form>
      <form id="actionForm" style="margin-top:14px"><h2>创建试磨记录</h2><label>选择墨锭</label><select name="id" id="itemSelect"></select><div id="grindGate" class="meta"></div><div id="extraFields"></div><button id="grindBtn">提交记录</button></form>
    </section>
    <section>
      <div class="stats" id="stats"></div>
      <div class="toolbar"><select id="statusFilter"><option value="">全部状态</option>${stages.map(s => '<option>'+s+'</option>').join('')}</select><input id="search" placeholder="搜索编号或关键词"></div>
      <div class="panel"><h2>墨锭档案</h2><div class="grid" id="cards"></div></div>

      <div class="panel" style="margin-top:18px">
        <h2>环境巡检单</h2>
        <div class="toolbar">
          <select id="inspFilter"><option value="">全部结论</option>${STATUSES.map(s => '<option>'+s+'</option>').join('')}</select>
          <input id="inspSearch" placeholder="搜索墨锭/库位/巡检人">
          <button type="button" class="secondary" id="newInspToggle">补一张巡检单</button>
        </div>
        <form id="inspForm" style="display:none;border-top:1px solid var(--line);padding-top:10px">
          <label>墨锭</label><select name="itemId" id="inspItemSelect"></select>
          <div class="row"><div><label>温度 ℃</label><input name="temperature" type="number" step="0.1" required></div><div><label>湿度 %</label><input name="humidity" type="number" step="0.1" required></div></div>
          <label>外观</label><input name="appearance" required>
          <label>巡检人</label><input name="inspector" required>
          <button style="margin-top:10px">登记巡检</button>
        </form>
        <div class="grid" id="inspCards" style="margin-top:12px"></div>
      </div>
    </section>
  </main>
  <script>
    const fields = ${JSON.stringify(fields)};
    const stages = ${JSON.stringify(stages)};
    const extraFields = ${JSON.stringify(extraFields)};
    const inspStatuses = ${JSON.stringify(STATUSES)};
    const createForm = document.querySelector('#createForm');
    const actionForm = document.querySelector('#actionForm');
    const cards = document.querySelector('#cards');
    const inspCards = document.querySelector('#inspCards');
    const statsEl = document.querySelector('#stats');
    const itemSelect = document.querySelector('#itemSelect');
    const inspItemSelect = document.querySelector('#inspItemSelect');
    let items = [], forms = [];
    async function api(path, options) {
      const res = await fetch(path, options && options.body ? { ...options, headers:{ 'Content-Type':'application/json' } } : options);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    function renderForms() {
      document.querySelector('#fields').innerHTML = fields.map(([key,label,type]) => '<label>'+label+'</label><input name="'+key+'" type="'+type+'" '+(key==='code'?'required':'')+'>').join('');
      document.querySelector('#extraFields').innerHTML = extraFields.map(([key,label]) => '<label>'+label+'</label><input name="'+key+'">').join('');
    }
    function activeFormOf(itemId) {
      return forms.find(f => (f.itemId === itemId) && f.status !== '已失效') || null;
    }
    function render() {
      itemSelect.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+item.code+' · '+(item.smokeSource||'')+'</option>').join('');
      inspItemSelect.innerHTML = items.map(item => '<option value="'+(item.id || item.code)+'">'+item.code+' · '+(item.storage||'')+'</option>').join('');
      const stats = Object.fromEntries(stages.map(s => [s, items.filter(i => i.status === s).length]));
      statsEl.innerHTML = Object.entries(stats).map(([k,v]) => '<div class="stat"><span>'+k+'</span><strong>'+v+'</strong></div>').join('');
      const status = document.querySelector('#statusFilter').value;
      const q = document.querySelector('#search').value.trim();
      const visible = items.filter(item => (!status || item.status === status) && (!q || JSON.stringify(item).includes(q)));
      cards.innerHTML = visible.map(item => cardHtml(item)).join('');

      const istatus = document.querySelector('#inspFilter').value;
      const iq = document.querySelector('#inspSearch').value.trim();
      const ivisible = forms.filter(f => (!istatus || f.status === istatus) && (!iq || JSON.stringify(f).includes(iq)));
      inspCards.innerHTML = ivisible.map(f => inspCardHtml(f)).join('') || '<div class="meta">暂无巡检单</div>';

      bindCardEvents();
      updateGrindGate();
    }
    function updateGrindGate() {
      const id = itemSelect.value; const gate = document.querySelector('#grindGate'); const btn = document.querySelector('#grindBtn');
      const f = activeFormOf(id);
      if (f && f.status === '${NORMAL}') { gate.textContent = '巡检结论正常，可试磨（库位 '+f.storage+'，湿度 '+f.humidity+'%）'; gate.className='meta'; btn.disabled=false; }
      else if (f && f.status === '${PENDING}') { gate.textContent = '隔离待复验中，未恢复前禁止试磨'; gate.className='meta warn'; btn.disabled=true; }
      else { gate.textContent = '缺少有效的正常巡检单，请先巡检，禁止试磨'; gate.className='meta warn'; btn.disabled=true; }
    }
    function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function cardHtml(item) {
      const id = item.id || item.code;
      const f = activeFormOf(id);
      const main = fields.slice(0,4).map(([key,label]) => '<div><b>'+label+'</b> '+esc(item[key])+'</div>').join('');
      const env = f
        ? '<div class="pill '+(f.status==='${NORMAL}'?'normal':f.status==='${PENDING}'?'pending':'invalid')+'">巡检：'+f.status+'</div><div class="meta">'+esc(f.storage)+' · '+f.temperature+'℃ · '+f.humidity+'% · '+esc(f.appearance)+'</div>'
        : '<div class="pill invalid">未巡检</div>';
      const move = '<label>改库位（原巡检结论失效）</label><div class="row"><input data-move="'+id+'" placeholder="新库位"><button type="button" class="secondary" data-movebtn="'+id+'">移库</button></div>';
      return '<article class="card"><h3>'+esc(item.code)+'</h3><span class="pill">'+esc(item.status)+'</span>'+main+env+move+'<label>状态</label><select data-status="'+id+'">'+stages.map(s => '<option '+(s===item.status?'selected':'')+'>'+s+'</option>').join('')+'</select><button class="secondary" data-note="'+id+'">追加备注</button></article>';
    }
    function inspCardHtml(f) {
      const cls = f.status==='${NORMAL}'?'normal':f.status==='${PENDING}'?'pending':'invalid';
      const passes = (f.rechecks||[]).map((r,i)=>'<div class="meta">复验'+(i+1)+'：'+(r.at||'').slice(0,16)+' · '+r.humidity+'% · '+esc(r.appearance)+' · '+esc(r.inspector)+'</div>').join('');
      const fails = (f.failedRechecks||[]).map(r=>'<div class="meta warn">复验未过：'+(r.at||'').slice(0,16)+' · '+r.humidity+'% · '+esc(r.appearance)+' · '+esc(r.inspector)+'</div>').join('');
      const recheck = f.status==='${PENDING}' ? '<div class="recheck"><div class="meta">已通过复验 '+(f.rechecks||[]).length+'/2，须换人且距上一次满12小时</div>'
        + '<div class="row"><div><label>湿度%</label><input data-rh="'+f.id+'" type="number" step="0.1"></div><div><label>外观</label><input data-ra="'+f.id+'"></div></div>'
        + '<label>复验人（须换人）</label><input data-ri="'+f.id+'">'
        + '<button type="button" class="secondary" style="margin-top:8px" data-recheck="'+f.id+'">提交复验</button></div>' : '';
      const correct = f.status!=='${"已失效"}' ? '<button type="button" class="secondary" data-correct="'+f.id+'">更正巡检值（旧单失效）</button>' : '';
      const invalid = f.status==='${"已失效"}' ? '<div class="meta warn">已失效：'+esc(f.invalidReason||'')+' '+(f.invalidAt||'').slice(0,16)+'</div>' : '';
      return '<article class="card"><h3>'+esc(f.itemCode)+'</h3><span class="pill '+cls+'">'+f.status+'</span>'
        + '<div class="meta">库位 '+esc(f.storage)+' · '+f.temperature+'℃ · '+f.humidity+'%</div>'
        + '<div class="meta">外观：'+esc(f.appearance)+'</div><div class="meta">初检人 '+esc(f.inspector)+' · '+(f.at||'').slice(0,16)+'</div>'
        + passes+fails+invalid+recheck+correct+'</article>';
    }
    function bindCardEvents() {
      document.querySelectorAll('[data-status]').forEach(sel => sel.onchange = async () => { await api('/api/items/'+sel.dataset.status, { method:'PATCH', body: JSON.stringify({ status: sel.value }) }); await load(); });
      document.querySelectorAll('[data-note]').forEach(btn => btn.onclick = async () => { const id = btn.dataset.note; const note = prompt('记录备注'); if (note) { await api('/api/items/'+id+'/logs', { method:'POST', body: JSON.stringify({ step:'备注', note }) }); await load(); } });
      document.querySelectorAll('[data-movebtn]').forEach(btn => btn.onclick = async () => { const id=btn.dataset.movebtn; const inp=document.querySelector('[data-move="'+id+'"]'); const storage=inp.value.trim(); if(!storage) return alert('填写新库位'); await api('/api/items/'+id+'/move', { method:'POST', body: JSON.stringify({ storage }) }); await load(); });
      document.querySelectorAll('[data-recheck]').forEach(btn => btn.onclick = async () => {
        const id=btn.dataset.recheck;
        const humidity=document.querySelector('[data-rh="'+id+'"]').value;
        const appearance=document.querySelector('[data-ra="'+id+'"]').value;
        const inspector=document.querySelector('[data-ri="'+id+'"]').value;
        try { await api('/api/inspections/'+id+'/rechecks', { method:'POST', body: JSON.stringify({ humidity, appearance, inspector }) }); }
        catch(e){ alert(e.message); }
        await load();
      });
      document.querySelectorAll('[data-correct]').forEach(btn => btn.onclick = async () => {
        const id=btn.dataset.correct;
        const temperature=prompt('更正温度 ℃'); if(temperature===null) return;
        const humidity=prompt('更正湿度 %'); if(humidity===null) return;
        const appearance=prompt('更正外观'); if(appearance===null) return;
        const inspector=prompt('更正巡检人'); if(inspector===null) return;
        try { await api('/api/inspections/'+id+'/correct', { method:'POST', body: JSON.stringify({ temperature, humidity, appearance, inspector }) }); }
        catch(e){ alert(e.message); }
        await load();
      });
    }
    async function load() { [items, forms] = await Promise.all([api('/api/items'), api('/api/inspections')]); render(); }
    createForm.onsubmit = async event => { event.preventDefault(); await api('/api/items', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(createForm).entries())) }); createForm.reset(); await load(); };
    actionForm.onsubmit = async event => { event.preventDefault(); try { await api('/api/items/'+itemSelect.value+'/action', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(actionForm).entries())) }); actionForm.reset(); } catch(e){ alert(e.message); } await load(); };
    document.querySelector('#inspForm').onsubmit = async event => { event.preventDefault(); await api('/api/inspections', { method:'POST', body: JSON.stringify(Object.fromEntries(new FormData(document.querySelector('#inspForm')).entries())) }); document.querySelector('#inspForm').style.display='none'; await load(); };
    document.querySelector('#newInspToggle').onclick = () => { const f=document.querySelector('#inspForm'); f.style.display = f.style.display==='none'?'block':'none'; };
    itemSelect.onchange = updateGrindGate;
    document.querySelector('#statusFilter').onchange = render; document.querySelector('#search').oninput = render;
    document.querySelector('#inspFilter').onchange = render; document.querySelector('#inspSearch').oninput = render;
    document.querySelector('#reload').onclick = load;
    renderForms(); load();
  </script>
</body>
</html>`;
}
