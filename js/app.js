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
  const af = document.getElementById("askFloat");
  if(af) af.style.display = "none"; // 翻题后旧选区失效
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
  meta += `<button class="q-ask" onclick="aiAskCurrent()">✨ 问AI</button>`;
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

/* ═══════════════ AI 助教（智谱 GLM 免费模型） ═══════════════ */
const AI_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const AI_MODEL_TEXT = "glm-4.5-flash";    // 免费文本模型
const AI_MODEL_VISION = "glm-4v-flash";   // 免费视觉模型（识图）
const AI_DEFAULT_KEY = "";                // 部署时可内置混淆后的 Key（可选）
const AI_RATE = {perMin: 5, perDay: 100}; // 浏览器端限流（防滥用辅助层）
const aiState = {quote:null, history:[], streaming:false, abort:null};

function aiDecodeKey(s){ try{ return atob(s.split("").reverse().join("")); }catch(e){ return s; } }
function getAIKey(){ return localStorage.getItem("dgx_ai_key") || (AI_DEFAULT_KEY ? aiDecodeKey(AI_DEFAULT_KEY) : ""); }
function aiSaveKey(){
  const v = document.getElementById("aiKeyInput").value.trim();
  if(!v){ showToast("请先粘贴 Key"); return; }
  localStorage.setItem("dgx_ai_key", v);
  document.getElementById("aiKeyInput").value = "";
  showToast("Key 已保存在本浏览器"); aiRenderWelcome(); aiUsageTip();
}
function aiClearKey(){
  localStorage.removeItem("dgx_ai_key");
  showToast(AI_DEFAULT_KEY ? "已清除自定义 Key，使用内置 Key" : "已清除 Key");
  aiRenderWelcome();
}
function aiTogglePanel(open){
  const panel = document.getElementById("aiPanel");
  const willOpen = (typeof open === "boolean") ? open : !panel.classList.contains("open");
  panel.classList.toggle("open", willOpen);
  document.body.classList.toggle("ai-docked", willOpen);
  localStorage.setItem("dgx_ai_open", willOpen ? "1" : "0");
  if(willOpen) aiUsageTip();
}
function aiToggleSettings(){
  const el = document.getElementById("aiSettings");
  el.style.display = el.style.display==="none" ? "block" : "none";
  if(el.style.display==="block") aiUsageTip();
}
function aiUsageTip(){
  const el = document.getElementById("aiUsageTip");
  if(!el) return;
  const r = JSON.parse(localStorage.getItem("dgx_ai_rate")||"{}");
  const today = new Date().toDateString();
  const used = (r.day===today ? r.count : 0) || 0;
  el.textContent = `今日已用 ${used}/${AI_RATE.perDay} 次 · 限流 ${AI_RATE.perMin} 次/分钟（防滥用）`;
}
function aiRateOk(){
  const now = Date.now();
  let r = {};
  try{ r = JSON.parse(localStorage.getItem("dgx_ai_rate")||"{}"); }catch(e){}
  const today = new Date().toDateString();
  if(r.day!==today) r = {day:today, count:0, ts:[]};
  r.ts = (r.ts||[]).filter(t=>now-t<60000);
  if(r.count>=AI_RATE.perDay){ showToast(`今日已达 ${AI_RATE.perDay} 次上限，明天再来`); return false; }
  if(r.ts.length>=AI_RATE.perMin){ showToast("太快了，歇 1 分钟再问"); return false; }
  r.count++; r.ts.push(now);
  localStorage.setItem("dgx_ai_rate", JSON.stringify(r));
  aiUsageTip();
  return true;
}
function aiClear(){ aiState.history = []; aiState.quote = null; aiRenderQuote(); aiRenderWelcome(); showToast("对话已清空"); }

/* ── 极简 markdown 渲染（加粗/代码/换行） ── */
function mdLite(t){
  let h = escapeHtml(t);
  h = h.replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>")
       .replace(/`([^`]+)`/g,"<code>$1</code>")
       .replace(/\n/g,"<br>");
  return h;
}

/* ── 面板消息渲染 ── */
function aiRenderWelcome(){
  const box = document.getElementById("aiMsgs");
  if(aiState.history.length) return;
  const keyTip = getAIKey() ? "" :
    `<div class="ai-chip" onclick="aiToggleSettings()">👉 先去 ⚙ 设置里粘贴免费 Key（bigmodel.cn 注册即得）</div>`;
  box.innerHTML = `<div class="ai-welcome">
    我读过全部 165 道题库，可以讲题、出类似题、总结考点。<br>
    💡 小技巧：在题目里<b>用鼠标划选</b>内容（公式图片也行），点「✨ 问 AI」即可针对选中部分提问。<br>
    对话不保存，刷新即清空。
    <div class="ai-chips">
      ${keyTip}
      <div class="ai-chip" onclick="aiChip('请讲解当前这道题：先给结论，再讲原理和考点。')">讲解当前这道题</div>
      <div class="ai-chip" onclick="aiChip('这道题涉及哪些考点？容易错在哪？')">考点分析</div>
      <div class="ai-chip" onclick="aiChip('根据当前这道题出 2 道类似的选择题考我，先不要给答案。')">出道类似题考我</div>
      <div class="ai-chip" onclick="aiChip('总结这一章的易错点。')">本章易错点</div>
    </div>
  </div>`;
}
function aiAddMsg(role, text, quote){
  const box = document.getElementById("aiMsgs");
  const welcome = box.querySelector(".ai-welcome");
  if(welcome) box.innerHTML = "";
  const div = document.createElement("div");
  div.className = "ai-msg "+role;
  let inner = "";
  if(quote && quote.text) inner += `<div class="ai-quote-ref">📌 ${escapeHtml(quote.text.slice(0,80))}${quote.text.length>40?"…":""}${quote.images&&quote.images.length?`（含 ${quote.images.length} 张图）`:""}</div>`;
  inner += `<div class="ai-bubble">${role==="user"?escapeHtml(text):mdLite(text)}</div>`;
  div.innerHTML = inner;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}
function aiChip(text){ aiSend(text); }
function aiAskCurrent(){
  if(!document.getElementById("aiPanel").classList.contains("open")) aiTogglePanel();
  aiSend("请讲解当前这道题：先给结论，再讲原理和考点。");
}

/* ── 划词引用 ── */
function aiRenderQuote(){
  const el = document.getElementById("aiQuote");
  const q = aiState.quote;
  if(!q){ el.className = "ai-quote"; el.innerHTML = ""; return; }
  el.className = "ai-quote show";
  el.innerHTML = `<span class="q-text">📌 ${escapeHtml(q.text.slice(0,50))}${q.text.length>50?"…":""}${q.images.length?`（${q.images.length} 张图）`:""}</span>
    <button onclick="aiState.quote=null;aiRenderQuote()" title="移除">✕</button>`;
}
document.addEventListener("mouseup", (e)=>{
  const float = document.getElementById("askFloat");
  if(float.contains(e.target)) return;
  setTimeout(()=>{
    const sel = window.getSelection();
    // 选区塌陷时不隐藏——按钮保持固定，直到点它 / 按 Esc / 翻题
    if(!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    const anchor = sel.anchorNode ? (sel.anchorNode.nodeType===3 ? sel.anchorNode.parentElement : sel.anchorNode) : null;
    if(text.length<2 || !anchor || !anchor.closest(".q-card")) return;
    try{
      const range = sel.getRangeAt(0);
      const imgs = Array.from(range.cloneContents().querySelectorAll("img")).map(i=>i.src);
      const rect = range.getBoundingClientRect();
      float._sel = {text, images:imgs};
      float.style.left = Math.max(8, Math.min(rect.left + rect.width/2 - 44, window.innerWidth-100)) + "px";
      float.style.top = Math.max(60, rect.top - 40) + "px";
      float.style.display = "block";
    }catch(err){}
  }, 10);
});
// Esc 关闭划词按钮
document.addEventListener("keydown", (e)=>{
  if(e.key==="Escape") document.getElementById("askFloat").style.display="none";
});
document.getElementById("askFloat").addEventListener("click", ()=>{
  const float = document.getElementById("askFloat");
  if(float._sel){
    aiState.quote = float._sel;
    aiRenderQuote();
    if(!document.getElementById("aiPanel").classList.contains("open")) aiTogglePanel();
    document.getElementById("aiInput").focus();
  }
  float.style.display = "none";
  window.getSelection().removeAllRanges();
});

/* ── 上下文构建：当前题 + 题库检索 ── */
function aiStripMd(s, imgs){
  return String(s||"").replace(/!\[\]\(([^)\s]+)\)/g, (m,u)=>{ if(imgs) imgs.push(u); return "[图]"; });
}
function aiCurrentContext(){
  const item = cur();
  if(!item) return null;
  const q = QUIZ_BANKS[item.bankIdx].questions[item.qIdx];
  const bank = QUIZ_BANKS[item.bankIdx];
  const imgs = [];
  let t = `【当前题目】${bank.section} ${bank.name} 第${q.k.split("#")[1]}题（${TYPE_LABEL[q.t]}）\n题干：${aiStripMd(q.s, imgs)}`;
  if(q.o) t += "\n选项：" + Object.entries(q.o).map(([k,v])=>`${k}. ${aiStripMd(v, imgs)}`).join("；");
  t += "\n题库标注答案：" + (q.a==null ? "未知" : (Array.isArray(q.a) ? q.a.join("；") : q.a));
  if(q.note) t += "\n题库备注：" + q.note;
  return {text:t, images:imgs};
}
function aiRetrieve(query){
  const q = String(query||"").toLowerCase();
  if(q.length<2) return [];
  const grams = new Set();
  for(let i=0;i<q.length-1;i++){ const g=q.slice(i,i+2); if(!/\s/.test(g)) grams.add(g); }
  const scored = [];
  QUIZ_BANKS.forEach(b=>b.questions.forEach(qq=>{
    const text = (qq.s+" "+Object.values(qq.o||{}).join(" ")+" "+(qq.note||"")).replace(/!\[\]\([^)]+\)/g," ").toLowerCase();
    let s = 0;
    grams.forEach(g=>{ if(text.includes(g)) s += 2; });
    if(s>4) scored.push({s, b, q:qq});
  }));
  scored.sort((x,y)=>y.s-x.s);
  return scored.slice(0,4);
}

const AI_SYSTEM = [
  "你是《电工学》刷题网站内置的 AI 助教，服务对象是正在复习这门课的学生。",
  "课程范围：正弦交流电路、三相电路、磁路与铁心线圈电路、三相异步电动机、工业企业供电与安全用电，以及三个配套实验。",
  "回答规则：",
  "1. 全程使用中文；先给结论，再讲原理，最后点出考点；照顾基础薄弱的学生，必要时举例。",
  "2. 上下文里会提供「当前题目」「题库相关资料」，优先依据它们回答；引用题库时说明出处（章节题号）。",
  "3. 公式用文字或简单符号书写（如 U=220V、I=U/|Z|、P=UIcosφ），不要用 LaTeX。",
  "4. 学生划选了一段内容提问时，重点解释那段内容。",
  "5. 涉及图片时若能看图则结合图片分析；看不到图片就明确说明，不要假装看到。",
  "6. 不确定就明确说「不确定」，绝不编造；超出课程范围的问题简要回答并引导回课程。"
].join("\n");

/* ── 调用智谱 API（流式，视觉模型降级回退） ── */
async function aiCallGLM(messages, images, key, onDelta, signal){
  async function once(useVision){
    const model = useVision ? AI_MODEL_VISION : AI_MODEL_TEXT;
    const msgs = messages.slice();
    if(useVision){
      const last = msgs[msgs.length-1];
      const content = [{type:"text", text:last.content}];
      images.forEach(u=>content.push({type:"image_url", image_url:{url:u}}));
      msgs[msgs.length-1] = {role:"user", content};
    }
    const resp = await fetch(AI_ENDPOINT, {
      method:"POST",
      headers:{"Authorization":"Bearer "+key, "Content-Type":"application/json"},
      body: JSON.stringify({model, messages:msgs, stream:true, temperature:0.3}),
      signal
    });
    if(!resp.ok){
      const errText = await resp.text().catch(()=> "");
      const err = new Error("HTTP "+resp.status+" "+errText.slice(0,200));
      err.status = resp.status; err.visionTried = useVision;
      throw err;
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while(true){
      const {done, value} = await reader.read();
      if(done) break;
      buf += dec.decode(value, {stream:true});
      let idx;
      while((idx = buf.indexOf("\n")) >= 0){
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx+1);
        if(!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if(data === "[DONE]") return;
        try{
          const j = JSON.parse(data);
          const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if(d) onDelta(d);
        }catch(e){}
      }
    }
  }
  const useVision = images && images.length>0;
  try{
    await once(useVision);
  }catch(e){
    if(useVision && (e.status===400 || e.status===404)){
      // 视觉模型不可用时降级为纯文本，并把图片地址告诉模型
      messages[messages.length-1].content += "\n（本消息原含图片：" + images.join(" , ") + "，视觉模型暂不可用，请按文字信息回答，并说明看不到图片）";
      await once(false);
    }else{
      throw e;
    }
  }
}

/* ── 发送 ── */
async function aiSend(preset){
  const input = document.getElementById("aiInput");
  const sendBtn = document.getElementById("aiSend");
  if(aiState.streaming){
    if(aiState.abort) aiState.abort.abort();
    return;
  }
  let text = (preset || input.value || "").trim();
  const quote = aiState.quote;
  if(!text && !quote){ showToast("先输入问题，或划选题干内容"); return; }
  if(!text && quote) text = "请解释我划选的这段内容。";
  const key = getAIKey();
  if(!key){
    if(!document.getElementById("aiPanel").classList.contains("open")) aiTogglePanel();
    document.getElementById("aiSettings").style.display = "block";
    aiAddMsg("ai", "还没有配置 API Key。去 bigmodel.cn 用手机号免费注册 → 控制台 → API Keys → 新建，把 Key 粘贴到上面的设置框里即可（Key 只存在你自己浏览器里）。");
    return;
  }
  if(!aiRateOk()) return;

  // 组上下文
  const images = [];
  const parts = [];
  const ctx = aiCurrentContext();
  if(ctx){ parts.push(ctx.text); ctx.images.forEach(u=>images.push(u)); }
  if(quote){
    parts.push("【我划选的内容】\n" + quote.text);
    quote.images.forEach(u=>images.push(u));
  }
  const hits = aiRetrieve(text + " " + (quote?quote.text:""));
  if(hits.length){
    const lines = hits.map((h,i)=>{
      const qi = h.q;
      const stem = aiStripMd(qi.s, null).slice(0, 120);
      const ans = qi.a==null ? "未知" : (Array.isArray(qi.a) ? qi.a.join("；") : qi.a);
      return `${i+1}. 【${h.b.section} ${h.b.name}】${stem} … 答案：${ans}${qi.note?(" 备注："+qi.note):""}`;
    });
    parts.push("【题库相关资料】\n" + lines.join("\n"));
  }
  parts.push("【我的问题】\n" + text);

  aiAddMsg("user", text, quote);
  input.value = ""; aiState.quote = null; aiRenderQuote();

  const bubbleDiv = aiAddMsg("ai", "…");
  const bubble = bubbleDiv.querySelector(".ai-bubble");
  aiState.streaming = true; aiState.abort = new AbortController();
  sendBtn.textContent = "停止";

  const messages = [{role:"system", content:AI_SYSTEM}]
    .concat(aiState.history.slice(-8))
    .concat([{role:"user", content:parts.join("\n\n")}]);

  let acc = "";
  try{
    await aiCallGLM(messages, images, key, (d)=>{
      acc += d;
      bubble.innerHTML = mdLite(acc);
      const box = document.getElementById("aiMsgs");
      box.scrollTop = box.scrollHeight;
    }, aiState.abort.signal);
    if(!acc) acc = "（模型没有返回内容，请重试）";
  }catch(e){
    if(e && e.name === "AbortError"){
      acc = acc || "（已停止）";
    }else{
      let msg = "调用失败：" + (e && e.message ? e.message : e);
      if(e && e.status===401) msg += "\n💡 Key 无效，请检查 ⚙ 设置里的 Key 是否粘贴完整。";
      else if(e && e.status===429) msg += "\n💡 模型限流了（免费档有频率限制），过 1 分钟再试。";
      else if(e && /Failed to fetch|NetworkError/i.test(String(e && e.message))) msg += "\n💡 网络不通：如果开着代理请先关掉，智谱 API 国内直连。";
      acc = msg;
    }
  }
  bubble.innerHTML = mdLite(acc);
  aiState.history.push({role:"user", content:text});
  aiState.history.push({role:"assistant", content:acc});
  if(aiState.history.length>20) aiState.history = aiState.history.slice(-20);
  aiState.streaming = false; aiState.abort = null;
  sendBtn.textContent = "发送";
}

// 输入框：Enter 发送，Shift+Enter 换行
document.getElementById("aiInput").addEventListener("keydown", (e)=>{
  if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); aiSend(); }
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
  aiRenderWelcome();
  // 恢复面板停靠状态（刷新后保持打开）
  if(localStorage.getItem("dgx_ai_open")==="1") aiTogglePanel(true);
}
init();