/* TẠM THỜI — cổng đăng nhập phía trình duyệt của bản cũ. KHÔNG phải cơ chế bảo mật thật:
   danh sách tài khoản nằm ngay trong file này. Sẽ bị xoá và thay bằng Supabase Auth ở cấu phần 3. */
/* ================= CỔNG ĐĂNG NHẬP (tự động chèn bởi capnhat-taikhoan.ps1) ================= */
const AUTH_SALT="756733e504662dc35ace6e6636061e3a";
const ACCOUNTS=[{"u":"tuan.nt","h":"a5608ca426bdc719839cc31959228ba9f9f8e5839cf93a90e528cdfd46e95f10","n":"Nguyền Trần Tuấn","e":"","r":"user"},{"u":"thanh.nnt","h":"0ef1640799955a86db6b183fc6d70c27c7277a08991c4cfd15133e714aed4dd8","n":"Nguyễn Ngọc Trang Thanh","e":"","r":"user"},{"u":"kiet.tt","h":"e4047ced1ce5c3d4f794f6ddccc9fb917654d445402823235ee1c5fec5f94da6","n":"Tuấn Kiệt","e":"","r":"admin"},{"u":"tuyet.bt","h":"035710842f22b60966241ed242a94640799a93002adeba51d464cfadea189eff","n":"Bùi Thị Tuyết","e":"","r":"user"},{"u":"maianh","h":"f3c0dd50d3430a516fece6fe8e270f416c8c00c2fb0d1ab374d13d667ea61b7e","n":"Nguyễn Thị Mai Anh","e":"","r":"user"}];
function __utf8(s){return unescape(encodeURIComponent(s));}
function __sha256(ascii){
  function R(v,a){return(v>>>a)|(v<<(32-a));}
  var mp=Math.pow,mw=mp(2,32),res='',i,j,words=[],bitLen=ascii.length*8;
  var hash=__sha256.h=__sha256.h||[],k=__sha256.k=__sha256.k||[],pc=k.length,comp={};
  for(var cand=2;pc<64;cand++){if(!comp[cand]){for(i=0;i<313;i+=cand){comp[i]=cand;}hash[pc]=(mp(cand,.5)*mw)|0;k[pc++]=(mp(cand,1/3)*mw)|0;}}
  ascii+='\x80';while(ascii.length%64-56)ascii+='\x00';
  for(i=0;i<ascii.length;i++){j=ascii.charCodeAt(i);if(j>>8)return'';words[i>>2]|=j<<((3-i)%4)*8;}
  words[words.length]=(bitLen/mw)|0;words[words.length]=bitLen;
  for(j=0;j<words.length;){
    var w=words.slice(j,j+=16),oh=hash;hash=hash.slice(0,8);
    for(i=0;i<64;i++){
      var w15=w[i-15],w2=w[i-2],a=hash[0],e=hash[4];
      var t1=hash[7]+(R(e,6)^R(e,11)^R(e,25))+((e&hash[5])^((~e)&hash[6]))+k[i]+(w[i]=i<16?w[i]:(w[i-16]+(R(w15,7)^R(w15,18)^(w15>>>3))+w[i-7]+(R(w2,17)^R(w2,19)^(w2>>>10)))|0);
      var t2=(R(a,2)^R(a,13)^R(a,22))+((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
      hash=[(t1+t2)|0].concat(hash);hash[4]=(hash[4]+t1)|0;
    }
    for(i=0;i<8;i++){hash[i]=(hash[i]+oh[i])|0;}
  }
  for(i=0;i<8;i++){for(j=3;j+1;j--){var b=(hash[i]>>(j*8))&255;res+=((b<16)?0:'')+b.toString(16);}}
  return res;
}
var __AUTHKEY='cccm_auth';
function __addLogout(acc){
  if(document.getElementById('__logoutBtn'))return;
  var nm=acc.n||acc.u||'';
  var isAd=acc.r==='admin';
  var who=nm?nm+(isAd?' · quản trị':''):'';
  var b=document.createElement('button');
  b.id='__logoutBtn';b.type='button';b.className='hdr-btn';
  var lbl='Đăng xuất'+(who?' ('+who+')':'');
  b.title=lbl;b.setAttribute('aria-label',lbl);
  /* hiện đầy đủ tên; riêng tài khoản quản trị gắn thêm chip "admin" */
  b.innerHTML='<span class="ico" aria-hidden="true">⎋</span>'
    +'<span class="lbl">'+esc(nm||'Đăng xuất')+'</span>'
    +(isAd?'<span class="role">admin</span>':'');
  b.onclick=function(){try{sessionStorage.removeItem(__AUTHKEY);}catch(e){}location.reload();};
  /* đặt cạnh nút sáng/tối trong header; nếu vì lý do gì không có thì mới rơi về body */
  var host=document.getElementById('hdrActions');
  if(host)host.insertBefore(b,host.firstChild);else document.body.appendChild(b);
}
function __authInit(boot){
  function unlock(acc){
    acc={u:acc.u||'',n:acc.n||'',r:(acc.r==='admin'?'admin':'user')};
    try{sessionStorage.setItem(__AUTHKEY,JSON.stringify(acc));}catch(e){}
    window.__CCCM_AUTH=acc;                       // app đọc để phân quyền sửa đáp án
    var g=document.getElementById('__loginGate');if(g&&g.parentNode)g.parentNode.removeChild(g);
    document.documentElement.style.overflow='';
    __addLogout(acc);boot();
  }
  var saved=null;try{saved=JSON.parse(sessionStorage.getItem(__AUTHKEY)||'null');}catch(e){}
  /* phiên cũ chỉ còn hợp lệ nếu tài khoản vẫn nằm trong danh sách của bản này */
  if(saved&&saved.u){
    var ok=null;
    for(var s=0;s<ACCOUNTS.length;s++){if(ACCOUNTS[s].u===saved.u){ok=ACCOUNTS[s];break;}}
    if(ok){unlock({u:ok.u,n:ok.n,r:ok.r});return;}
  }
  var st=document.createElement('style');
  st.textContent='#__loginGate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--vds-header-to),var(--vds-header-from));font-family:Segoe UI,Roboto,system-ui,Arial,sans-serif;padding:16px}'
+'#__loginGate .card{background:var(--vds-surface);border:1px solid var(--vds-border);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.45);width:100%;max-width:360px;padding:28px 26px;box-sizing:border-box}'
+'#__loginGate h2{margin:0 0 2px;font-size:20px;color:var(--vds-text-primary)}'
+'#__loginGate p.s{margin:0 0 16px;color:var(--vds-text-secondary);font-size:13px}'
+'#__loginGate label{display:block;font-size:12.5px;color:var(--vds-text-secondary);margin:12px 0 5px;font-weight:600}'
+'#__loginGate input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--vds-border);border-radius:9px;font-size:15px;background:var(--vds-input-bg);color:var(--vds-text-primary)}'
+'#__loginGate input:focus{outline:none;border-color:#00A54C;box-shadow:0 0 0 3px rgba(0,165,76,.18)}'
+'#__loginGate button{width:100%;margin-top:18px;padding:12px;border:0;border-radius:9px;background:#00A54C;color:#fff;font-size:15px;font-weight:700;cursor:pointer}'
+'#__loginGate button:hover{background:#008a3f}'
+'#__loginGate .err{color:var(--vds-red-text);font-size:13px;margin-top:12px;min-height:16px}'
+'#__loginGate .ft{margin-top:14px;color:var(--vds-text-tertiary);font-size:11.5px;text-align:center;line-height:1.5}'
+'#__loginGate #__gateTheme{position:fixed;top:16px;right:16px;width:40px;height:40px;margin:0;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.25);color:#fff;font-size:18px;font-weight:400;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}'
+'#__loginGate #__gateTheme:hover{background:rgba(0,0,0,.42)}';
  document.head.appendChild(st);
  var g=document.createElement('div');g.id='__loginGate';
  g.innerHTML='<form class="card" id="__lf" autocomplete="off">'
+'<h2>Ôn tập Chứng chỉ chuyên môn Chứng khoán</h2><p class="s">Power by TTK</p>'
+'<label for="__lu">Tài khoản</label><input id="__lu" type="text" autocomplete="off" spellcheck="false">'
+'<label for="__lp">Mật khẩu</label><input id="__lp" type="password" autocomplete="off">'
+'<button type="submit">Đăng nhập</button>'
+'<div class="err" id="__lerr"></div>'
+'<div class="ft">Chỉ dành cho người dùng được cấp tài khoản.<br>Phiên bản K1.26.008</div>'
+'</form>';
  document.body.appendChild(g);
  document.documentElement.style.overflow='hidden';
  var f=document.getElementById('__lf'),er=document.getElementById('__lerr');
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var u=document.getElementById('__lu').value.trim().toLowerCase();
    var p=document.getElementById('__lp').value.trim();
    if(!u||!p){er.textContent='Vui lòng nhập đầy đủ tài khoản và mật khẩu.';return;}
    var h=__sha256(__utf8(AUTH_SALT+'\n'+u+'\n'+p));
    var acc=null;
    for(var i=0;i<ACCOUNTS.length;i++){if(ACCOUNTS[i].u===u&&ACCOUNTS[i].h===h){acc=ACCOUNTS[i];break;}}
    if(!acc){er.textContent='Sai tài khoản hoặc mật khẩu.';return;}
    if(acc.e){var t=new Date();var td=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');if(td>acc.e){er.textContent='Tài khoản đã hết hạn ('+acc.e+').';return;}}
    unlock({u:acc.u,n:acc.n,r:acc.r});
  });
  /* nút sáng/tối ngay trên màn hình đăng nhập (header đang bị lớp phủ che) */
  var tb=document.createElement('button');tb.id='__gateTheme';tb.type='button';
  var paintGate=function(){
    var dark=document.documentElement.getAttribute('data-theme')==='dark';
    tb.textContent=dark?'☀️':'🌙';
    var l=dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối';
    tb.title=l;tb.setAttribute('aria-label',l);
  };
  tb.onclick=function(){
    var next=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
    document.documentElement.setAttribute('data-theme',next);
    try{localStorage.setItem('cccm_theme',next);}catch(e){}
    paintGate();
    if(typeof paintThemeBtn==='function')paintThemeBtn();
  };
  paintGate();g.appendChild(tb);
  document.getElementById('__lu').focus();
}
