/* Logic chính của app. Nội dung (môn, câu hỏi, chương) lấy qua object Content trong content.js. */
/* ============ cấu hình nơi nhận góp ý ============
   Dán link Web App (.../exec) của Google Apps Script vào FEEDBACK_URL.
   Xem hướng dẫn tạo trong _BaoMat\HUONG-DAN-GOPY.txt
   Để trống => app vẫn nhận góp ý nhưng chỉ lưu trên máy, người dùng xuất file/chép tay gửi admin. */
const FEEDBACK_URL="https://script.google.com/macros/s/AKfycbyqBpz3-UhaQG-jgPoO98KTYcqHUF0M1XQVuV4_q0gLSXfmiGi9CCy3-dIRTYhhwqxn/exec";
const FEEDBACK_MAX=4000;

/* ============ storage (per-subject) ============ */
const PROG_KEYS=['history','stats','overrides','bookmarks','resume','session'];
const LS={
  get:(k,d)=>{try{return JSON.parse(localStorage.getItem('cccm_'+k))??d}catch(e){return d}},
  set:(k,v)=>localStorage.setItem('cccm_'+k,JSON.stringify(v)),
  del:k=>localStorage.removeItem('cccm_'+k)
};
/* migrate v1 (single-subject) keys -> coban */
(function(){
  if(localStorage.getItem('cccm_history')&&!localStorage.getItem('cccm_coban_history')){
    PROG_KEYS.forEach(k=>{const v=localStorage.getItem('cccm_'+k);if(v!==null)localStorage.setItem('cccm_coban_'+k,v);});
  }
})();
function loadProg(sid){
  return {
    history:LS.get(sid+'_history',[]),
    stats:LS.get(sid+'_stats',{}),
    overrides:LS.get(sid+'_overrides',{}),
    bookmarks:LS.get(sid+'_bookmarks',[]),
    resume:LS.get(sid+'_resume',null),
    session:LS.get(sid+'_session',null)
  };
}
function saveProg(part){LS.set(cur.id+'_'+part,P[part]);}

/* ============ tài khoản & phân quyền ============
   Bản KHÔNG đăng nhập: toàn quyền (admin) — giữ nguyên hành vi cũ.
   Bản CÓ đăng nhập: login-inject.js đặt window.__CCCM_AUTH={u,n,r} rồi gọi applyAuth();
   chỉ tài khoản r==='admin' mới được sửa đáp án, còn lại chỉ được gửi góp ý. */
const AUTH={user:'',name:'',role:'admin'};
function applyAuth(){
  const a=window.__CCCM_AUTH;if(!a)return;
  AUTH.user=a.u||'';AUTH.name=a.n||a.u||'';AUTH.role=(a.r==='admin')?'admin':'user';
}
const isAdmin=()=>AUTH.role==='admin';

/* ============ state ============ */
let cur=null,DB=[],CHAPTERS=[],P=null;
/* override có thể là chuỗi (bản cũ: chỉ đáp án) hoặc object {a, note} (đáp án + chú thích đã sửa) */
const ansOf=q=>{const ov=P.overrides[q.id];return ov?(typeof ov==='string'?ov:ov.a):q.answer;};
const noteOf=q=>{const ov=P.overrides[q.id];return (ov&&typeof ov==='object'&&ov.note)?ov.note:(q.answerNote||'');};
const noteEdited=q=>{const ov=P.overrides[q.id];return !!(ov&&typeof ov==='object'&&ov.note);};

/* ============ helpers ============ */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),1900);}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function confBadge(c){if(c==='high')return '<span class="badge b-green">Tin cậy cao</span>';
  if(c==='medium')return '<span class="badge b-amber">Trung bình</span>';
  if(c==='low')return '<span class="badge b-red">Cần kiểm tra</span>';return '';}
function vBadge(q){return q.verified?'<span class="badge b-green">Đáp án gốc</span>':'';}
/* câu được user sửa đáp án thủ công (overrides) -> coi như tin cậy cao, đáp án gốc */
const hasOv=q=>!!(P&&P.overrides&&P.overrides[q.id]);
const confOf=q=>hasOv(q)?'high':q.confidence;
function qBadges(q){return hasOv(q)?confBadge('high')+' <span class="badge b-green">Đáp án gốc</span>':[confBadge(q.confidence),vBadge(q)].filter(Boolean).join(' ');}
function pdfHref(sub,pdf){const path=pdf.includes('/')?pdf:sub.folder+'/'+pdf;return encodeURI('./'+path);}

/* ============ ghi nhớ phiên làm bài ============
   Lưu theo môn: tab đang mở, chương đang đọc, trạng thái tab Luyện đề
   (bộ lọc, số câu đã tải, đáp án đã chọn, câu đã hiện đáp án, câu làm gần nhất)
   và bài thi đang làm dở. Nhờ vậy thoát ra vào lại không mất dấu vết. */
function blankSession(){return {tab:'hoc',chapter:null,exam:null,
  luyen:{shown:0,filters:null,picked:{},revealed:[],last:null,ts:0}};}
function sess(){
  if(!P)return blankSession();
  if(!P.session||typeof P.session!=='object')P.session=blankSession();
  const s=P.session;
  if(!s.luyen||typeof s.luyen!=='object')s.luyen=blankSession().luyen;
  if(!s.luyen.picked||typeof s.luyen.picked!=='object')s.luyen.picked={};
  if(!Array.isArray(s.luyen.revealed))s.luyen.revealed=[];
  return s;
}
let _sessTimer=null;
function saveSession(now){
  if(!cur||!P)return;
  clearTimeout(_sessTimer);
  if(now){saveProg('session');return;}
  _sessTimer=setTimeout(()=>{if(cur&&P)saveProg('session');},250);
}

/* ============ HOME ============ */
function subjProgSummary(sid){
  const h=LS.get(sid+'_history',[]),st=LS.get(sid+'_stats',{});
  const best=h.reduce((m,x)=>Math.max(m,x.pct),0);
  return {attempts:h.length,best,practiced:Object.keys(st).length};
}
function renderHome(){
  let totQ=0,totC=0;
  $('#subGrid').innerHTML=SUBJECTS.map(s=>{
    const d=Content.stats(s.id),nq=d.questions,nc=d.chapters;totQ+=nq;totC+=nc;
    const pr=subjProgSummary(s.id);
    const rs=LS.get(s.id+'_resume',null);
    const verified=d.verified;
    return `<div class="subj" role="button" tabindex="0" data-activate onclick="openSubject('${s.id}')">
      <div class="icon">${s.icon}</div>
      <h3>${esc(s.name)}</h3>
      <div class="meta">📚 ${nq} câu hỏi${verified?` (${verified} đáp án gốc)`:''} • 📖 ${nc} chương
        ${s.aiBank?'<br><span class="badge b-amber">Đề biên soạn từ slide</span>':''}</div>
      <div class="prog-line">${pr.attempts?`🏆 Cao nhất <b>${pr.best}%</b> • ${pr.attempts} lượt thi • ${pr.practiced} câu đã luyện`:'<span style="color:var(--muted)">Chưa bắt đầu</span>'}</div>
      ${rs?`<div class="resume-line">⏱ Dừng ở câu <b>#${rs.qid}</b> · ${timeAgo(rs.ts)}<button class="btn-resume" onclick="event.stopPropagation();resumeStudy('${s.id}')">▶ Học tiếp</button></div>`:''}
    </div>`;
  }).join('');
  $('#homeStripe').innerHTML=`<span>🗂️ <b>${SUBJECTS.length}</b> môn học</span>
    <span>📚 <b>${totQ}</b> câu hỏi</span>
    <span>📖 <b>${totC}</b> chương lý thuyết</span>
    <span>🛠️ Cập nhật: <b>${META.build}</b></span>
    ${AUTH.user?`<span>👤 <b>${esc(AUTH.name||AUTH.user)}</b>${isAdmin()?' · quản trị':''}</span>`:''}`;
  renderFeedbackCard();
}

/* ============ subject open/close ============ */
let _openSeq=0;
/* Nội dung môn được tải theo yêu cầu (Content.load) thay vì nhúng sẵn trong trang.
   Trả về true nếu mở xong, false nếu tải lỗi hoặc người dùng đã bấm sang môn khác trong lúc chờ. */
async function openSubject(sid){
  const seq=++_openSeq;let d;
  document.documentElement.style.cursor='progress';
  try{d=await Content.load(sid);}
  catch(e){console.error(e);toast('Không tải được nội dung môn học. Kiểm tra kết nối mạng rồi thử lại.');return false;}
  finally{if(seq===_openSeq)document.documentElement.style.cursor='';}
  if(seq!==_openSeq)return false;
  cur=SUBJECTS.find(s=>s.id===sid);
  DB=d.questions;CHAPTERS=d.chapters;P=loadProg(sid);
  _jumpedOnce=false;
  $('#home').style.display='none';$('#subject').style.display='block';
  $('#subjTitle').textContent=cur.icon+' '+cur.name;
  $('#aiBankNote').innerHTML=cur.aiBank?`<div class="disclaimer" style="margin-top:6px"><span>🤖</span><div>Môn này <b>không có bộ đề ôn tập gốc</b> — toàn bộ câu hỏi do AI biên soạn từ slide bài giảng và quy định pháp luật hiện hành. Chỉ dùng để tự kiểm tra kiến thức, cần đối chiếu tài liệu gốc.</div></div>`:'';
  const s=sess();
  renderStripe();
  initLuyenFilters();                 // dựng danh sách chủ đề (đặt luyenShown=0)
  applyLuyenFilters(s.luyen.filters); // khôi phục bộ lọc của phiên trước
  luyenShown=Math.max(0,s.luyen.shown||0);
  renderLuyen();                      // vẽ lại kèm đáp án đã chọn / đã hiện
  renderChapters();
  if(s.chapter!=null&&CHAPTERS.some(c=>c.chapter===s.chapter))openChapter(s.chapter,true);
  resetExamView(true);                // giữ bài thi đang dở, chỉ dựng lại giao diện
  renderProgress();
  const n=Math.min(50,Math.max(5,DB.length));$('#exNum').value=n;
  window.scrollTo({top:0,behavior:'smooth'});
  switchTab($('#'+s.tab)?s.tab:'hoc');
  return true;
}
function closeSubject(){
  if(exam)saveExam();
  if(cur&&P)saveProg('session');
  if(examTimer)clearInterval(examTimer);
  examTimer=null;exam=null;
  cur=null;P=null;$('#subject').style.display='none';$('#home').style.display='block';
  renderHome();window.scrollTo({top:0,behavior:'smooth'});
}
function switchTab(tab){
  $$('#tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
  $$('#subject .panel').forEach(p=>p.classList.remove('show'));
  $('#'+tab).classList.add('show');
  if(cur&&P){sess().tab=tab;saveSession();}
  if(tab==='tiendo')renderProgress();
  if(tab==='thi')renderExamResumeBar();
  if(tab==='luyen'){const first=!_jumpedOnce;_jumpedOnce=true;setTimeout(()=>jumpToLast(first),80);}
}
$$('#tabs button').forEach(b=>b.onclick=()=>{switchTab(b.dataset.tab);window.scrollTo({top:0,behavior:'smooth'});});

/* ============ stripe ============ */
function renderStripe(){
  const topics=[...new Set(DB.map(q=>q.topic))];
  const verified=DB.filter(q=>q.verified).length;
  $('#stripe').innerHTML=`<span>📚 <b>${DB.length}</b> câu hỏi</span>
    <span>🗂️ <b>${topics.length}</b> chủ đề</span>
    <span>📖 <b>${CHAPTERS.length}</b> chương lý thuyết</span>
    ${verified?`<span>✅ <b>${verified}</b> câu có đáp án gốc</span>`:''}`;
}

/* ============ HOC: chapters ============ */
function renderChapters(){
  const wrap=$('#chapList');
  $('#hocTitle').textContent=`Học tập khái niệm — ${CHAPTERS.length} chương`;
  if(!CHAPTERS.length){wrap.innerHTML='<div class="empty">Chưa có nội dung lý thuyết cho môn này.</div>';return;}
  wrap.innerHTML='<div class="grid">'+CHAPTERS.map(c=>`
    <div class="chap" role="button" tabindex="0" data-activate onclick="openChapter(${c.chapter})">
      <div class="num">CHƯƠNG ${c.chapter}</div>
      <h3>${esc(c.title)}</h3>
      <div class="meta">${c.sections.length} mục • ${(c.keyTerms||[]).length} thuật ngữ</div>
    </div>`).join('')+'</div>';
}
function closeChapter(){if(cur&&P){sess().chapter=null;saveSession();}renderChapters();}
function openChapter(n,restoring){
  const c=CHAPTERS.find(x=>x.chapter===n);if(!c)return;
  if(cur&&P){sess().chapter=n;saveSession();}
  const wrap=$('#chapList');
  wrap.innerHTML=`<button class="backbtn" onclick="closeChapter()">← Quay lại danh sách chương</button>
  <div class="card chap-detail">
    <div class="num" style="color:var(--brand);font-weight:800;font-size:12px">CHƯƠNG ${c.chapter}</div>
    <h2>${esc(c.title)}</h2>
    <p style="color:var(--muted);font-size:14.5px">${esc(c.intro)}</p>
    ${(c.note&&!/\bAI\b/.test(c.note))?`<div class="note-banner">⚠️ ${esc(c.note)}</div>`:''}
    ${false?`<a class="pdfbtn" href="${pdfHref(cur,c.pdf)}" target="_blank">📄 Mở tài liệu gốc</a>
    <div style="font-size:12px;color:var(--muted);margin-top:6px">Link mở file trên máy — chỉ hoạt động khi app nằm cạnh các folder tài liệu.</div>`:''}
    ${c.sections.map(s=>`<div class="sec-block"><h4>${esc(s.heading)}</h4><ul>${s.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}
    ${(c.keyTerms||[]).length?`<div class="sec-block"><h4>🔑 Thuật ngữ then chốt</h4>
      <div class="terms">${c.keyTerms.map(t=>`<div class="term"><b>${esc(t.term)}:</b> ${esc(t.def)}</div>`).join('')}</div>
    </div>`:''}
  </div>`;
  if(!restoring)window.scrollTo({top:0,behavior:'smooth'});
}

/* ============ LUYEN ============ */
let luyenShown=0, _jumpedOnce=false; const PAGE=15;
let weakFocus=null;   /* danh sách id "câu hay sai" đang luyện lại; null = không giới hạn */
function initLuyenFilters(){
  const topics=[...new Set(DB.map(q=>q.topic))].sort();
  $('#fTopic').innerHTML='<option value="">Tất cả chủ đề</option>'+topics.map(t=>`<option>${esc(t)} (${DB.filter(q=>q.topic===t).length})</option>`).join('');
  $('#fConf').value='';$('#fSearch').value='';$('#fBookmark').checked=false;
  weakFocus=null;luyenShown=0;
}
['#fTopic','#fConf','#fSearch','#fBookmark'].forEach(s=>{
  document.addEventListener('DOMContentLoaded',()=>{});
});
/* trạng thái bộ lọc hiện tại + khôi phục lại từ phiên trước */
function luyenFilterState(){
  return {topic:$('#fTopic').value,conf:$('#fConf').value,search:$('#fSearch').value,bm:$('#fBookmark').checked};
}
function applyLuyenFilters(f){
  if(!f)return;
  let tv='';const want=(f.topic||'').replace(/ \(\d+\)$/,'');
  if(want)[...$('#fTopic').options].forEach(o=>{if(o.value.replace(/ \(\d+\)$/,'')===want)tv=o.value;});
  $('#fTopic').value=tv;$('#fConf').value=f.conf||'';$('#fSearch').value=f.search||'';$('#fBookmark').checked=!!f.bm;
}
function bindLuyenEvents(){
  ['#fTopic','#fConf','#fSearch','#fBookmark'].forEach(s=>$(s).addEventListener('input',()=>{
    weakFocus=null;            /* đụng vào bộ lọc là thoát chế độ luyện lại */
    luyenShown=0;
    if(cur&&P){const l=sess().luyen;l.filters=luyenFilterState();l.shown=0;saveSession();}
    renderLuyen();
  }));
  $('#moreBtn').onclick=()=>moreLuyen();
  $('#revealAll').onclick=()=>{$$('#qList .q').forEach(el=>revealAnswer(el,true));};
  $('#hideAll').onclick=()=>{
    $$('#qList .explain').forEach(e=>e.remove());$$('#qList .opt').forEach(o=>o.classList.remove('correct','wrong'));
    if(cur&&P){const l=sess().luyen,ids=$$('#qList .q').map(el=>+el.dataset.id);
      l.revealed=l.revealed.filter(id=>!ids.includes(id));saveSession(true);}
  };
}
function bindLuyenOpts(){
  $$('#qList .opt').forEach(o=>o.onclick=()=>{const q=o.closest('.q');revealAnswer(q,false,o.dataset.k);});
}
/* ============ học tiếp (đánh dấu tiến độ gần nhất) ============ */
function timeAgo(ts){
  if(!ts)return'';
  const m=Math.floor((Date.now()-ts)/60000);
  if(m<1)return'vừa xong';
  if(m<60)return m+' phút trước';
  const h=Math.floor(m/60);
  if(h<24)return h+' giờ trước';
  return Math.floor(h/24)+' ngày trước';
}
function renderResumeBanner(){
  const el=$('#resumeBanner');if(!el)return;
  const rs=P&&P.resume;
  if(!rs){el.innerHTML='';return;}
  const q=DB.find(x=>x.id===rs.qid);
  el.innerHTML=q?`<div class="resume-banner">
    <div>⏱ Lần trước bạn dừng ở <b>câu #${rs.qid}</b>${rs.topic?` · chủ đề “${esc(rs.topic)}”`:''} · ${timeAgo(rs.ts)}</div>
    <div class="rb-actions">
      <button class="btn btn-pri" onclick="resumeJump()">▶ Tiếp tục</button>
      <button class="btn btn-sec" onclick="clearResume()">✕ Xóa dấu</button>
    </div>
  </div>`:'';
}
function clearResume(){P.resume=null;LS.del(cur.id+'_resume');renderResumeBanner();renderHome();toast('Đã xóa dấu học tiếp.');}
/* ===== luyện lại các câu hay sai (mục "Câu hay sai nhất" ở tab Tiến độ) ===== */
function weakEntries(){            /* top 10 câu sai nhiều nhất - dùng chung cho bảng và nút */
  if(!P)return[];
  return Object.entries(P.stats).filter(([id,s])=>s.wrong>0).sort((a,b)=>b[1].wrong-a[1].wrong).slice(0,10);
}
function renderWeakFocusBar(){
  const el=$('#weakFocusBar');if(!el)return;
  el.innerHTML=(weakFocus&&weakFocus.length)?`<div class="focus-banner">
    <div>🔄 Đang luyện lại <b>${weakFocus.length} câu hay sai</b> · đáp án đã được ẩn để bạn làm lại từ đầu</div>
    <button class="btn btn-sec" onclick="clearWeakFocus()">✕ Thoát chế độ luyện lại</button>
  </div>`:'';
}
function startWeakReview(){
  if(!cur||!P)return;
  const ids=weakEntries().map(([id])=>+id).filter(id=>DB.some(q=>q.id===id));
  if(!ids.length){toast('Chưa có câu sai nào để luyện lại.');return;}
  weakFocus=ids;luyenShown=0;
  const l=sess().luyen;             /* ẩn đáp án đã hiện để làm lại; thống kê vẫn cộng dồn */
  l.revealed=l.revealed.filter(id=>!ids.includes(id));
  ids.forEach(id=>{delete l.picked[id];});
  l.shown=0;saveSession(true);
  $('#fTopic').value='';$('#fConf').value='';$('#fSearch').value='';$('#fBookmark').checked=false;
  switchTab('luyen');renderLuyen();
  window.scrollTo({top:0,behavior:'smooth'});
  toast('Đang luyện lại '+ids.length+' câu hay sai.');
}
function clearWeakFocus(){weakFocus=null;luyenShown=0;renderLuyen();window.scrollTo({top:0,behavior:'smooth'});}
function resumeJump(){
  const rs=P&&P.resume;if(!rs)return;
  weakFocus=null;
  // khôi phục bộ lọc phiên trước (chủ đề đã lưu ở dạng bỏ hậu tố "(N)")
  let topicVal='';
  if(rs.topic){[...$('#fTopic').options].forEach(o=>{if(o.value.replace(/ \(\d+\)$/,'')===rs.topic)topicVal=o.value;});}
  $('#fTopic').value=topicVal;
  $('#fConf').value=rs.conf||'';
  $('#fSearch').value=rs.search||'';
  $('#fBookmark').checked=!!rs.bm;
  let list=filteredQuestions(),idx=list.findIndex(q=>q.id===rs.qid);
  if(idx<0){ // không khớp bộ lọc cũ -> bỏ lọc thử lại
    $('#fTopic').value='';$('#fConf').value='';$('#fSearch').value='';$('#fBookmark').checked=false;
    list=filteredQuestions();idx=list.findIndex(q=>q.id===rs.qid);
  }
  if(idx<0){toast('Câu đã đánh dấu không còn trong ngân hàng đề.');clearResume();luyenShown=0;renderLuyen();return;}
  luyenShown=Math.max(PAGE,Math.ceil((idx+1)/PAGE)*PAGE);
  renderLuyen();
  const qEl=document.querySelector('#qList .q[data-id="'+rs.qid+'"]');
  if(qEl){
    qEl.scrollIntoView({behavior:'smooth',block:'center'});
    // dự phòng: nếu trình duyệt không cuộn mượt (reduced-motion...) thì nhảy thẳng
    setTimeout(()=>{
      const r=qEl.getBoundingClientRect();
      if(r.top<0||r.bottom>window.innerHeight)qEl.scrollIntoView({block:'center'});
    },700);
    qEl.classList.add('resume-hl');
    setTimeout(()=>qEl.classList.remove('resume-hl'),2600);
  }
}
async function resumeStudy(sid){if(!await openSubject(sid))return;switchTab('luyen');setTimeout(resumeJump,60);}
/* cuộn thẳng tới câu vừa làm gần nhất của phiên trước */
function jumpToLast(highlight){
  if(!cur||!P||weakFocus)return;
  const l=sess().luyen,id=l.last;if(!id)return;
  if(!$('#luyen').classList.contains('show'))return;
  const list=filteredQuestions(),idx=list.findIndex(q=>q.id===id);
  if(idx<0)return;
  if(idx+1>luyenShown){ // tải đủ số trang để câu đó có mặt
    luyenShown=Math.min(list.length,Math.ceil((idx+1)/PAGE)*PAGE);
    l.shown=luyenShown;saveSession();renderLuyen();
  }
  const el=document.querySelector('#qList .q[data-id="'+id+'"]');if(!el)return;
  el.scrollIntoView({behavior:highlight?'smooth':'auto',block:'center'});
  if(highlight){
    setTimeout(()=>{const r=el.getBoundingClientRect();
      if(r.top<0||r.bottom>window.innerHeight)el.scrollIntoView({block:'center'});},700);
    el.classList.add('resume-hl');setTimeout(()=>el.classList.remove('resume-hl'),2600);
  }
}
/* vẽ lại đáp án đã chọn / đã hiện của phiên trước lên các thẻ vừa render */
function restoreLuyenState(){
  if(!cur||!P)return;
  const l=sess().luyen;if(!l.revealed.length)return;
  $$('#qList .q').forEach(el=>{const id=+el.dataset.id;
    if(l.revealed.includes(id))paintAnswer(el,l.picked[id]);});
}
/* append next page WITHOUT re-rendering existing cards, so answers already revealed stay intact */
function moreLuyen(){
  if(!cur)return;
  const list=filteredQuestions();
  const start=luyenShown;
  luyenShown=Math.min(luyenShown+PAGE,list.length);
  const slice=list.slice(start,luyenShown);
  $('#qList').insertAdjacentHTML('beforeend',slice.map((q,i)=>qCardHTML(q,start+i+1)).join(''));
  bindLuyenOpts();restoreLuyenState();
  if(cur&&P){sess().luyen.shown=luyenShown;saveSession();}
  $('#moreBtn').style.display=luyenShown<list.length?'inline-block':'none';
}
function filteredQuestions(){
  if(weakFocus&&weakFocus.length){   /* chế độ luyện lại: giữ thứ tự sai nhiều -> sai ít */
    const ord=new Map(weakFocus.map((id,i)=>[id,i]));
    return DB.filter(q=>ord.has(q.id)).sort((a,b)=>ord.get(a.id)-ord.get(b.id));
  }
  const tp=$('#fTopic').value.replace(/ \(\d+\)$/,''), cf=$('#fConf').value,
    s=$('#fSearch').value.trim().toLowerCase(), bm=$('#fBookmark').checked;
  return DB.filter(q=>{
    if(tp&&q.topic!==tp)return false;
    if(cf&&confOf(q)!==cf)return false;
    if(bm&&!P.bookmarks.includes(q.id))return false;
    if(s&&!(q.stem.toLowerCase().includes(s)||q.options.some(o=>o.text.toLowerCase().includes(s))))return false;
    return true;
  });
}
function qCardHTML(q,idx){
  const flags=[`<span class="qtopic badge b-blue">${esc(q.topic)}</span>`];
  if(q.verified||hasOv(q))flags.push('<span class="badge b-green">Đáp án gốc</span>');
  if(q.suspect)flags.push('<span class="badge b-amber">Nghi lỗi ký tự</span>');
  return `<div class="q" data-id="${q.id}">
    <div class="qhead"><span class="qnum">Câu ${idx}</span><div>${flags.join(' ')}</div></div>
    <div class="stem">${esc(q.stem)}</div>
    <ul class="opts">${q.options.map(o=>`<li class="opt" data-k="${o.key}" role="button" tabindex="0" data-activate><span class="k">${o.key})</span><span>${esc(o.text)}</span></li>`).join('')}</ul>
    <div class="qfoot">
      <button class="btn btn-sec" onclick="revealAnswer(this.closest('.q'))">Hiện đáp án</button>
      <button class="linkbtn" onclick="toggleBookmark(${q.id},this)">${P.bookmarks.includes(q.id)?'★ Bỏ đánh dấu':'☆ Đánh dấu'}</button>
      ${isAdmin()?`<button class="linkbtn" onclick="editAnswer(${q.id})">✎ Sửa đáp án</button>`
                 :`<button class="linkbtn" onclick="openFeedback(${q.id})">💬 Góp ý đáp án</button>`}
      <span class="src-tag">Nguồn: ${(q.sources||[]).join(', ')}</span>
    </div>
  </div>`;
}
function renderLuyen(){
  if(!cur)return;
  renderResumeBanner();renderWeakFocusBar();
  const list=filteredQuestions();
  $('#luyenCount').textContent=list.length+' câu';
  if(luyenShown===0)luyenShown=PAGE;
  if(luyenShown>list.length)luyenShown=Math.max(PAGE,list.length);
  const slice=list.slice(0,luyenShown);
  $('#qList').innerHTML=slice.map((q,i)=>qCardHTML(q,i+1)).join('')||'<div class="empty">Không có câu hỏi phù hợp bộ lọc.</div>';
  bindLuyenOpts();restoreLuyenState();
  if(cur&&P){sess().luyen.shown=luyenShown;}
  $('#moreBtn').style.display=luyenShown<list.length?'inline-block':'none';
}
/* chỉ tô màu + chèn giải thích, KHÔNG ghi thống kê — dùng cả khi khôi phục phiên */
function paintAnswer(qEl,chosen){
  const id=+qEl.dataset.id;const q=DB.find(x=>x.id===id);if(!q)return;const ans=ansOf(q);
  qEl.querySelectorAll('.opt').forEach(o=>{
    o.classList.remove('correct','wrong','chosen');
    if(o.dataset.k===ans)o.classList.add('correct');
    if(chosen&&o.dataset.k===chosen&&chosen!==ans)o.classList.add('wrong');
  });
  if(!qEl.querySelector('.explain')){
    const low=confOf(q)==='low';
    const div=document.createElement('div');div.className='explain'+(low?' lowconf':'');
    div.innerHTML=`<b>Đáp án: ${ans})</b> ${qBadges(q)}${noteEdited(q)?' <span class="badge b-amber">Đã điều chỉnh</span>':''}<br>${esc(noteOf(q))}`;
    qEl.querySelector('.qfoot').before(div);
  }
}
function revealAnswer(qEl,silent,chosen){
  const id=+qEl.dataset.id;const q=DB.find(x=>x.id===id);if(!q)return;const ans=ansOf(q);
  if(chosen){
    const st=P.stats[id]||{seen:0,correct:0,wrong:0};st.seen++;chosen===ans?st.correct++:st.wrong++;
    P.stats[id]=st;saveProg('stats');
  }
  if(qEl.closest('#qList')){ // chỉ ghi nhớ trong tab Luyện đề
    const l=sess().luyen;
    if(chosen)l.picked[id]=chosen;
    if(!l.revealed.includes(id))l.revealed.push(id);
    l.shown=luyenShown;l.filters=luyenFilterState();
    if(!silent){l.last=id;l.ts=Date.now();}   // "Hiện tất cả"/khôi phục không đổi câu gần nhất
    saveSession();
    if(chosen){
      P.resume={qid:id,topic:$('#fTopic').value.replace(/ \(\d+\)$/,''),conf:$('#fConf').value,search:$('#fSearch').value.trim(),bm:$('#fBookmark').checked,ts:Date.now()};
      saveProg('resume');renderResumeBanner();
    }
  }
  paintAnswer(qEl,chosen);
}
function toggleBookmark(id,btn){
  const i=P.bookmarks.indexOf(id);
  if(i>=0){P.bookmarks.splice(i,1);btn.textContent='☆ Đánh dấu';}else{P.bookmarks.push(id);btn.textContent='★ Bỏ đánh dấu';}
  saveProg('bookmarks');
}
function editAnswer(id){
  if(!isAdmin()){toast('Chỉ quản trị viên mới được sửa đáp án. Bạn hãy dùng nút “💬 Góp ý đáp án”.');return;}
  const q=DB.find(x=>x.id===id);if(!q)return;
  const keys=q.options.map(o=>o.key).join('/');
  const v=prompt(`Sửa đáp án đúng cho câu này (${keys}):`,ansOf(q));
  if(v&&q.options.some(o=>o.key===v.trim().toLowerCase())){
    const key=v.trim().toLowerCase();
    // cho phép sửa luôn chú thích đáp án nếu phát hiện sai
    const note=prompt('Sửa chú thích đáp án (để nguyên nếu không cần sửa, Cancel để giữ):',noteOf(q));
    const ov={a:key};
    if(note!==null&&note.trim()&&note.trim()!==(q.answerNote||'').trim())ov.note=note.trim();
    else if(noteEdited(q)&&note===null)ov.note=P.overrides[id].note; // Cancel: giữ chú thích đã sửa trước đó
    P.overrides[id]=ov;saveProg('overrides');toast('Đã lưu đáp án của bạn cho câu '+id);
    // update only this card in place so other questions keep their revealed state
    const qEl=$(`#qList .q[data-id="${id}"]`);
    if(qEl&&qEl.querySelector('.explain')){
      qEl.querySelector('.explain').remove();
      qEl.querySelectorAll('.opt').forEach(o=>o.classList.remove('correct','wrong','chosen'));
      revealAnswer(qEl,true);
    }
  }else if(v!==null){toast('Đáp án không hợp lệ.');}
}

/* ============ THI ============ */
let exam=null,examTimer=null;
function stratifiedSample(n){
  let pool=DB.slice();
  const byTopic={};pool.forEach(q=>{(byTopic[q.topic]=byTopic[q.topic]||[]).push(q);});
  const topics=Object.keys(byTopic);
  let picked=[];
  topics.forEach(t=>{
    const k=Math.max(1,Math.round(n*byTopic[t].length/pool.length));
    picked=picked.concat(shuffle(byTopic[t]).slice(0,k));
  });
  picked=shuffle(picked);
  if(picked.length>n)picked=picked.slice(0,n);
  else if(picked.length<n){
    const have=new Set(picked.map(q=>q.id));
    for(const q of shuffle(pool)){if(picked.length>=n)break;if(!have.has(q.id)){picked.push(q);have.add(q.id);}}
  }
  return shuffle(picked);
}
$('#startExam').onclick=()=>{
  if(!DB.length){toast('Môn này chưa có câu hỏi.');return;}
  const n=Math.min(Math.min(200,DB.length),Math.max(5,+$('#exNum').value||50));
  const pass=Math.min(100,Math.max(1,+$('#exPass').value||70));
  const useTimer=$('#exTimer').checked, mins=+$('#exMin').value||60;
  const qs=stratifiedSample(n);
  exam={qs,answers:{},pass,start:Date.now(),useTimer,deadline:Date.now()+mins*60000};
  $('#examIntro').style.display='none';$('#examResult').style.display='none';$('#examResumeBar').innerHTML='';
  $('#examRun').style.display='block';renderExam();saveExam();
  if(useTimer){clearInterval(examTimer);examTimer=setInterval(tickTimer,1000);}
  window.scrollTo({top:0,behavior:'smooth'});
};
/* ---- giữ bài thi đang làm dở ---- */
function saveExam(){
  if(!cur||!P)return;
  const s=sess();
  if(!exam){s.exam=null;saveSession(true);return;}
  s.exam={qids:exam.qs.map(q=>q.id),answers:exam.answers,pass:exam.pass,useTimer:exam.useTimer,
    left:exam.useTimer?Math.max(0,exam.deadline-Date.now()):0,elapsed:Date.now()-exam.start,ts:Date.now()};
  saveSession(true);
}
function pendingExam(){
  const e=cur&&P?sess().exam:null;
  if(!e||!Array.isArray(e.qids)||!e.qids.length)return null;
  if(e.useTimer&&e.left<=0)return null;
  return e;
}
function renderExamResumeBar(){
  const bar=$('#examResumeBar');if(!bar)return;
  const e=exam?null:pendingExam();
  if(!e){bar.innerHTML='';return;}
  const done=Object.keys(e.answers||{}).length;
  bar.innerHTML=`<div class="resume-banner">
    <div>🎯 Bạn có <b>bài thi đang làm dở</b>: ${done}/${e.qids.length} câu${e.useTimer?` · còn <b>${Math.floor(e.left/60000)} phút</b>`:''} · ${timeAgo(e.ts)}</div>
    <div class="rb-actions">
      <button class="btn btn-pri" onclick="resumeExam()">▶ Làm tiếp</button>
      <button class="btn btn-sec" onclick="discardExam()">✕ Bỏ bài này</button>
    </div>
  </div>`;
}
function resumeExam(){
  const e=pendingExam();
  if(!e){toast('Không còn bài thi nào đang dở.');renderExamResumeBar();return;}
  const qs=e.qids.map(id=>DB.find(q=>q.id===id)).filter(Boolean);
  if(!qs.length){discardExam();return;}
  exam={qs,answers:Object.assign({},e.answers||{}),pass:e.pass||70,start:Date.now()-(e.elapsed||0),
    useTimer:!!e.useTimer,deadline:Date.now()+(e.left||0)};
  $('#examIntro').style.display='none';$('#examResult').style.display='none';$('#examResumeBar').innerHTML='';
  $('#examRun').style.display='block';renderExam();
  qs.forEach(q=>{const k=exam.answers[q.id];if(!k)return;
    const o=document.querySelector('#examRun .q[data-id="'+q.id+'"] .opt[data-k="'+k+'"]');if(o)o.classList.add('chosen');});
  $('#exProg').textContent=`Đã trả lời ${Object.keys(exam.answers).length}/${qs.length}`;
  if(exam.useTimer){clearInterval(examTimer);examTimer=setInterval(tickTimer,1000);tickTimer();}
  switchTab('thi');window.scrollTo({top:0,behavior:'smooth'});
}
function discardExam(){
  if(!cur||!P)return;
  sess().exam=null;saveSession(true);renderExamResumeBar();toast('Đã bỏ bài thi đang dở.');
}
function renderExam(){
  const e=exam;
  $('#examRun').innerHTML=`
    <div class="exam-bar">
      <span class="prog" id="exProg">Đã trả lời 0/${e.qs.length}</span>
      ${e.useTimer?'<span class="timer" id="exTime">--:--</span>':''}
      <button class="btn btn-sec" id="submitExam">Nộp bài</button>
    </div>
    ${e.qs.map((q,i)=>`
      <div class="q" data-id="${q.id}">
        <div class="qhead"><span class="qnum">Câu ${i+1}/${e.qs.length}</span><span class="qtopic badge b-blue">${esc(q.topic)}</span></div>
        <div class="stem">${esc(q.stem)}</div>
        <ul class="opts">${q.options.map(o=>`<li class="opt" data-k="${o.key}" role="button" tabindex="0" data-activate onclick="pickExam(${q.id},'${o.key}',this)"><span class="k">${o.key})</span><span>${esc(o.text)}</span></li>`).join('')}</ul>
      </div>`).join('')}
    <div style="text-align:center;margin:10px 0 30px"><button class="btn btn-pri" id="submitExam2" style="padding:13px 34px;font-size:16px">Nộp bài &amp; chấm điểm</button></div>`;
  $('#submitExam').onclick=submitExam;$('#submitExam2').onclick=submitExam;
}
function pickExam(id,k,el){
  exam.answers[id]=k;
  el.parentElement.querySelectorAll('.opt').forEach(o=>o.classList.remove('chosen'));el.classList.add('chosen');
  $('#exProg').textContent=`Đã trả lời ${Object.keys(exam.answers).length}/${exam.qs.length}`;
  saveExam();
}
function tickTimer(){
  if(!exam){clearInterval(examTimer);return;}
  const left=Math.max(0,exam.deadline-Date.now());
  const m=Math.floor(left/60000),s=Math.floor((left%60000)/1000);
  const el=$('#exTime');if(el)el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  if(left>0&&s%10===0)saveExam();   // định kỳ ghi lại thời gian còn lại
  if(left<=0){clearInterval(examTimer);toast('Hết giờ! Tự động nộp bài.');submitExam();}
}
function submitExam(){
  if(examTimer)clearInterval(examTimer);
  const e=exam;let correct=0;
  if(cur&&P){sess().exam=null;saveSession(true);}   // nộp rồi thì không còn bài dở
  e.qs.forEach(q=>{const a=ansOf(q);const u=e.answers[q.id];if(u===a)correct++;
    const st=P.stats[q.id]||{seen:0,correct:0,wrong:0};st.seen++;u===a?st.correct++:st.wrong++;P.stats[q.id]=st;});
  saveProg('stats');
  const total=e.qs.length,pct=Math.round(correct/total*1000)/10,passed=pct>=e.pass;
  const dur=Math.round((Date.now()-e.start)/1000);
  P.history.unshift({date:Date.now(),correct,total,pct,pass:passed,dur});if(P.history.length>100)P.history.pop();saveProg('history');
  $('#examRun').style.display='none';$('#examResult').style.display='block';
  $('#examResult').innerHTML=`
    <div class="result-banner ${passed?'pass':'fail'}">
      <div class="score">${correct}/${total}</div>
      <div class="lbl">${pct}% — ${passed?'✅ ĐẠT':'❌ CHƯA ĐẠT'} (ngưỡng ≥ ${e.pass}%)</div>
      <div style="font-size:13px;opacity:.9;margin-top:6px">Thời gian: ${Math.floor(dur/60)}p${dur%60}s • ${new Date().toLocaleString('vi-VN')}</div>
    </div>
    <div class="controls" style="justify-content:center">
      <button class="btn btn-pri" onclick="resetExamView()">Thi lại</button>
      <button class="btn btn-sec" id="toggleReview">Xem lại bài làm</button>
    </div>
    <div id="reviewWrap"></div>`;
  $('#toggleReview').onclick=()=>{const w=$('#reviewWrap');if(w.innerHTML){w.innerHTML='';return;}
    w.innerHTML=e.qs.map((q,i)=>{const a=ansOf(q),u=e.answers[q.id];
      return `<div class="q"><div class="qhead"><span class="qnum">Câu ${i+1}</span><span>${u===a?'<span class="badge b-green">Đúng</span>':'<span class="badge b-red">Sai</span>'} ${qBadges(q)}</span></div>
      <div class="stem">${esc(q.stem)}</div>
      <ul class="opts">${q.options.map(o=>{let cls='opt';if(o.key===a)cls+=' correct';if(o.key===u&&u!==a)cls+=' wrong';return `<li class="${cls}"><span class="k">${o.key})</span><span>${esc(o.text)}</span></li>`;}).join('')}</ul>
      <div class="explain"><b>Đáp án: ${a})</b>${noteEdited(q)?' <span class="badge b-amber">Đã điều chỉnh</span>':''}<br>${esc(noteOf(q))}</div></div>`;
    }).join('');};
  window.scrollTo({top:0,behavior:'smooth'});
}
function resetExamView(keepPending){
  if(examTimer)clearInterval(examTimer);examTimer=null;exam=null;
  if(!keepPending&&cur&&P){sess().exam=null;saveSession(true);}
  $('#examRun').style.display='none';$('#examRun').innerHTML='';
  $('#examResult').style.display='none';$('#examResult').innerHTML='';
  $('#examIntro').style.display='block';
  renderExamResumeBar();
}

/* ============ TIEN DO (per subject) ============ */
function renderProgress(){
  if(!cur)return;
  const attempts=P.history.length,best=P.history.reduce((m,h)=>Math.max(m,h.pct),0),
    passes=P.history.filter(h=>h.pass).length,
    practiced=Object.keys(P.stats).length;
  $('#statGrid').innerHTML=`
    <div class="stat"><div class="v">${attempts}</div><div class="l">Lượt thi thử</div></div>
    <div class="stat"><div class="v">${best}%</div><div class="l">Điểm cao nhất</div></div>
    <div class="stat"><div class="v">${attempts?Math.round(passes/attempts*100):0}%</div><div class="l">Tỉ lệ đạt</div></div>
    <div class="stat"><div class="v">${practiced}/${DB.length}</div><div class="l">Câu đã luyện</div></div>`;
  $('#histWrap').innerHTML=P.history.length?`<table class="hist"><tr><th>Thời gian</th><th>Điểm</th><th>%</th><th>Kết quả</th><th>TG</th></tr>`+
    P.history.map(h=>`<tr><td>${new Date(h.date).toLocaleString('vi-VN')}</td><td>${h.correct}/${h.total}</td><td>${h.pct}%</td>
    <td>${h.pass?'<span class="badge b-green">Đạt</span>':'<span class="badge b-red">Chưa đạt</span>'}</td><td>${Math.floor(h.dur/60)}p${h.dur%60}s</td></tr>`).join('')+`</table>`
    :'<div class="empty">Chưa có lượt thi nào. Hãy vào tab "Thi thử".</div>';
  const weak=weakEntries();
  const rb=$('#weakRedoBtn');if(rb)rb.style.display=weak.length?'inline-block':'none';
  $('#weakWrap').innerHTML=weak.length?weak.map(([id,s])=>{const q=DB.find(x=>x.id===+id);if(!q)return'';
    return `<div style="padding:8px 0;border-bottom:1px solid var(--line);font-size:13.5px">
      <span class="badge b-red">Sai ${s.wrong}/${s.seen}</span> ${esc(q.stem.slice(0,90))}${q.stem.length>90?'…':''}</div>`;}).join('')
    :'<div class="empty">Chưa có dữ liệu. Làm bài để theo dõi câu hay sai.</div>';
}
$('#resetBtn').onclick=()=>{if(!cur)return;
  if(confirm(`Xóa toàn bộ tiến độ môn "${cur.name}" (lịch sử thi, thống kê, đánh dấu, đáp án đã sửa)?`)){
    PROG_KEYS.forEach(k=>LS.del(cur.id+'_'+k));
    P=loadProg(cur.id);luyenShown=0;
    resetExamView();renderProgress();renderLuyen();toast('Đã xóa tiến độ môn này.');
  }};

/* ============ EXPORT / IMPORT (all subjects) ============ */
$('#exportBtn').onclick=()=>{
  if(cur&&P)saveProg('session');   // ghi nốt phiên đang mở trước khi xuất
  const progress={};
  SUBJECTS.forEach(s=>{
    const p=loadProg(s.id);
    if(p.history.length||Object.keys(p.stats).length||Object.keys(p.overrides).length||p.bookmarks.length||p.resume||p.session)progress[s.id]=p;
  });
  const data={app:'OnTapCCCM',version:2,exportedAt:new Date().toISOString(),progress,feedback:FB.all()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=u;
  a.download='tien-do-on-tap-cccm-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();URL.revokeObjectURL(u);
  toast('Đã xuất tiến độ '+Object.keys(progress).length+' môn.');
};
$('#importBtn').onclick=()=>$('#importFile').click();
$('#importFile').addEventListener('change',ev=>{
  const f=ev.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const data=JSON.parse(rd.result);
      let prog=null;
      if(data.app==='OnTapCCCM'&&data.progress)prog=data.progress;           // v2
      else if(data.history&&data.stats)prog={coban:{history:data.history,stats:data.stats,overrides:data.overrides||{},bookmarks:data.bookmarks||[]}}; // v1 cũ
      if(!prog)throw new Error('format');
      const sids=Object.keys(prog).filter(sid=>SUBJECTS.some(s=>s.id===sid));
      if(!sids.length)throw new Error('empty');
      const names=sids.map(sid=>SUBJECTS.find(s=>s.id===sid).name).join(', ');
      if(!confirm(`Nhập tiến độ cho ${sids.length} môn (${names})?\nTiến độ hiện có của các môn này trên máy sẽ bị THAY THẾ.`))return;
      sids.forEach(sid=>{
        const p=prog[sid];
        LS.set(sid+'_history',p.history||[]);LS.set(sid+'_stats',p.stats||{});
        LS.set(sid+'_overrides',p.overrides||{});LS.set(sid+'_bookmarks',p.bookmarks||[]);
        if(p.resume)LS.set(sid+'_resume',p.resume);else LS.del(sid+'_resume');
        if(p.session)LS.set(sid+'_session',p.session);else LS.del(sid+'_session');
      });
      if(Array.isArray(data.feedback)&&data.feedback.length){
        const list=FB.all(),have=new Set(list.map(i=>i.id));
        data.feedback.forEach(i=>{if(i&&i.id&&!have.has(i.id)){list.push(i);have.add(i.id);}});
        list.sort((a,b)=>b.ts-a.ts);FB.save(list);
      }
      renderHome();toast('Đã nhập tiến độ '+sids.length+' môn.');
    }catch(e){alert('File không đúng định dạng tiến độ của app này.');}
    ev.target.value='';
  };
  rd.readAsText(f,'utf-8');
});
$('#resetAllBtn').onclick=()=>{
  if(confirm('Xóa tiến độ của TẤT CẢ các môn trên máy này? (Nên xuất file sao lưu trước)')){
    SUBJECTS.forEach(s=>PROG_KEYS.forEach(k=>LS.del(s.id+'_'+k)));
    renderHome();toast('Đã xóa toàn bộ tiến độ.');
  }};

/* ============ GÓP Ý ĐÁP ÁN ============
   Ai cũng gửi được góp ý (nội dung dài tuỳ ý). Góp ý luôn được lưu trên máy trước,
   sau đó cố gửi lên FEEDBACK_URL (Google Apps Script). Gửi hỏng thì nằm hàng đợi,
   tự gửi lại lần sau; hoặc người dùng xuất file / chép nội dung gửi tay cho admin. */
const FB={
  all:()=>{const v=LS.get('feedback',[]);return Array.isArray(v)?v:[];},
  save:list=>LS.set('feedback',list),
  find:id=>FB.all().find(x=>x.id===id)
};
/* ---- hộp thoại chung ---- */
function closeModal(){$('#modalHost').innerHTML='';document.documentElement.style.overflow='';}
function openModal(html){
  $('#modalHost').innerHTML=`<div class="modal-bg" onclick="if(event.target===this)closeModal()">
    <div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  document.documentElement.style.overflow='hidden';
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#modalHost').innerHTML)closeModal();});

/* ---- viết góp ý cho 1 câu ---- */
function openFeedback(id){
  const q=DB.find(x=>x.id===id);if(!q||!cur)return;
  const radios=q.options.map(o=>`<label><input type="radio" name="fbSug" value="${o.key}"> ${o.key})</label>`).join('')
    +`<label><input type="radio" name="fbSug" value="" checked> Chưa chắc / góp ý khác</label>`;
  openModal(`<h3>💬 Góp ý về đáp án — câu #${q.id}</h3>
    <p class="sub">${esc(cur.name)} · chủ đề “${esc(q.topic)}” · đáp án app đang để: <b>${ansOf(q)})</b></p>
    <div class="qprev">${esc(q.stem)}

${q.options.map(o=>esc(o.key+') '+o.text)).join('\n')}</div>
    <label class="fl">Theo bạn đáp án đúng là</label>
    <div class="ansopt">${radios}</div>
    <label class="fl" for="fbBody">Nội dung góp ý — nêu căn cứ, điều luật, cách tính… (viết dài thoải mái)</label>
    <textarea id="fbBody" maxlength="${FEEDBACK_MAX}" placeholder="Ví dụ: Theo Điều 145 Luật Doanh nghiệp 2020, điều kiện họp ĐHĐCĐ lần 1 là trên 50% tổng số phiếu biểu quyết, không phải 51% như giải thích trong app…"></textarea>
    <div class="cc" id="fbCC">0/${FEEDBACK_MAX}</div>
    <div class="mrow">
      <button class="btn btn-ghost" onclick="closeModal()">Huỷ</button>
      <button class="btn btn-pri" onclick="submitFeedback(${q.id})">Gửi góp ý</button>
    </div>`);
  const ta=$('#fbBody');
  ta.addEventListener('input',()=>{$('#fbCC').textContent=ta.value.length+'/'+FEEDBACK_MAX;});
  ta.focus();
}
function submitFeedback(id){
  const q=DB.find(x=>x.id===id);if(!q||!cur)return;
  const body=$('#fbBody').value.trim();
  const picked=document.querySelector('input[name=fbSug]:checked');
  const sug=picked?picked.value:'';
  if(!body&&!sug){toast('Hãy chọn đáp án bạn cho là đúng hoặc viết nội dung góp ý.');return;}
  const item={id:'fb'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),
    sid:cur.id,sname:cur.name,qid:q.id,qstem:q.stem.slice(0,400),
    cur:ansOf(q),sug,body,user:AUTH.user||'(không đăng nhập)',name:AUTH.name||'',
    ts:Date.now(),sent:false,done:false};
  const list=FB.all();list.unshift(item);FB.save(list);
  closeModal();
  sendFeedback([item]).then(n=>{
    toast(n?('Đã gửi góp ý câu '+q.id+'. Cảm ơn bạn!')
           :('Đã lưu góp ý câu '+q.id+' trên máy'+(FEEDBACK_URL?' — sẽ tự gửi lại khi có mạng.':'. Hãy xuất file gửi cho người quản trị.')));
    renderFeedbackCard();
  });
}
/* ---- gửi lên Google Apps Script ---- */
function sendFeedback(items){
  if(!FEEDBACK_URL||!items.length)return Promise.resolve(0);
  return fetch(FEEDBACK_URL,{method:'POST',mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({app:'OnTapCCCM',sentAt:new Date().toISOString(),items})})
    .then(()=>{const ids=new Set(items.map(i=>i.id)),list=FB.all();
      list.forEach(i=>{if(ids.has(i.id))i.sent=true;});FB.save(list);return items.length;})
    .catch(()=>0);
}
function retryFeedback(quiet){
  const pending=FB.all().filter(i=>!i.sent);
  if(!pending.length){if(!quiet)toast('Không có góp ý nào đang chờ gửi.');return;}
  if(!FEEDBACK_URL){if(!quiet)toast('App chưa cấu hình nơi nhận góp ý — hãy dùng “Xuất file góp ý”.');return;}
  sendFeedback(pending).then(n=>{renderFeedbackCard();
    if(!quiet)toast(n?('Đã gửi '+n+' góp ý.'):'Chưa gửi được — kiểm tra kết nối mạng rồi thử lại.');});
}
/* ---- xuất / chép để gửi tay ---- */
function fbAsText(list){
  return list.map(i=>`— Môn: ${i.sname} | Câu #${i.qid} | Đáp án app: ${i.cur}) | Đề xuất: ${i.sug?i.sug+')':'(không nêu)'}
  Người góp ý: ${i.name||i.user} · ${new Date(i.ts).toLocaleString('vi-VN')}
  Đề bài: ${i.qstem}
  Nội dung: ${i.body||'(không có)'}`).join('\n\n');
}
function fbExport(){
  const list=FB.all();
  if(!list.length){toast('Chưa có góp ý nào.');return;}
  const data={app:'OnTapCCCM-GopY',version:1,exportedAt:new Date().toISOString(),
    user:AUTH.user,name:AUTH.name,items:list};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download='gop-y-on-tap-cccm-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  URL.revokeObjectURL(u);toast('Đã xuất '+list.length+' góp ý ra file.');
}
function fbCopy(){
  const list=FB.all();
  if(!list.length){toast('Chưa có góp ý nào.');return;}
  const txt='GÓP Ý ĐÁP ÁN — ÔN TẬP CCCM\nNgười gửi: '+(AUTH.name||AUTH.user||'(không đăng nhập)')+'\n\n'+fbAsText(list);
  const ta=document.createElement('textarea');
  ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);
  ta.select();
  let ok=false;try{ok=document.execCommand('copy');}catch(e){}
  document.body.removeChild(ta);
  if(ok){toast('Đã chép '+list.length+' góp ý — dán vào Zalo/email gửi người quản trị.');return;}
  if(navigator.clipboard)navigator.clipboard.writeText(txt)
    .then(()=>toast('Đã chép '+list.length+' góp ý.'))
    .catch(()=>toast('Trình duyệt chặn chép tự động — hãy dùng “Xuất file góp ý”.'));
  else toast('Trình duyệt chặn chép tự động — hãy dùng “Xuất file góp ý”.');
}
/* ---- thẻ góp ý ở màn hình chính ---- */
function renderFeedbackCard(){
  const el=$('#fbCard');if(!el)return;
  const list=FB.all(),pend=list.filter(i=>!i.sent).length;
  let h='<h3 style="margin:0 0 8px">💬 Góp ý đáp án</h3>';
  if(isAdmin()){
    h+=`<p style="font-size:13.5px;color:var(--muted);margin:0 0 12px">Góp ý gửi qua mạng nằm ở Google Sheet của bạn. Với góp ý người dùng gửi tay bằng file, bấm <b>Nhập file góp ý</b> để xem và áp thẳng thành đáp án.</p>
    <div class="io-row">
      <button class="btn btn-sec" id="fbImportBtn">📥 Nhập file góp ý</button>
      <input type="file" id="fbImportFile" accept=".json,application/json" style="display:none">
      ${list.length?`<span class="count-pill">${list.length} góp ý</span><button class="btn btn-ghost" id="fbClearBtn">🗑️ Xoá danh sách</button>`:''}
    </div>`;
  }else{
    h+=`<p style="font-size:13.5px;color:var(--muted);margin:0 0 12px">Thấy đáp án chưa đúng? Bấm <b>💬 Góp ý đáp án</b> ngay dưới câu hỏi ở tab Luyện đề. Góp ý sẽ được chuyển tới người quản trị xem xét — bạn không sửa trực tiếp đáp án được.${FEEDBACK_URL?'':' <b>Bản này chưa nối với hệ thống nhận góp ý</b>, hãy bấm “Xuất file góp ý” (hoặc “Chép nội dung”) rồi gửi cho người quản trị qua Zalo/email.'}</p>
    <div class="io-row">
      <span class="count-pill">${list.length} góp ý đã viết${FEEDBACK_URL&&pend?' · '+pend+' chờ gửi':''}</span>
      ${pend&&FEEDBACK_URL?'<button class="btn btn-pri" id="fbRetryBtn">📤 Gửi lại góp ý đang chờ</button>':''}
      ${list.length?'<button class="btn btn-sec" id="fbExportBtn">⬇️ Xuất file góp ý</button><button class="btn btn-sec" id="fbCopyBtn">📋 Chép nội dung</button>':''}
    </div>`;
  }
  h+='<div id="fbList" style="margin-top:14px"></div>';
  el.innerHTML=h;
  const on=(sel,fn)=>{const b=$(sel);if(b)b.onclick=fn;};
  on('#fbImportBtn',()=>$('#fbImportFile').click());
  on('#fbClearBtn',()=>{if(confirm('Xoá toàn bộ danh sách góp ý đang lưu trên máy này?')){FB.save([]);renderFeedbackCard();toast('Đã xoá danh sách góp ý.');}});
  on('#fbRetryBtn',()=>retryFeedback());
  on('#fbExportBtn',fbExport);
  on('#fbCopyBtn',fbCopy);
  const inp=$('#fbImportFile');
  if(inp)inp.addEventListener('change',ev=>{
    const f=ev.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{
      try{
        const d=JSON.parse(rd.result);
        if(d.app!=='OnTapCCCM-GopY'||!Array.isArray(d.items))throw new Error('format');
        const list=FB.all(),have=new Set(list.map(i=>i.id));
        let added=0;
        d.items.forEach(i=>{if(i&&i.id&&!have.has(i.id)){list.push(i);have.add(i.id);added++;}});
        list.sort((a,b)=>b.ts-a.ts);FB.save(list);renderFeedbackCard();
        toast(added?('Đã nhập '+added+' góp ý mới.'):'File không có góp ý nào mới.');
      }catch(e){alert('File không đúng định dạng góp ý của app này.');}
      ev.target.value='';
    };
    rd.readAsText(f,'utf-8');
  });
  renderFeedbackList();
}
function renderFeedbackList(){
  const el=$('#fbList');if(!el)return;
  const list=FB.all();
  if(!list.length){el.innerHTML='';return;}
  el.innerHTML=list.map(i=>`<div class="fb-item${i.done?' fb-done':''}">
    <div class="fb-meta">
      <span class="badge b-blue">${esc(i.sname||i.sid)}</span>
      <b>Câu #${i.qid}</b>
      <span>đáp án app <b>${esc(i.cur||'?')})</b> → đề xuất <b>${i.sug?esc(i.sug)+')':'(không nêu)'}</b></span>
      ${isAdmin()?`<span>· ${esc(i.name||i.user||'')}</span>`:''}
      <span>· ${new Date(i.ts).toLocaleString('vi-VN')}</span>
      ${i.sent?'<span class="badge b-green">Đã gửi</span>':(FEEDBACK_URL?'<span class="badge b-amber">Chờ gửi</span>':'<span class="badge b-gray">Lưu trên máy</span>')}
      ${i.done?'<span class="badge b-gray">Đã xử lý</span>':''}
    </div>
    <div class="fb-body">${esc(i.body||'(không có nội dung)')}</div>
    <div class="fb-act">
      ${isAdmin()&&i.sug&&!i.done?`<button class="btn-mini" onclick="fbApply('${i.id}')">✔ Áp thành đáp án ${esc(i.sug)})</button>`:''}
      ${isAdmin()?`<button class="btn-mini" onclick="fbToggleDone('${i.id}')">${i.done?'↩ Bỏ đánh dấu':'☑ Đã xử lý'}</button>`:''}
      <button class="btn-mini" onclick="fbDelete('${i.id}')">🗑️ Xoá</button>
    </div>
  </div>`).join('');
}
function fbToggleDone(fid){
  const list=FB.all(),it=list.find(x=>x.id===fid);if(!it)return;
  it.done=!it.done;FB.save(list);renderFeedbackList();
}
function fbDelete(fid){
  const list=FB.all().filter(x=>x.id!==fid);FB.save(list);renderFeedbackCard();
}
/* admin: áp góp ý thành đáp án của môn tương ứng (ghi vào overrides) */
async function fbApply(fid){
  if(!isAdmin())return;
  const it=FB.find(fid);if(!it||!it.sug)return;
  const sub=SUBJECTS.find(s=>s.id===it.sid);
  let d=null;if(sub){try{d=await Content.load(it.sid);}catch(e){console.error(e);}}
  if(!sub||!d){toast('Không tìm thấy môn của góp ý này.');return;}
  const q=d.questions.find(x=>x.id===it.qid);
  if(!q){toast('Không tìm thấy câu #'+it.qid+' trong môn '+sub.name);return;}
  if(!q.options.some(o=>o.key===it.sug)){toast('Đáp án đề xuất không hợp lệ.');return;}
  if(!confirm(`Đặt đáp án câu #${it.qid} (${sub.name}) thành "${it.sug})"?`))return;
  const ov=LS.get(it.sid+'_overrides',{});
  const oldNote=(ov[it.qid]&&typeof ov[it.qid]==='object'&&ov[it.qid].note)?ov[it.qid].note:(q.answerNote||'');
  ov[it.qid]={a:it.sug,note:(oldNote+'\n\n[Điều chỉnh theo góp ý của '+(it.name||it.user||'người dùng')+']: '+(it.body||'')).trim()};
  LS.set(it.sid+'_overrides',ov);
  if(cur&&cur.id===it.sid){P.overrides=ov;renderLuyen();}
  const list=FB.all(),x=list.find(y=>y.id===fid);if(x)x.done=true;FB.save(list);
  renderFeedbackList();
  toast('Đã đặt đáp án '+it.sug+') cho câu #'+it.qid+' — môn '+sub.name);
}

/* ============ keyboard activation for role=button divs/li ============ */
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const el=e.target.closest('[data-activate]');
  if(el){e.preventDefault();el.click();}
});

/* ============ giữ lại phiên khi đóng/ẩn tab ============ */
function flushSession(){
  if(!cur||!P)return;
  if(exam)saveExam();else saveProg('session');
}
window.addEventListener('beforeunload',flushSession);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSession();});

/* ============ init ============ */
applyAuth();
retryFeedback(true);
