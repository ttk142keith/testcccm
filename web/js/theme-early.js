/* Áp theme NGAY trước khi body vẽ -> không bị chớp trắng khi đang ở nền tối.
   Thứ tự ưu tiên: lựa chọn đã lưu > cài đặt hệ điều hành. */
(function(){
  var KEY='cccm_theme',t=null;
  try{t=localStorage.getItem(KEY);}catch(e){}
  if(t!=='light'&&t!=='dark'){
    t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';
  }
  document.documentElement.setAttribute('data-theme',t);
})();
