/* ============ chuyển giao diện sáng / tối ============
   - Lựa chọn của người dùng lưu ở localStorage('cccm_theme') -> nhớ giữa các lần mở.
   - Chưa chọn lần nào thì bám theo cài đặt sáng/tối của hệ điều hành. */
var THEME_KEY='cccm_theme';
function currentTheme(){return document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';}
function paintThemeBtn(){
  var b=document.getElementById('themeBtn');if(!b)return;
  var dark=currentTheme()==='dark';
  var ico=b.querySelector('.ico')||b;
  ico.textContent=dark?'☀️':'🌙';
  var lbl=dark?'Chuyển sang giao diện sáng':'Chuyển sang giao diện tối';
  b.title=lbl;b.setAttribute('aria-label',lbl);
}
function setTheme(t,remember){
  document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'light');
  if(remember){try{localStorage.setItem(THEME_KEY,t);}catch(e){}}
  paintThemeBtn();
}
function toggleTheme(){
  var next=currentTheme()==='dark'?'light':'dark';
  setTheme(next,true);
  if(typeof toast==='function')toast(next==='dark'?'Đã bật giao diện tối 🌙':'Đã bật giao diện sáng ☀️');
}
(function(){
  var b=document.getElementById('themeBtn');
  if(b)b.addEventListener('click',toggleTheme);
  paintThemeBtn();
  /* chưa chọn thủ công -> đổi theo hệ điều hành ngay khi hệ điều hành đổi */
  if(window.matchMedia){
    var mq=window.matchMedia('(prefers-color-scheme: dark)');
    var onChange=function(e){
      var saved=null;try{saved=localStorage.getItem(THEME_KEY);}catch(err){}
      if(saved!=='light'&&saved!=='dark')setTheme(e.matches?'dark':'light',false);
    };
    if(mq.addEventListener)mq.addEventListener('change',onChange);
    else if(mq.addListener)mq.addListener(onChange);
  }
})();
