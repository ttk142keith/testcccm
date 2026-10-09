/* ============ NGUỒN NỘI DUNG ============
   Mọi chỗ trong app chỉ được lấy môn học / câu hỏi / chương qua object Content — không đọc file hay biến trực tiếp.
   - Hiện tại (cấu phần 1): đọc file JSON do tools/extract-content.mjs sinh ra ở thư mục content/
     (chỉ chạy khi xem thử trên máy; thư mục này KHÔNG được đưa lên web).
   - Cấu phần 2: thay phần thân init()/load() bằng truy vấn Supabase. Phần còn lại của app giữ nguyên. */
const CONTENT_BASE='../content/';
let SUBJECTS=[];
const META={build:''};
const Content={
  _manifest:null,_cache:{},_pending:{},
  /* Tải danh mục môn + thống kê số câu/chương. Gọi 1 lần khi khởi động. */
  async init(){
    const r=await fetch(CONTENT_BASE+'manifest.json',{cache:'no-cache'});
    if(!r.ok)throw new Error('Không tải được danh mục môn (HTTP '+r.status+')');
    const m=await r.json();
    this._manifest=m;SUBJECTS=m.subjects;META.build=m.build||'';
    return m;
  },
  /* Thống kê của 1 môn, dùng cho trang chủ mà không phải tải toàn bộ câu hỏi. */
  stats(sid){return (this._manifest&&this._manifest.stats[sid])||{questions:0,chapters:0,verified:0};},
  /* Tải câu hỏi + chương của 1 môn; có bộ nhớ đệm, và nhiều lời gọi cùng lúc chỉ tạo 1 yêu cầu mạng. */
  load(sid){
    if(this._cache[sid])return Promise.resolve(this._cache[sid]);
    if(!this._pending[sid]){
      this._pending[sid]=fetch(CONTENT_BASE+encodeURIComponent(sid)+'.json',{cache:'no-cache'})
        .then(r=>{if(!r.ok)throw new Error('Không tải được môn '+sid+' (HTTP '+r.status+')');return r.json();})
        .then(d=>{this._cache[sid]=d;return d;})
        .finally(()=>{delete this._pending[sid];});
    }
    return this._pending[sid];
  }
};
