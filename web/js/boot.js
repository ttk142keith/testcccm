/* ============ khởi động ============
   Thứ tự: cổng đăng nhập (tạm thời) → tải danh mục môn → vẽ trang chủ. */
__authInit(function(){
  if(typeof applyAuth==='function')applyAuth();
  bindLuyenEvents();
  Content.init().then(renderHome).catch(function(e){
    console.error(e);
    var g=document.getElementById('subGrid');
    if(g)g.innerHTML='<div class="empty">Không tải được danh mục môn học. Hãy tải lại trang; nếu vẫn lỗi, kiểm tra kết nối mạng.</div>';
  });
});
