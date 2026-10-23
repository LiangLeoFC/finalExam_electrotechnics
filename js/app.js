"use strict";
/* ═══════════════ 数据 ═══════════════ */
// QUIZ_BANKS: [{id, section, name, chapter, questions:[{k,t,s,o,a,src,note,wrong,my}]}]
// t: single/multiple/judge/fill  src: verified/ai/ai_unverified/unknown

const CHAPTERS = {
  "2": "正弦交流电路", "3": "三相电路", "4": "磁路与铁心线圈",
  "5": "三相异步电动机", "6": "供电与安全用电", "7": "实验1", "8": "实验2", "9": "实验3"
};
const TYPE_LABEL = {single:"单选", multiple:"多选", judge:"判断", fill:"填空"};
const SRC_LABEL = {verified:["答案已验证","fb-src-verified"], ai:["AI推断","fb-src-ai"],
  ai_unverified:["AI推断·待核对","fb-src-unverified"], unknown:["答案未知","fb-src-unknown"]};

/* ═══════════════ 状态 ═══════════════ */
const LS_KEY = "dgx_quiz_v1";
let state = {
  mode:"single", chapter:"all", bankIndex:0, scoring:"instant",
  positions:{}, allOrder:null,
  records:{},   // qkey -> {t:答题次数, c:正确次数}
  wrongBook:{}, // qkey -> true
  favs:{},      // qkey -> true
  list:[], pos:0,
  answers:{},   // 当前组作答（整组判分用）: qkey -> 答案
  batchSubmitted:false
};

function saveState(){
  const s = {mode:state.mode, chapter:state.chapter, bankIndex:state.bankIndex, scoring:state.scoring,
    positions:state.positions, allOrder:state.allOrder, records:state.records,
    wrongBook:state.wrongBook, favs:state.favs};
  try{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }catch(e){}
}
function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw){
      // 首次运行：把学习通上答错的题种进错题本
      QUIZ_BANKS.forEach(b=>b.questions.forEach(q=>{ if(q.wrong) state.wrongBook[q.k]=true; }));
      return;
    }
    const s = JSON.parse(raw);
    if(["single","all","wrong","fav"].includes(s.mode)) state.mode = s.mode;
    if(typeof s.chapter === "string") state.chapter = s.chapter;
    if(["instant","batch"].includes(s.scoring)) state.scoring = s.scoring;
    if(s.positions && typeof s.positions==="object") state.positions = s.positions;
    if(Array.isArray(s.allOrder)) state.allOrder = s.allOrder;
    if(s.records && typeof s.records==="object") state.records = s.records;
    if(s.wrongBook && typeof s.wrongBook==="object") state.wrongBook = s.wrongBook;
    if(s.favs && typeof s.favs==="object") state.favs = s.favs;
    const bi = parseInt(s.bankIndex);
    if(bi>=0 && bi<QUIZ_BANKS.length) state.bankIndex = bi;
  }catch(e){}
}

/* ═══════════════ 工具 ═══════════════ */
function shuffle(a){
  a = [...a];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function escapeHtml(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
// markdown 图片 ![](url) → <img>，其余转义
function renderText(t){
  let h = escapeHtml(t||"");
  h = h.replace(/!\[\]\((https?:\/\/[^)\s]+)\)/g, '<img class="qimg" loading="lazy" src="$1">');
  return h;
}
function answerToText(q){
  if(q.a==null) return "未知";
  if(Array.isArray(q.a)) return q.a.map((x,i)=>`第${"一二三四五六七八九"[i]||i+1}空：${x}`).join("　");
  return String(q.a);
}
function findQuestion(qkey){
  for(let bi=0; bi<QUIZ_BANKS.length; bi++)
    for(let qi=0; qi<QUIZ_BANKS[bi].questions.length; qi++)
      if(QUIZ_BANKS[bi].questions[qi].k===qkey) return {bankIdx:bi, qIdx:qi, q:QUIZ_BANKS[bi].questions[qi]};
  return null;
}
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove("show"), 1800);
}

/* ═══════════════ 列表构建 ═══════════════ */
function buildList(){
  if(state.mode==="single"){
    const bank = QUIZ_BANKS[state.bankIndex];
    state.list = bank.questions.map((q,i)=>({bankIdx:state.bankIndex, qIdx:i}));
  }else if(state.mode==="all"){
    const total = QUIZ_BANKS.reduce((s,b)=>s+b.questions.length,0);
    if(!state.allOrder || state.allOrder.length!==total){
      const flat=[];
      QUIZ_BANKS.forEach((b,bi)=>b.questions.forEach((q,qi)=>flat.push({bankIdx:bi,qIdx:qi})));
      state.allOrder = shuffle(flat);
    }
    state.list = state.allOrder;
  }else if(state.mode==="wrong"){
    state.list = Object.keys(state.wrongBook).map(k=>findQuestion(k)).filter(Boolean);
  }else if(state.mode==="fav"){
    state.list = Object.keys(state.favs).map(k=>findQuestion(k)).filter(Boolean);
  }
  // 位置恢复
  const posKey = state.mode==="single" ? "single_"+state.bankIndex : state.mode;
  let pos = state.positions[posKey]||0;
  if(pos >= state.list.length) pos = 0;
  state.pos = pos;
  state.answers = {};
  state.batchSubmitted = false;
}

/* ═══════════════ 渲染：模式栏 ═══════════════ */
function renderChapterFilter(){
  const el = document.getElementById("chapterFilter");
  const counts = {};
  QUIZ_BANKS.forEach(b=>{ counts[b.chapter]=(counts[b.chapter]||0)+1; });
  let html = `<button class="chapter-btn ${state.chapter==="all"?"active":""}" onclick="setChapter('all')">全部</button>`;
  Object.keys(CHAPTERS).forEach(c=>{
    if(counts[c]) html += `<button class="chapter-btn ${state.chapter===c?"active":""}" onclick="setChapter('${c}')">${CHAPTERS[c]}</button>`;
  });
  el.innerHTML = html;
}
function renderBankSelect(){
  const sel = document.getElementById("bankSelect");
  const opts = QUIZ_BANKS.map((b,i)=>({b,i})).filter(x=> state.chapter==="all" || x.b.chapter===state.chapter);
  sel.innerHTML = opts.map(x=>`<option value="${x.i}" ${x.i===state.bankIndex?"selected":""}>${x.b.section} ${x.b.name}（${x.b.questions.length}题）</option>`).join("");
  // 若当前 bankIndex 不在筛选结果里，切到第一个
  if(!opts.some(x=>x.i===state.bankIndex) && opts.length){
    state.bankIndex = opts[0].i;
    sel.value = String(state.bankIndex);
  }
}

/* ═══════════════ 渲染：题目 ═══════════════ */
function cur(){
  if(!state.list.length) return null;
  const it = state.list[state.pos];
  return {q: QUIZ_BANKS[it.bankIdx].questions[it.qIdx], bankIdx: it.bankIdx, qIdx: it.qIdx};
}

function renderQuestion(){
  const area = document.getElementById("questionArea");
  const nav = document.getElementById("navButtons");
  document.getElementById("batchResult").classList.remove("show");

  const item = cur();
  if(!item){
    const msg = state.mode==="wrong" ? "错题本是空的，太棒了 🎉" :
                state.mode==="fav" ? "还没有收藏题目，点题卡右上角的 ☆ 收藏" : "请选择题库开始刷题";
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><p>${msg}</p></div>`;
    nav.style.display = "none";
    updateSubmitBtn();
    return;
  }
  nav.style.display = "flex";
  const q = item.q;
  const bank = QUIZ_BANKS[item.bankIdx];
  const answered = state.scoring==="instant" ? (state.records[q.k] && state.records[q.k]._last!=null && state.positions["_answered_"+q.k]) : false;

  // 元信息行
  let meta = `<span class="q-type ${q.t}">${TYPE_LABEL[q.t]}</span>
    <span class="q-bankname">${bank.section} ${escapeHtml(bank.name)}</span>`;
  if(q.wrong) meta += `<span class="q-orig-wrong">学习通错题</span>`;
  meta += `<button class="q-fav ${state.favs[q.k]?"on":""}" onclick="toggleFav('${q.k}')" title="收藏">${state.favs[q.k]?"★":"☆"}</button>`;

  let body = `<div class="q-meta">${meta}</div><div class="q-stem">${renderText(q.s)}</div>`;

  // 作答区（无答案的题不可判分，只展示选项 + 查看参考信息）
  const gradable = q.a != null;
  if(!gradable){
    if(q.o) body += optsHtml(q, false);
    body += `<div class="fill-reveal"><button class="btn-outline" onclick="revealFill(null,false)">查看参考信息</button></div>`;
  }
  else if(q.t==="single") body += renderSingle(q, item);
  else if(q.t==="multiple") body += renderMultiple(q, item);
  else if(q.t==="judge") body += renderJudge(q, item);
  else body += renderFill(q, item);

  // 反馈区
  body += `<div class="feedback" id="feedback"></div>`;
  area.innerHTML = body;

  // 即时判分模式：本题已答过则回显
  if(state.scoring==="instant" && state.positions["_ans_"+q.k]!=null && state.batchSubmitted===false){
    const saved = state.positions["_ans_"+q.k];
    if(q.t==="single") gradeSingle(q, saved, true);
    else if(q.t==="judge") renderJudgeFeedback(q, saved, true);
    else if(q.t==="multiple" && Array.isArray(saved)) renderMultiFeedback(q, saved, true);
    else if(q.t==="fill" && saved==="__revealed__") revealFill(q, true);
  }

  // 整组判分模式：回显已选
  if(state.scoring==="batch" && state.answers[q.k]!=null){
    const sel = state.answers[q.k];
    document.querySelectorAll(".opt").forEach(el=>{
      const v = el.getAttribute("data-v");
      if(Array.isArray(sel) ? sel.includes(v) : sel===v) el.classList.add("selected");
    });
  }

  // 导航状态
  document.getElementById("btnPrev").disabled = state.pos<=0;
  document.getElementById("btnNext").disabled = state.pos>=state.list.length-1;
  document.getElementById("navProgress").textContent = `${state.pos+1} / ${state.list.length}`;
  updateSubmitBtn();
}

function optsHtml(q, clickable){
  const letters = Object.keys(q.o||{});
  return `<div class="opts">` + letters.map((L)=>{
    const cls = "opt"+(clickable?"":" disabled");
    return `<div class="${cls}" data-v="${L}" onclick="onOptClick('${q.k}','${L}')">
      <span class="opt-letter">${L}</span><span class="opt-text">${renderText(q.o[L])}</span></div>`;
  }).join("") + `</div>`;
}

function renderSingle(q){
  return optsHtml(q, true);
}
function renderJudge(q){
  return `<div class="opts" style="flex-direction:row;gap:14px">
    <div class="opt judge-opt" data-v="对" style="flex:1" onclick="onOptClick('${q.k}','对')">✓ 对</div>
    <div class="opt judge-opt" data-v="错" style="flex:1" onclick="onOptClick('${q.k}','错')">✗ 错</div>
  </div>`;
}
function renderMultiple(q){
  // 整组判分模式下不显示确认按钮（统一提交）
  const btn = state.scoring==="instant"
    ? `<div class="multi-actions"><button class="btn-primary" onclick="confirmMulti('${q.k}')">确认作答</button></div>` : "";
  return optsHtml(q, true) + btn;
}
function renderFill(q){
  return `<div class="fill-reveal"><button class="btn-outline" onclick="revealFill(null,false)">显示答案</button></div>`;
}

/* ═══════════════ 作答与判分 ═══════════════ */
function onOptClick(qkey, v){
  const item = cur(); if(!item) return;
  const q = item.q;
  if(q.a==null) return; // 无答案题不可作答
  if(state.scoring==="batch"){
    if(state.batchSubmitted) return;
    if(q.t==="multiple"){
      const cur2 = state.answers[qkey]||[];
      const i = cur2.indexOf(v);
      if(i>=0) cur2.splice(i,1); else cur2.push(v);
      state.answers[qkey]=cur2;
      document.querySelector(`.opt[data-v="${v}"]`).classList.toggle("selected");
    }else{
      state.answers[qkey]=v;
      document.querySelectorAll(".opt").forEach(el=>el.classList.toggle("selected", el.getAttribute("data-v")===v));
    }
    updateSubmitBtn();
    return;
  }
  // 即时判分：已答过就不再响应
  if(state.positions["_ans_"+q.k]!=null) return;
  if(q.t==="multiple"){
    // 多选只切换选中，等确认
    const cur2 = state.answers[qkey]||[];
    const i = cur2.indexOf(v);
    if(i>=0) cur2.splice(i,1); else cur2.push(v);
    state.answers[qkey]=cur2;
    document.querySelector(`.opt[data-v="${v}"]`).classList.toggle("selected");
    return;
  }
  if(q.t==="single"){ gradeSingle(q, v, false); return; }
  if(q.t==="judge"){ renderJudgeFeedback(q, v, false); return; }
}

function confirmMulti(qkey){
  const item = cur(); if(!item) return;
  const sel = (state.answers[qkey]||[]).sort().join("");
  if(!sel){ showToast("请先选择选项"); return; }
  if(state.scoring==="batch"){ showToast("整组判分模式下统一提交"); return; }
  if(state.positions["_ans_"+qkey]!=null) return;
  renderMultiFeedback(item.q, sel.split(""), false);
}

function markAnswered(q, correct, userAns){
  // 记录
  const r = state.records[q.k] || {t:0,c:0};
  r.t++; if(correct) r.c++;
  state.records[q.k]=r;
  state.positions["_ans_"+q.k]=userAns;
  // 错题本：答错进、答对出（含学习通错题，一视同仁）
  if(correct) delete state.wrongBook[q.k];
  else state.wrongBook[q.k]=true;
  saveState(); renderStats(); renderWrongList();
}

function feedbackHtml(q, correct){
  const [srcLabel, srcCls] = SRC_LABEL[q.src]||SRC_LABEL.unknown;
  let h = `<div class="fb-line1">${correct?"✅ 回答正确":"❌ 回答错误"}
    <span class="fb-src ${srcCls}">${srcLabel}</span></div>
    <div class="fb-answer">正确答案：<b>${renderText(answerToText(q))}</b></div>`;
  if(q.my && q.wrong){
    const myText = Array.isArray(q.my)? q.my.join("；") : q.my;
    h += `<div class="fb-my">你在学习通的答案：${escapeHtml(myText)}（被判错）</div>`;
  }
  if(q.note) h += `<div class="fb-note">💡 ${escapeHtml(q.note)}</div>`;
  return h;
}
function showFeedback(q, correct){
  const fb = document.getElementById("feedback");
  fb.className = "feedback show "+(correct?"ok":"no");
  fb.innerHTML = feedbackHtml(q, correct);
}

function gradeSingle(q, picked, silent){
  const correct = picked===q.a;
  document.querySelectorAll(".opt").forEach(el=>{
    const v = el.getAttribute("data-v");
    el.classList.add("disabled");
    if(v===q.a) el.classList.add("correct");
    else if(v===picked && picked!==q.a) el.classList.add("wrong");
    else if(v===picked) el.classList.add("selected");
  });
  if(!silent) markAnswered(q, correct, picked);
  showFeedback(q, correct);
}
function renderJudgeFeedback(q, picked, silent){
  const correct = picked===q.a;
  document.querySelectorAll(".opt").forEach(el=>{
    const v = el.getAttribute("data-v");
    el.classList.add("disabled");
    if(v===q.a) el.classList.add("correct");
    else if(v===picked) el.classList.add("wrong");
  });
  if(!silent) markAnswered(q, correct, picked);
  showFeedback(q, correct);
}
function renderMultiFeedback(q, selArr, silent){
  const picked = selArr.slice().sort().join("");
  const correct = picked===String(q.a).split("").sort().join("");
  document.querySelectorAll(".opt").forEach(el=>{
    const v = el.getAttribute("data-v");
    el.classList.add("disabled");
    const inAns = String(q.a).includes(v), inPick = selArr.includes(v);
    if(inAns) el.classList.add("correct");
    if(inPick && !inAns) el.classList.add("wrong");
  });
  const btn = document.querySelector(".multi-actions");
  if(btn) btn.style.display="none";
  if(!silent) markAnswered(q, correct, selArr);
  showFeedback(q, correct);
}

function revealFill(q, silent){
  const item = cur(); if(!item && !q) return;
  q = q || item.q;
  const area = document.querySelector(".fill-reveal");
  if(area){
    area.innerHTML = `<div class="selfmark">
      <button class="btn-outline" style="border-color:var(--correct);color:var(--correct)" onclick="selfMark(true)">✓ 我答对了</button>
      <button class="btn-outline" style="border-color:var(--wrong);color:var(--wrong)" onclick="selfMark(false)">✗ 我答错了</button>
    </div>`;
  }
  const fb = document.getElementById("feedback");
  fb.className = "feedback show ok";
  const [srcLabel, srcCls] = SRC_LABEL[q.src]||SRC_LABEL.unknown;
  let h = `<div class="fb-line1">📖 参考答案 <span class="fb-src ${srcCls}">${srcLabel}</span></div>
    <div class="fb-answer"><b>${renderText(answerToText(q))}</b></div>`;
  if(q.my && q.wrong){
    const myText = Array.isArray(q.my)? q.my.join("；") : q.my;
    h += `<div class="fb-my">你在学习通的答案：${escapeHtml(myText)}（被判错）</div>`;
  }
  if(q.note) h += `<div class="fb-note">💡 ${escapeHtml(q.note)}</div>`;
  fb.innerHTML = h;
}
function selfMark(correct){
  const item = cur(); if(!item) return;
  markAnswered(item.q, correct, "__revealed__");
  showToast(correct?"已记录：答对":"已加入错题本");
}

/* ═══════════════ 整组判分 ═══════════════ */
function updateSubmitBtn(){
  const btn = document.getElementById("btnSubmitAll");
  if(state.scoring!=="batch" || !state.list.length){ btn.style.display="none"; return; }
  btn.style.display = "";
  const answered = Object.keys(state.answers).filter(k=>{
    const a=state.answers[k]; return Array.isArray(a)? a.length>0 : a!=null;
  }).length;
  const total = state.list.filter(it=>{
    const q=QUIZ_BANKS[it.bankIdx].questions[it.qIdx];
    return (q.t==="single"||q.t==="multiple"||q.t==="judge") && q.a!=null;
  }).length;
  btn.textContent = state.batchSubmitted ? "已提交" : `提交整组判分（已答 ${answered} 题）`;
  btn.disabled = state.batchSubmitted;
}
function submitAll(){
  if(state.batchSubmitted) return;
  let right=0, total=0, skipped=0;
  state.list.forEach(it=>{
    const q = QUIZ_BANKS[it.bankIdx].questions[it.qIdx];
    if(!(q.t==="single"||q.t==="multiple"||q.t==="judge") || q.a==null){ skipped++; return; }
    total++;
    const ans = state.answers[q.k];
    const userPicked = Array.isArray(ans)? ans.slice().sort().join("") : ans;
    const rightAns = q.t==="multiple"? String(q.a).split("").sort().join("") : q.a;
    const correct = userPicked!=null && userPicked===rightAns;
    if(correct) right++;
    markAnsweredSilent(q, correct);
  });
  state.batchSubmitted = true;
  saveState(); renderStats(); renderWrongList();
  const res = document.getElementById("batchResult");
  res.classList.add("show");
  const pct = total? Math.round(right/total*100) : 0;
  document.getElementById("batchScore").textContent = total? `${right} / ${total}` : "-";
  document.getElementById("batchDetail").textContent =
    total? `正确率 ${pct}%${skipped?`，另有 ${skipped} 道填空/无答案题未参与判分，可逐题查看答案自评`:""}`
         : "本组没有可自动判分的题目";
  res.scrollIntoView({behavior:"smooth"});
}
function markAnsweredSilent(q, correct){
  const r = state.records[q.k]||{t:0,c:0};
  r.t++; if(correct) r.c++;
  state.records[q.k]=r;
  if(correct) delete state.wrongBook[q.k];
  else state.wrongBook[q.k]=true;
}

/* ═══════════════ 统计与错题本 ═══════════════ */
function renderStats(){
  let t=0,c=0;
  Object.values(state.records).forEach(r=>{ t+=r.t; c+=r.c; });
  document.getElementById("statOverall").textContent = t? Math.round(c/t*100)+"%" : "-";
  document.getElementById("statTotal").textContent = t;
  document.getElementById("statWrongCount").textContent = Object.keys(state.wrongBook).length;
  const total = QUIZ_BANKS.reduce((s,b)=>s+b.questions.length,0);
  const done = Object.keys(state.records).length;
  const pct = total? Math.round(done/total*100):0;
  document.getElementById("progressBar").style.width = pct+"%";
  document.getElementById("progressLabel").textContent = `完成度 ${pct}%（${done}/${total} 题）`;

  // 各题库正确率
  const bs = document.getElementById("bankStats");
  let html = "";
  QUIZ_BANKS.forEach((b)=>{
    let bt=0, bc=0;
    b.questions.forEach(q=>{
      const r = state.records[q.k];
      if(r){ bt+=r.t; bc+=r.c; }
    });
    if(bt) html += `<div class="bank-stat"><span class="bs-name">${b.section} ${escapeHtml(b.name)}</span><span class="bs-val">${Math.round(bc/bt*100)}%</span></div>`;
  });
  bs.innerHTML = html || `<p style="font-size:13px;color:var(--text-sub);">还没有答题记录</p>`;
}
function renderWrongList(){
  const el = document.getElementById("wrongList");
  const keys = Object.keys(state.wrongBook);
  if(!keys.length){ el.innerHTML = `<p style="font-size:13px;color:var(--text-sub);">暂无错题</p>`; return; }
  el.innerHTML = keys.slice(0,30).map(k=>{
    const f = findQuestion(k); if(!f) return "";
    const bank = QUIZ_BANKS[f.bankIdx];
    const stemText = f.q.s.replace(/!\[\]\([^)]+\)/g,"[图]").slice(0,26);
    const tag = f.q.wrong ? `<span class="wi-tag">学习通</span>` : "";
    return `<button class="wrong-item" onclick="jumpTo('${k}')">${tag}${bank.section} · ${escapeHtml(stemText)}…</button>`;
  }).join("");
}
function jumpTo(qkey){
  const f = findQuestion(qkey); if(!f) return;
  state.mode = "single";
  state.bankIndex = f.bankIdx;
  state.chapter = "all";
  buildList();
  state.pos = f.qIdx;
  savePosition();
  saveState(); renderAll();
  window.scrollTo({top:0, behavior:"smooth"});
}

/* ═══════════════ 收藏 ═══════════════ */
function toggleFav(qkey){
  if(state.favs[qkey]){ delete state.favs[qkey]; showToast("已取消收藏"); }
  else{ state.favs[qkey]=true; showToast("已收藏 ★"); }
  saveState();
  if(state.mode==="fav"){ buildList(); }
  renderQuestion();
}

/* ═══════════════ 导航与模式 ═══════════════ */
function savePosition(){
  const posKey = state.mode==="single" ? "single_"+state.bankIndex : state.mode;
  state.positions[posKey]=state.pos;
  saveState();
}
function goPrev(){ if(state.pos>0){ state.pos--; savePosition(); renderQuestion(); } }
function goNext(){ if(state.pos<state.list.length-1){ state.pos++; savePosition(); renderQuestion(); } }
function switchMode(m){
  state.mode = m;
  document.getElementById("modeBar").style.display = m==="single" ? "" : "none";
  ["navSingle","navAll","navWrong","navFav"].forEach(id=>{
    document.getElementById(id).className =
      (id==="navSingle"&&m==="single")||(id==="navAll"&&m==="all")||
      (id==="navWrong"&&m==="wrong")||(id==="navFav"&&m==="fav") ? "active":"";
  });
  buildList(); saveState(); renderAll();
}
function setChapter(c){
  state.chapter = c;
  saveState();
  renderChapterFilter(); renderBankSelect();
  state.bankIndex = parseInt(document.getElementById("bankSelect").value)||0;
  buildList(); renderAll();
}
function onBankChange(){
  state.bankIndex = parseInt(document.getElementById("bankSelect").value)||0;
  buildList(); saveState(); renderAll();
}
function setScoring(s){
  state.scoring = s;
  document.getElementById("scInstant").className = s==="instant"?"active":"";
  document.getElementById("scBatch").className = s==="batch"?"active":"";
  state.answers = {};
  saveState(); renderQuestion();
}
function restartCurrent(){
  showModal("重新开始", "将回到本题库第一题，答题记录保留。", ()=>{
    state.pos = 0; savePosition();
    if(state.mode==="all"){ state.allOrder=null; }
    buildList(); renderAll();
  });
}

/* ═══════════════ 弹窗 ═══════════════ */
function showModal(title, msg, onConfirm){
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMsg").textContent = msg;
  const btn = document.getElementById("modalConfirmBtn");
  btn.onclick = ()=>{ closeModal(); onConfirm(); };
  document.getElementById("modalOverlay").classList.add("show");
}
function closeModal(){ document.getElementById("modalOverlay").classList.remove("show"); }
function confirmReset(kind){
  if(kind==="progress"){
    showModal("重置全部进度", "将清空所有答题记录、各题库正确率和位置，错题本与收藏保留。确定吗？", ()=>{
      state.records = {}; state.positions = {};
      saveState(); renderAll(); showToast("进度已重置");
    });
  }else{
    showModal("清空错题本", "将清空错题本（含学习通错题标记），确定吗？", ()=>{
      state.wrongBook = {};
      saveState(); renderAll(); showToast("错题本已清空");
    });
  }
}

/* ═══════════════ 键盘 ═══════════════ */
document.addEventListener("keydown", (e)=>{
  if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.tagName==="SELECT") return;
  if(document.getElementById("modalOverlay").classList.contains("show")) return;
  const item = cur(); if(!item) return;
  const q = item.q;
  if(e.key==="ArrowLeft"){ goPrev(); e.preventDefault(); }
  else if(e.key==="ArrowRight"){ goNext(); e.preventDefault(); }
  else if(e.key===" " && (q.t==="fill"||q.a==null)){ revealFill(null,false); e.preventDefault(); }
  else if(e.key==="Enter" && q.t==="multiple"){ confirmMulti(q.k); e.preventDefault(); }
  else if(/^[1-9a-eA-E]$/.test(e.key)){
    let v = null;
    if(q.t==="judge") v = (e.key==="1")?"对":(e.key==="2")?"错":null;
    else{
      const letters = Object.keys(q.o||{});
      const idx = /^[1-9]$/.test(e.key)? parseInt(e.key)-1 : e.key.toUpperCase().charCodeAt(0)-65;
      v = letters[idx]||null;
    }
    if(v){ onOptClick(q.k, v); e.preventDefault(); }
  }
});

/* ═══════════════ 渲染入口 ═══════════════ */
function renderAll(){
  renderChapterFilter();
  document.getElementById("modeBar").style.display = state.mode==="single" ? "" : "none";
  renderBankSelect();
  renderQuestion();
  renderStats();
  renderWrongList();
  document.getElementById("scInstant").className = state.scoring==="instant"?"active":"";
  document.getElementById("scBatch").className = state.scoring==="batch"?"active":"";
}

function init(){
  loadState();
  buildList();
  ["navSingle","navAll","navWrong","navFav"].forEach(id=>{
    const m = id.replace("nav","").toLowerCase();
    document.getElementById(id).className = (m===state.mode)?"active":"";
  });
  renderAll();
}
init();