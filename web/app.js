const $ = (s) => document.querySelector(s);

const stage = $("#stage");
const drop = $("#drop");
const fileInput = $("#file");
const compare = $("#compare");
const handle = $("#handle");
const errorBox = $("#error");
const dlg = $("#numbers");

const AMP = 25;
const N = 6;

let timerId = null;
let urls = [];
let pix = null;
let patch = { x: 0, y: 0, ch: 0, placed: false };

const setState = (s) => (stage.dataset.state = s);
const setView = (v) => {
  stage.dataset.view = v;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.view === v));
};
const showError = (m) => { errorBox.textContent = m; errorBox.hidden = false; };
const hideError = () => (errorBox.hidden = true);

function startTimer() {
  const t0 = Date.now();
  $("#timer").textContent = "00:00";
  timerId = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $("#timer").textContent =
      String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 250);
}
const stopTimer = () => clearInterval(timerId);

function makeUrl(blob) {
  const u = URL.createObjectURL(blob);
  urls.push(u);
  return u;
}
function clearUrls() { urls.forEach(URL.revokeObjectURL); urls = []; }

const loadImg = (src) =>
  new Promise((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = fail;
    i.src = src;
  });

async function buildDiff(srcA, srcB) {
  const [a, b] = await Promise.all([loadImg(srcA), loadImg(srcB)]);
  const c = $("#diff");
  c.width = a.naturalWidth;
  c.height = a.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });

  ctx.drawImage(a, 0, 0);
  const A = ctx.getImageData(0, 0, c.width, c.height).data;
  ctx.drawImage(b, 0, 0);
  const B = ctx.getImageData(0, 0, c.width, c.height).data;

  const out = ctx.createImageData(c.width, c.height);
  let max = 0;
  for (let i = 0; i < A.length; i += 4) {
    const dr = Math.abs(A[i] - B[i]);
    const dg = Math.abs(A[i + 1] - B[i + 1]);
    const db = Math.abs(A[i + 2] - B[i + 2]);
    const d = Math.max(dr, dg, db);
    if (d > max) max = d;
    const m = Math.min(255, d * AMP);
    out.data[i] = m;
    out.data[i + 1] = m * 0.12;
    out.data[i + 2] = m * 0.18;
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  pix = { A, B, w: c.width, h: c.height, max };
  patch.placed = false;
}

function verdict(psnr) {
  if (psnr >= 38) return ["Invisible", "no visible grain"];
  if (psnr >= 35) return ["Subtle", "faint grain possible"];
  return ["Visible", "try a lighter setting"];
}

async function handleFile(file) {
  if (!file) return;
  hideError();

  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return showError("Use a JPG, PNG or WebP image.");
  if (file.size > 15 * 1024 * 1024) return showError("That file is over 15 MB.");

  clearUrls();
  $("#preview").src = makeUrl(file);
  setState("working");
  startTimer();

  const body = new FormData();
  body.append("file", file);
  body.append("strength", document.querySelector("input[name=strength]:checked").value);

  try {
    const res = await fetch("/api/protect", { method: "POST", body });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Something went wrong.");
    }
    const data = await res.json();

    $("#imgBefore").src = data.original;
    $("#imgAfter").src = data.protected;
    $("#pickImg").src = data.original;
    await buildDiff(data.original, data.protected);

    const [v, note] = verdict(data.psnr);
    $("#statVerdict").textContent = v;
    $("#statVerdictNote").textContent = note;
    $("#statPsnr").textContent = data.psnr + " dB";
    $("#statSsim").textContent = data.ssim;
    $("#statTime").textContent = data.seconds;

    const blob = await (await fetch(data.protected)).blob();
    const dl = $("#download");
    dl.href = makeUrl(blob);
    dl.download = file.name.replace(/\.[^.]+$/, "") + "-protected.png";

    setPos(50);
    setView("compare");
    setState("done");
  } catch (e) {
    showError(e.message);
    setState("idle");
  } finally {
    stopTimer();
  }
}

drop.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

["dragenter", "dragover"].forEach((evt) =>
  drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add("over"); })
);
["dragleave", "drop"].forEach((evt) =>
  drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove("over"); })
);
drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

$("#again").addEventListener("click", () => {
  fileInput.value = "";
  clearUrls();
  hideError();
  pix = null;
  setState("idle");
});

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => setView(t.dataset.view))
);

let dragging = false;

function setPos(p) {
  p = Math.min(100, Math.max(0, p));
  compare.style.setProperty("--pos", p + "%");
  handle.setAttribute("aria-valuenow", Math.round(p));
}
function posFromPointer(x) {
  const r = compare.getBoundingClientRect();
  setPos(((x - r.left) / r.width) * 100);
}
compare.addEventListener("pointerdown", (e) => {
  dragging = true;
  compare.setPointerCapture(e.pointerId);
  posFromPointer(e.clientX);
});
compare.addEventListener("pointermove", (e) => { if (dragging) posFromPointer(e.clientX); });
compare.addEventListener("pointerup", () => (dragging = false));

handle.addEventListener("keydown", (e) => {
  const now = Number(handle.getAttribute("aria-valuenow"));
  if (e.key === "ArrowLeft") setPos(now - 3);
  if (e.key === "ArrowRight") setPos(now + 3);
});

function placePatch(cx, cy) {
  patch.x = Math.max(0, Math.min(pix.w - N, Math.round(cx - N / 2)));
  patch.y = Math.max(0, Math.min(pix.h - N, Math.round(cy - N / 2)));
  patch.placed = true;
  drawNumbers();
}

function drawNumbers() {
  const { A, B, w, h, max } = pix;
  const box = $("#box");
  box.style.left = (patch.x / w) * 100 + "%";
  box.style.top = (patch.y / h) * 100 + "%";
  box.style.width = (N / w) * 100 + "%";
  box.style.height = (N / h) * 100 + "%";

  let a = "", b = "", d = "";
  const top = Math.max(1, max);

  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = ((patch.y + y) * w + patch.x + x) * 4 + patch.ch;
      const o = A[i], p = B[i], diff = p - o;

      a += `<span>${o}</span>`;
      b += `<span>${p}</span>`;

      if (diff === 0) {
        d += `<span class="zero">0</span>`;
      } else {
        const k = Math.abs(diff) / top;
        const bg = diff > 0
          ? `rgba(200,16,46,${0.25 + 0.75 * k})`
          : `rgba(201,203,207,${0.12 + 0.3 * k})`;
        d += `<span style="background:${bg}">${diff > 0 ? "+" : ""}${diff}</span>`;
      }
    }
  }

  $("#gridA").innerHTML = a;
  $("#gridB").innerHTML = b;
  $("#gridD").innerHTML = d;
  $("#dlgNote").innerHTML =
    `Every pixel is three numbers from 0 to 255: red, green and blue. This is a ${N}&times;${N} patch of one channel. ` +
    `The biggest change anywhere in this photo is <b>&plusmn;${max}</b> out of 255, ` +
    `far too small to see, but enough to change what an AI model reads from the image.`;
}

$("#showNumbers").addEventListener("click", () => {
  if (!pix) return;
  dlg.showModal();
  if (!patch.placed) placePatch(pix.w / 2, pix.h / 2);
  else drawNumbers();
});

$("#closeNumbers").addEventListener("click", () => dlg.close());
dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

$("#pick").addEventListener("click", (e) => {
  if (!pix) return;
  const r = $("#pickImg").getBoundingClientRect();
  placePatch(((e.clientX - r.left) / r.width) * pix.w, ((e.clientY - r.top) / r.height) * pix.h);
});

document.querySelectorAll("input[name=ch]").forEach((r) =>
  r.addEventListener("change", () => {
    patch.ch = Number(r.value);
    if (pix) drawNumbers();
  })
);