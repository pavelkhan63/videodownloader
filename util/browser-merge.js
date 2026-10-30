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
let browserState = { status: "idle", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "", progressText: "", percent: null, downloadedMB: "", totalMB: "" };
let browserAdOpened = false;
let mergeRunId = 0;
let selectedMergeQuality = 480;
window.setBrowserMergeQuality = function (q) { const n = parseInt(q, 10); if (n > 0) selectedMergeQuality = n; };
window.getBrowserMergeQuality = function () { return selectedMergeQuality; };
function formatText(f) { return String((f.label || "") + " " + (f.note || "") + " " + (f.type || "") + " " + (f.kind || "")); }
function resolutionOf(f) { const m = String(f.label || "").match(/(\d{3,4})\s*p/i); return m ? parseInt(m[1], 10) : 0; }
function isAudioOnly(f) { const t = formatText(f); return /audio[\s\-_]*only/i.test(t) || /^audio\b/i.test(String(f.label || "")) || /\baudio\s+only\b/i.test(t); }
function isVideoOnly(f) { const t = formatText(f); return /video[\s\-_]*only/i.test(t) || /no\s+audio/i.test(t) || /without\s+audio/i.test(t) || /has\s+no\s+audio/i.test(t) || /no\s+sound/i.test(t) || /without\s+sound/i.test(t); }
function setStage(stage) { browserState.stage = stage; browserState.progressText = stage; try { if (window.showMessage) window.showMessage(stage); } catch (e) {} }
function reportProgress(stageLabel, downloadedBytes, totalBytes) {
  let text = stageLabel; let percent = null;
  if (totalBytes > 0 && downloadedBytes >= 0) { percent = Math.floor(downloadedBytes / totalBytes * 100); if (percent > 100) percent = 100; text += " " + percent + "%"; }
  if (downloadedBytes > 0 || totalBytes > 0) {
    const dl = (downloadedBytes / 1048576).toFixed(1) + " MB";
    text += " (" + dl + (totalBytes > 0 ? " / " + (totalBytes / 1048576).toFixed(1) + " MB" : "") + ")";
    browserState.downloadedMB = dl; browserState.totalMB = totalBytes > 0 ? (totalBytes / 1048576).toFixed(1) + " MB" : "";
  }
  browserState.stage = stageLabel; browserState.progressText = text; browserState.percent = percent;
  try { if (window.showMessage) window.showMessage(text); } catch (e) {}
}
function sizeText(bytes) { return (bytes / 1048576).toFixed(1) + " MB"; }
// User-selected quality: pick the closest MP4 video-only format at or below the selected quality.
// If none is at or below it, fall back to the lowest available format rather than failing.
// Note (code comment only, not a user-facing message): higher qualities mean larger files and longer waits on phone networks.
// The final file is always video + best M4A audio, never a video-only file.
function pickVideo(videoOnly, wanted) { const wantedQuality = wanted || selectedMergeQuality || 480; const mp4 = videoOnly.filter(function (f) { return /mp4/i.test(formatText(f)); }); const list = mp4.length ? mp4 : videoOnly; const atOrBelow = list.filter(function (f) { const r = resolutionOf(f); return r > 0 && r <= wantedQuality; }); if (atOrBelow.length) return atOrBelow.slice().sort(function (a, b) { return resolutionOf(b) - resolutionOf(a); })[0]; return list.slice().sort(function (a, b) { const ra = resolutionOf(a) || 99999, rb = resolutionOf(b) || 99999; return ra - rb; })[0]; }
function kbpsOf(f) { const m = formatText(f).match(/(\d+)\s*kbps/i); return m ? parseInt(m[1], 10) : 0; }
function pickAudio(audioOnly) { const m4a = audioOnly.filter(function (f) { return /m4a/i.test(formatText(f)); }); const list = m4a.length ? m4a : audioOnly; return list.slice().sort(function (a, b) { return kbpsOf(b) - kbpsOf(a); })[0]; }
async function loadFfmpegOnce() { if (ffmpegInstance && ffmpegInstance.loaded) return ffmpegInstance; if (!ffmpegLoading) { ffmpegLoading = (async function () { const ff = new FFmpeg(); await ff.load({ coreURL: CORE_URL, wasmURL: WASM_URL }); ffmpegInstance = ff; return ff; })(); ffmpegLoading.catch(function () { ffmpegLoading = null; }); } return ffmpegLoading; }
async function downloadWithProgress(url, stageLabel) {
  try {
    const res = await fetch(PROXY + encodeURIComponent(url));
    if (!res.ok) throw new Error("Download failed: " + res.status);
    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!res.body) { const data = await fetchFile(PROXY + encodeURIComponent(url)); return data; }
    const reader = res.body.getReader(); const chunks = []; let received = 0;
    reportProgress(stageLabel, 0, total);
    while (true) { const step = await reader.read(); if (step.done) break; if (step.value) { chunks.push(step.value); received += step.value.length; reportProgress(stageLabel, received, total); } }
    const out = new Uint8Array(received); let off = 0; chunks.forEach(function (c) { out.set(c, off); off += c.length; });
    return out;
  } catch (e) {
    try { const data = await fetchFile(PROXY + encodeURIComponent(url)); if (data && data.length) return data; } catch (ignored) {}
    throw e;
  }
}
async function runBrowserMerge(runId) {
  try {
    const videoOnly = cachedFormats.filter(function (f) { return f.url && isVideoOnly(f); });
    const audioOnly = cachedFormats.filter(function (f) { return f.url && isAudioOnly(f); });
    const video = pickVideo(videoOnly, selectedMergeQuality);
    const audio = pickAudio(audioOnly);
    if (!video || !audio) throw new Error("No video-only or audio-only format available for browser merge.");
    setStage("ভিডিও ডাউনলোডিং…");
    const ff = await loadFfmpegOnce();
    setStage("ভিডিও ডাউনলোডিং…");
    try { await ff.deleteFile("out.mp4"); } catch (e) {}
    try { await ff.deleteFile("v.mp4"); } catch (e) {}
    try { await ff.deleteFile("a.m4a"); } catch (e) {}
    const videoData = await downloadWithProgress(video.url, "ভিডিও ডাউনলোডিং…");
    if (!videoData || !videoData.length) throw new Error("Downloaded video data is empty.");
    setStage("অডিও ডাউনলোডিং…");
    const audioData = await downloadWithProgress(audio.url, "অডিও ডাউনলোডিং…");
    if (!audioData || !audioData.length) throw new Error("Downloaded audio data is empty.");
    setStage("মার্জ করা হচ্ছে…");
    await ff.writeFile("v.mp4", videoData);
    await ff.writeFile("a.m4a", audioData);
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
      browserState.progressText = "Ready, MP4 with sound (" + browserState.sizeText + ")";
    } catch (mergeErr) {
      throw mergeErr;
    }
  } catch (err) {
    if (runId !== undefined && runId !== mergeRunId) return;
    browserState.status = "error";
    browserState.error = err && err.message ? err.message : String(err);
    browserState.progressText = "";
    try { const el = document.getElementById("message"); if (el) { el.style.display = "block"; el.textContent = browserState.error; } } catch (e) {}
  }
}
window.browserMergeYouTube = async function (videoOnly, audioOnly, quality) {
  if (quality) window.setBrowserMergeQuality(quality);
  cachedFormats = [];
  videoOnly.forEach(function (f) { cachedFormats.push(f); });
  audioOnly.forEach(function (f) { cachedFormats.push(f); });
  mergeRunId++;
  const myRun = mergeRunId;
  browserState = { status: "processing", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "", progressText: "", percent: null, downloadedMB: "", totalMB: "" };
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
        if (browserState.status === "ready") return jsonResponse({ status: "ready", sizeText: browserState.sizeText, fileName: browserState.fileName, progressText: browserState.progressText });
        if (browserState.status === "error") return jsonResponse({ status: "error", error: browserState.error });
        return jsonResponse({ status: "processing", stage: browserState.stage, progressText: browserState.progressText, percent: browserState.percent, downloadedMB: browserState.downloadedMB, totalMB: browserState.totalMB });
      }
    } catch (e) {}
    return originalFetch.apply(window, arguments);
  }
  if (url.indexOf("/api/merge?url=") >= 0 && url.indexOf("/api/merge2") < 0) {
    if (browserState.status === "processing") return jsonResponse({ ok: true, job: BROWSER_JOB });
    mergeRunId++;
    browserState = { status: "processing", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "", progressText: "ভিডিও ডাউনলোডিং…", percent: null, downloadedMB: "", totalMB: "" };
    browserAdOpened = false;
    runBrowserMerge(mergeRunId);
    return jsonResponse({ ok: true, job: BROWSER_JOB });
  }
  if (url.indexOf("/api/resolve") >= 0) {
    const res = await originalFetch.apply(window, arguments);
    try {
      const data = await res.clone().json();
      if (browserState.status !== "processing") { cachedFormats = Array.isArray(data.formats) ? data.formats : []; cachedTitle = data.title || ""; browserState = { status: "idle", stage: "", blobUrl: "", sizeText: "", fileName: "video-with-sound.mp4", error: "", progressText: "", percent: null, downloadedMB: "", totalMB: "" }; window.__ricipeAdOpened = false; browserAdOpened = false; }
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
    // Ready merged file: one press starts the phone/browser download at once.
    // The Sponsored link opens alongside only on the first press for this video;
    // if it was already opened when the merge was started, later presses download only.
    if (!browserAdOpened && !window.__ricipeAdOpened) { browserAdOpened = true; window.__ricipeAdOpened = true; window.open(AD_LINK, "_blank", "noopener,noreferrer"); }
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
