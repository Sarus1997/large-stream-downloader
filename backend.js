// กรอง Ad Networks, Tracking และโฆษณาเว็บพนัน/หวย/สล็อต ทิ้งทั้งหมด
const GLOBAL_IGNORE_PATTERNS = [
  // โดเมนยิงโฆษณาหนังเถื่อนยอดนิยม
  /cdend\.com/i,
  /allmp4\.pro/i,
  /googles\.video/i,
  /streamad/i,
  /adserver/i,
  
  // ชื่อไฟล์โฆษณาที่ชอบแฝงมา (หวย, บอล, สล็อต)
  /lotto/i,
  /ufa/i,
  /pgw/i,
  /slot/i,
  /bet/i,
  /casino/i,
  /bacc/i,

  // ระบบ Ad ทั่วไป
  /\/google-analytics/i,
  /\/pagead\//i,
  /\/doubleclick/i,
  /\/googlesyndication/i,
  /\/vast\//i,
  /\/vpaid\//i,
  /popads/i,
  /adsystem/i
];