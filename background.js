const mediaByTab = Object.create(null);

const MEDIA_EXTENSIONS =
  /\.(mp4|webm|m4v|m4a|mp3|wav|ogg|oga|aac|flac|mkv|mov|avi|flv|ts|m4s|m3u8|mpd)($|\?)/i;

// รายชื่อโดเมนและคีย์เวิร์ดโฆษณาพนัน/หวย/สล็อตที่บล็อกทิ้งทั้งหมด 100%
const AD_BLOCK_PATTERNS = [
  /cdend\.com/i,
  /allmp4\.pro/i,
  /googles\.video/i,
  /streamad/i,
  /adserver/i,
  /popads/i,
  /adform/i,
  /adnxs/i,
  /doubleclick/i,
  /googlesyndication/i,
  /google-analytics/i,
  /clarity\.ms/i,
  /lotto/i,
  /ufa/i,
  /pgw/i,
  /slot/i,
  /bet/i,
  /casino/i,
  /bacc/i,
  /sagame/i,
  /banner/i,
  /preroll/i,
  /pre-roll/i,
  /\/vast\//i,
  /\/vpaid\//i,
  /\/pagead\//i
];

function classify(url, contentType = "") {
  let pathname = "";
  try { pathname = new URL(url).pathname.toLowerCase(); } catch (e) { pathname = url.toLowerCase(); }
  const lowerUrl = url.toLowerCase();
  const type = (contentType || "").toLowerCase();

  // 1. ตรวจจับแทร็กเสียงแยก (เช่น audio.m3u8 ของ vdohls)
  if (
    lowerUrl.includes("audio.m3u8") ||
    lowerUrl.includes("/audio") ||
    type.includes("audio/") ||
    /\.(m4a|mp3|aac|wav|flac)($|\?)/i.test(lowerUrl)
  ) {
    return "AUDIO";
  }

  // 2. ตรวจจับแทร็กภาพแยก (เช่น video.m3u8 ของ vdohls)
  if (
    lowerUrl.includes("video.m3u8") ||
    lowerUrl.includes("/video") ||
    type.includes("video/") ||
    /\.(mp4|webm|m4v)($|\?)/i.test(lowerUrl)
  ) {
    return "VIDEO";
  }

  // 3. Playlist รวมที่มีทั้งภาพและเสียงในไฟล์เดียว
  if (pathname.endsWith(".m3u8") || type.includes("mpegurl") || lowerUrl.includes(".m3u8")) return "HLS";
  if (pathname.endsWith(".mpd") || type.includes("dash+xml") || lowerUrl.includes(".mpd")) return "DASH";

  // 4. แทร็กชิ้นส่วน
  if (pathname.endsWith(".ts") || lowerUrl.includes(".ts?")) return "TS";
  if (pathname.endsWith(".m4s") || lowerUrl.includes(".m4s")) {
    return lowerUrl.includes("audio") ? "AUDIO" : "VIDEO";
  }

  return "MEDIA";
}

function addMedia(tabId, item) {
  if (!mediaByTab[tabId]) mediaByTab[tabId] = [];
  if (mediaByTab[tabId].some(x => x.url === item.url)) return;

  mediaByTab[tabId].unshift(item);

  // เรียงลำดับ: Playlist ขึ้นก่อน ตามด้วย VIDEO, AUDIO และไฟล์ทั่วไป
  mediaByTab[tabId].sort((a, b) => {
    const score = (type) => {
      if (type === "HLS" || type === "DASH") return 4;
      if (type === "VIDEO") return 3;
      if (type === "AUDIO") return 2;
      return 1;
    };
    return score(b.type) - score(a.type);
  });

  if (mediaByTab[tabId].length > 100) mediaByTab[tabId].length = 100;

  chrome.action.setBadgeText({ tabId, text: String(mediaByTab[tabId].length) });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#10b981" });
}

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const url = details.url;

    // กรองโฆษณาออก
    if (AD_BLOCK_PATTERNS.some(rx => rx.test(url))) return;

    let contentType = "";
    let contentLength = 0;

    for (const h of details.responseHeaders || []) {
      const name = h.name.toLowerCase();
      if (name === "content-type") contentType = (h.value || "").toLowerCase();
      if (name === "content-length") {
        const parsed = Number.parseInt(h.value || "", 10);
        if (Number.isFinite(parsed)) contentLength = parsed;
      }
    }

    let pathname = "";
    try { pathname = new URL(url).pathname; } catch (e) { pathname = url; }

    const isMedia =
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/") ||
      contentType.includes("mpegurl") ||
      contentType.includes("dash+xml") ||
      MEDIA_EXTENSIONS.test(pathname) ||
      url.includes(".m3u8") ||
      url.includes(".mpd") ||
      url.includes(".m4s");

    if (!isMedia) return;

    addMedia(details.tabId, {
      url,
      size: contentLength,
      type: classify(url, contentType),
      contentType,
      // บันทึกที่มาแท้จริงของ iframe สำหรับใช้เป็น Referer
      initiator: details.initiator || "",
      time: Date.now()
    });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => { delete mediaByTab[tabId]; });

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    mediaByTab[tabId] = [];
    chrome.action.setBadgeText({ tabId, text: "" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_MEDIA_LIST") {
    sendResponse({ media: mediaByTab[message.tabId] || [] });
  } else if (message?.type === "CLEAR_MEDIA") {
    mediaByTab[message.tabId] = [];
    chrome.action.setBadgeText({ tabId, text: "" });
    sendResponse({ ok: true });
  }
  return true;
});