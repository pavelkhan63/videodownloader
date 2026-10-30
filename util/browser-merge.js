import { FFmpeg } from "../ffmpeg/index.js";
import { fetchFile } from "./index.js";
window.FFmpeg = FFmpeg;
window.fetchFile = fetchFile;
const PROXY = "https://proxy.life23243.workers.dev?link=";
const AD_LINK = "https://asiafilm.org/4/71f92f1c17a327e98497060f4c8897d9";
const BROWSER_JOB = "browser-merge";
const CORE_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js";
const WASM_URL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm";
let ffmpegInstance = null;
let ffmpegLoading = null;
let cachedFormats = [];
let cachedTitle = "";
let browserState = { status: "idle", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "" };
let browserAdOpened = false;
let mergeRunId = 0;
function formatText(f) { return String((f.label || "") + " " + (f.note || "") + " " + (f.type || "") + " " + (f.kind || "")); }
function resolutionOf(f) { const m = String(f.label || "").match(/(\d{3,4})\s*p/i); return m ? parseInt(m[1], 10) : 0; }
function isAudioOnly(f) { const t = formatText(f); return /audio[\s\-_]*only/i.test(t) || /^audio\b/i.test(String(f.label || "")) || /\baudio\s+only\b/i.test(t); }
function isVideoOnly(f) { const t = formatText(f); return /video[\s\-_]*only/i.test(t) || /no\s+audio/i.test(t) || /without\s+audio/i.test(t) || /has\s+no\s+audio/i.test(t) || /no\s+sound/i.test(t) || /without\s+sound/i.test(t); }
function setStage(stage) { browserState.stage = stage; try { if (window.showMessage) window.showMessage("ভিডিও ডাউনলোডিং…"); } catch (e) {} }
function sizeText(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }
// Browser merge is fixed at 480p: never pick a video-only format above 480p. If 480p is not available, pick the closest lower resolution (360p, then 240p).
function pickVideo(videoOnly) { const mp4 = videoOnly.filter(function (f) { return /mp4/i.test(formatText(f)); }); const list = mp4.length ? mp4 : videoOnly; const atOrBelow = list.filter(function (f) { const r = resolutionOf(f); return r > 0 && r <= 480; }); if (atOrBelow.length) return atOrBelow.slice().sort(function (a, b) { return resolutionOf(b) - resolutionOf(a); })[0]; return list.slice().sort(function (a, b) { const ra = resolutionOf(a) || 99999, rb = resolutionOf(b) || 99999; return ra - rb; })[0]; }
function kbpsOf(f) { const m = formatText(f).match(/(\d+)\s*kbps/i); return m ? parseInt(m[1], 10) : 0; }
function pickAudio(audioOnly) { const m4a = audioOnly.filter(function (f) { return /m4a/i.test(formatText(f)); }); const list = m4a.length ? m4a : audioOnly; return list.slice().sort(function (a, b) { return kbpsOf(b) - kbpsOf(a); })[0]; }
async function loadFfmpegOnce() { if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance; if (!ffmpegLoading) { ffmpegLoading = (async function () { const ff = new FFmpeg(); await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL }); ffmpegInstance = ff; return ff; })(); ffmpegLoading.catch(function () { ffmpegLoading = null; }); } return ffmpegLoading; }
async function runBrowserMerge(runId) {
  try {
    const videoOnly = cachedFormats.filter(function (f) { return f.url && isVideoOnly(f); });
    const audioOnly = cachedFormats.filter(function (f) { return f.url && isAudioOnly(f); });
    const video = pickVideo(videoOnly);
    const audio = pickAudio(audioOnly);
    if (!video || !audio) throw new Error("No video-only or audio-only format available for browser merge.");
    setStage("ভিডিও ডাউনলোডিং…");
    const ff = await loadFfmpegOnce();
    setStage("ভিডিও ডাউনলোডিং…");
    try { await ff.deleteFile("out.mp4"); } catch (e) {}
    try { await ff.deleteFile("v.mp4"); } catch (e) {}
    try { await ff.deleteFile("a.m4a"); } catch (e) {}
    const videoData = await fetchFile(PROXY + encodeURIComponent(video.url));
    if (!videoData || !videoData.length) throw new Error("Downloaded video data is empty.");
    setStage("ভিডিও ডাউনলোডিং…");
    const audioData = await fetchFile(PROXY + encodeURIComponent(audio.url));
    if (!audioData || !audioData.length) throw new Error("Downloaded audio data is empty.");
    setStage("ভিডিও ডাউনলোডিং…");
    await ff.writeFile("v.mp4", videoData);
    await ff.writeFile("a.m4a", audioData);
    setStage("ভিডিও ডাউনলোডিং…");
    // Direct merge, like the proven direct merge: await exec, then readFile,
    // then Blob from the returned bytes themselves (never out.buffer, whose
    // underlying WASM buffer can be far larger than the output, or detached).
    // This block is wrapped so a failure is shown exactly, never left silent.
    try {
      const code = await ff.exec(["-i", "v.mp4", "-i", "a.m4a", "-c", "copy", "-shortest", "out.mp4"]);
      if (typeof code === "number" && code !== 0) throw new Error("ffmpeg exec failed with exit code " + code);
      const out = await ff.readFile("out.mp4");
      if (!out || !out.length) throw new Error("ffmpeg produced an empty out.mp4.");
      const blob = new Blob([out], { type: "video/mp4" });
      if (runId !== undefined && runId !== mergeRunId) return;
      if (browserState.blobUrl) URL.revokeObjectURL(browserState.blobUrl);
      browserState.blobUrl = URL.createObjectURL(blob);
      browserState.sizeText = sizeText(out.length);
      const safeTitle = String(cachedTitle || "video").replace(/[\\/:*?"<>|]+/g, "").trim() || "video";
      browserState.fileName = safeTitle + "-with-sound.mp4";
      browserState.status = "ready";
    } catch (mergeErr) {
      throw mergeErr;
    }
  } catch (err) {
    if (runId !== undefined && runId !== mergeRunId) return;
    browserState.status = "error";
    browserState.error = err && err.message ? err.message : String(err);
    try { const el = document.getElementById("message"); if (el) { el.style.display = "block"; el.textContent = browserState.error; } } catch (e) {}
  }
}
window.browserMergeYouTube = async function (videoOnly, audioOnly) {
  cachedFormats = [];
  videoOnly.forEach(function (f) { cachedFormats.push(f); });
  audioOnly.forEach(function (f) { cachedFormats.push(f); });
  mergeRunId++;
  const myRun = mergeRunId;
  browserState = { status: "processing", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "" };
  await runBrowserMerge(myRun);
  if (browserState.status !== "ready") throw new Error(browserState.error || "Browser merge failed.");
  return { url: browserState.blobUrl, sizeText: browserState.sizeText };
};
const originalFetch = window.fetch.bind(window);
function jsonResponse(obj) { return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } }); }
window.fetch = async function () {
  const input = arguments[0];
  const url = typeof input === "string" ? input : (input && input.url ? input.url : "");
  if (url.indexOf("/api/merge/status") >= 0) {
    try {
      const job = new URL(url).searchParams.get("job");
      if (job === BROWSER_JOB) {
        if (browserState.status === "ready") return jsonResponse({ status: "ready", sizeText: browserState.sizeText, fileName: browserState.fileName });
        if (browserState.status === "error") return jsonResponse({ status: "error", error: browserState.error });
        return jsonResponse({ status: "processing" });
      }
    } catch (e) {}
    return originalFetch.apply(window, arguments);
  }
  if (url.indexOf("/api/merge?url=") >= 0 && url.indexOf("/api/merge2") < 0) {
    if (browserState.status === "processing") return jsonResponse({ ok: true, job: BROWSER_JOB });
    mergeRunId++;
    browserState = { status: "processing", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "" };
    browserAdOpened = false;
    runBrowserMerge(mergeRunId);
    return jsonResponse({ ok: true, job: BROWSER_JOB });
  }
  if (url.indexOf("/api/resolve") >= 0) {
    const res = await originalFetch.apply(window, arguments);
    try {
      const data = await res.clone().json();
      if (browserState.status !== "processing") { cachedFormats = Array.isArray(data.formats) ? data.formats : []; cachedTitle = data.title || ""; browserState = { status: "idle", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "" }; }
    } catch (e) {}
    return res;
  }
  return originalFetch.apply(window, arguments);
};
const downloadBtn = document.getElementById("downloadBtn");
if (downloadBtn) {
  downloadBtn.addEventListener("click", function (e) {
    if (!browserState.blobUrl) return;
    e.stopImmediatePropagation();
    e.stopPropagation();
    e.preventDefault();
    if (!browserAdOpened) { browserAdOpened = true; window.open(AD_LINK, "_blank", "noopener,noreferrer"); try { if (window.showMessage) window.showMessage("Sponsored link opened in a new tab. Press Download again to get your video."); } catch (e) {} }
    const a = document.createElement("a");
    a.href = browserState.blobUrl;
    a.download = browserState.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, true);
}
const messageEl = document.getElementById("message");
if (messageEl && window.MutationObserver) {
  new MutationObserver(function () {
    if (browserState.status === "ready" && browserState.blobUrl && browserState.sizeText && messageEl.innerHTML.indexOf("Ready") >= 0 && messageEl.innerHTML.indexOf(browserState.sizeText) < 0) { messageEl.innerHTML += "<br>Ready, MP4 with sound (" + browserState.sizeText + ")"; }
  }).observe(messageEl, { childList: true, characterData: true, subtree: true });
}
