let currentTab = null;
let currentList = [];

document.addEventListener("DOMContentLoaded", async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tabs[0];

  document.getElementById("refreshBtn").addEventListener("click", loadMedia);
  document.getElementById("clearBtn").addEventListener("click", clearMedia);

  await loadMedia();
});

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return "สตรีมสด / HLS";
  if (bytes < 50000) return "แทร็กย่อย";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes, i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

// ป้องกันบั๊ก % ถูกระบบ Windows CMD ลบทิ้ง
function sanitizeBat(text) {
  return String(text || "").replace(/%/g, "%%");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadMedia() {
  if (!currentTab?.id) return;
  chrome.runtime.sendMessage(
    { type: "GET_MEDIA_LIST", tabId: currentTab.id },
    (response) => {
      if (chrome.runtime.lastError) return;
      currentList = response?.media || [];
      render(currentList);
    }
  );
}

function clearMedia() {
  if (!currentTab?.id) return;
  chrome.runtime.sendMessage({ type: "CLEAR_MEDIA", tabId: currentTab.id }, () => {
    currentList = [];
    render([]);
  });
}

// รวมภาพ (video.m3u8) + เสียง (audio.m3u8) เข้าด้วยกันเป็น MP4 เดียว
function triggerMergeTracks(videoItem, audioItem) {
  const timeId = Date.now();
  const finalName = `movie_complete_${timeId}.mp4`;
  const referer = videoItem.initiator || audioItem.initiator || currentTab?.url || "";

  const safeVUrl = sanitizeBat(videoItem.url);
  const safeAUrl = sanitizeBat(audioItem.url);
  const safeRef = sanitizeBat(referer);

  const batContent = `@echo off
chcp 65001 >nul
title StreamLens Universal Merger
echo =======================================================================
echo   StreamLens - กำลังดาวน์โหลดและรวมภาพ + เสียง เป็นไฟล์เดียว...
echo =======================================================================
echo.

set "FFMPEG=ffmpeg"
if exist "C:\\ffmpeg\\bin\\ffmpeg.exe" set "FFMPEG=C:\\ffmpeg\\bin\\ffmpeg.exe"
if exist "%~dp0ffmpeg.exe" set "FFMPEG=%~dp0ffmpeg.exe"

"%FFMPEG%" -version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ผิดพลาด] ไม่พบ ffmpeg ในระบบ!
    echo ดาวน์โหลด ffmpeg.exe มาวางไว้ในโฟลเดอร์นี้ หรือเปิด CMD แล้วพิมพ์:
    echo winget install Gyan.FFmpeg
    echo.
    pause
    exit /b
)

echo กำลังเชื่อมต่อไปยังสตรีมและรวมไฟล์...
echo ปลายทาง: %~dp0${finalName}
echo.

"%FFMPEG%" -y ^
  -protocol_whitelist "file,http,https,tcp,tls,crypto" ^
  -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 ^
  -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -referer "${safeRef}" -i "${safeVUrl}" ^
  -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -referer "${safeRef}" -i "${safeAUrl}" ^
  -c copy "%~dp0${finalName}"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================================
    echo   [สำเร็จ 100%%] บันทึกไฟล์หนังสมบูรณ์ภาพพร้อมเสียง: ${finalName}
    echo =======================================================================
    timeout /t 5 >nul
    exit
) else (
    echo.
    echo [ล้มเหลว] เกิดข้อผิดพลาดในการรวมไฟล์
    pause
)
`;

  const blob = new Blob([batContent], { type: "text/plain;charset=utf-8" });
  const batUrl = URL.createObjectURL(blob);
  chrome.downloads.download({ url: batUrl, filename: `รวมภาพและเสียง_${timeId}.bat` });
}

// ดาวน์โหลดสตรีมเดี่ยว (.m3u8 หรือ .mpd ที่มีภาพ+เสียงในตัว)
function triggerDownloadHls(item) {
  const timeId = Date.now();
  const finalName = `stream_${timeId}.mp4`;
  const referer = item.initiator || currentTab?.url || "";

  const safeUrl = sanitizeBat(item.url);
  const safeReferer = sanitizeBat(referer);

  const batContent = `@echo off
chcp 65001 >nul
title StreamLens Master Downloader
echo =======================================================================
echo   StreamLens - กำลังดาวน์โหลดสตรีม (.m3u8 / .mpd) พร้อมถอดรหัส AES
echo =======================================================================
echo.

set "FFMPEG=ffmpeg"
if exist "C:\\ffmpeg\\bin\\ffmpeg.exe" set "FFMPEG=C:\\ffmpeg\\bin\\ffmpeg.exe"
if exist "%~dp0ffmpeg.exe" set "FFMPEG=%~dp0ffmpeg.exe"

"%FFMPEG%" -version >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ผิดพลาด] ไม่พบ ffmpeg ในระบบ!
    echo ดาวน์โหลด ffmpeg.exe มาวางไว้ข้างๆ ไฟล์นี้ หรือเปิด CMD แล้วพิมพ์:
    echo winget install Gyan.FFmpeg
    echo.
    pause
    exit /b
)

echo กำลังเชื่อมต่อไปยังสตรีมและดาวน์โหลดไฟล์...
echo ปลายทาง: %~dp0${finalName}
echo.

"%FFMPEG%" -y ^
  -protocol_whitelist "file,http,https,tcp,tls,crypto" ^
  -reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 ^
  -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -referer "${safeReferer}" ^
  -i "${safeUrl}" ^
  -c copy "%~dp0${finalName}"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =======================================================================
    echo   [สำเร็จ 100%%] ดาวน์โหลดวิดีโอสมบูรณ์แล้ว: ${finalName}
    echo =======================================================================
    timeout /t 5 >nul
    exit
) else (
    echo.
    echo [ล้มเหลว] สตรีมอาจมี DRM เข้ารหัสฮาร์ดแวร์ หรือเซิร์ฟเวอร์ปฏิเสธ
    pause
)
`;

  const blob = new Blob([batContent], { type: "text/plain;charset=utf-8" });
  const batUrl = URL.createObjectURL(blob);
  chrome.downloads.download({ url: batUrl, filename: `ดาวน์โหลดสตรีม_${timeId}.bat` });
}

function render(list) {
  const container = document.getElementById("mediaList");
  const empty = document.getElementById("empty");
  const countEl = document.getElementById("count");

  countEl.textContent = list.length;
  container.innerHTML = "";

  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  // กรณีที่ 1: ตรวจพบทั้งแทร็กภาพ (VIDEO) และแทร็กเสียง (AUDIO) เช่น vdohls แยกเส้น
  const vTrack = list.find(x => x.type === "VIDEO");
  const aTrack = list.find(x => x.type === "AUDIO");
  if (vTrack && aTrack && vTrack.url !== aTrack.url) {
    const cCard = document.createElement("article");
    cCard.className = "card combo-card";
    cCard.innerHTML = `
      <div class="card-top">
        <span class="tag COMBO">🎬 ตรวจพบสตรีมภาพ + เสียง แยกกัน</span>
        <span class="size">พร้อมรวมไฟล์</span>
      </div>
      <div class="card-url">แทร็กภาพ (${vTrack.url.slice(0, 38)}...) + แทร็กเสียง (${aTrack.url.slice(0, 38)}...)</div>
      <div class="card-actions">
        <button class="btn-act combo-btn" id="dlComboBtn">⚡ รวมภาพและเสียงเป็นไฟล์เดียว (.bat)</button>
      </div>
    `;
    cCard.querySelector("#dlComboBtn").addEventListener("click", () => {
      triggerMergeTracks(vTrack, aTrack);
    });
    container.appendChild(cCard);
  }

  // กรณีที่ 2: ตรวจพบ Playlist สตรีมหลักรวม (.m3u8 / .mpd)
  const playlistItem = list.find(x => x.type === "HLS" || x.type === "DASH");
  if (playlistItem) {
    const pCard = document.createElement("article");
    pCard.className = "card combo-card";
    pCard.innerHTML = `
      <div class="card-top">
        <span class="tag HLS">📡 สตรีมตัวเต็ม (${escapeHtml(playlistItem.type)})</span>
        <span class="size">ไฟล์สตรีมหลัก</span>
      </div>
      <div class="card-url" title="${escapeHtml(playlistItem.url)}">${escapeHtml(playlistItem.url)}</div>
      <div class="card-actions">
        <button class="btn-act primary" id="dlPlaylistBtn">⚡ ดาวน์โหลดสตรีมนี้ทันที (.bat)</button>
      </div>
    `;
    pCard.querySelector("#dlPlaylistBtn").addEventListener("click", () => {
      triggerDownloadHls(playlistItem);
    });
    container.appendChild(pCard);
  }

  // แสดงรายการสื่อเดี่ยวทั้งหมด
  list.forEach(item => {
    const card = document.createElement("article");
    card.className = "card";
    const isPlaylist = item.type === "HLS" || item.type === "DASH" || item.url.includes(".m3u8");

    card.innerHTML = `
      <div class="card-top">
        <span class="tag ${item.type}">${escapeHtml(item.type)}</span>
        <span class="size">${formatSize(item.size)}</span>
      </div>
      <div class="card-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</div>
      <div class="card-actions">
        <button class="btn-act copy-btn">คัดลอก URL</button>
        ${isPlaylist 
          ? `<button class="btn-act primary dl-hls">โหลดสตรีม (.bat)</button>` 
          : `<button class="btn-act primary dl-direct">บันทึกไฟล์</button>`}
      </div>
    `;

    card.querySelector(".copy-btn").addEventListener("click", (e) => {
      navigator.clipboard.writeText(item.url);
      e.target.textContent = "คัดลอกแล้ว ✓";
      setTimeout(() => (e.target.textContent = "คัดลอก URL"), 1000);
    });

    if (isPlaylist) {
      card.querySelector(".dl-hls").addEventListener("click", () => triggerDownloadHls(item));
    } else {
      card.querySelector(".dl-direct").addEventListener("click", () => {
        const ext = item.type === "AUDIO" ? "m4a" : "mp4";
        chrome.downloads.download({
          url: item.url,
          filename: `media_${Date.now()}.${ext}`,
          saveAs: true
        });
      });
    }

    container.appendChild(card);
  });
}