import io
import time
import base64
import threading
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from PIL import UnidentifiedImageError

from engine.protect import load_image, protect
from engine.metrics import psnr, ssim

app = FastAPI(title="Shield")

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
MAX_BYTES = 15 * 1024 * 1024
STRENGTH = {"light": 3 / 255, "balanced": 4 / 255, "strong": 6 / 255}

# Heavy engine: only one photo at a time
busy = threading.Lock()


def to_data_url(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@app.post("/api/protect")
def protect_image(file: UploadFile = File(...), strength: str = Form("balanced")):
    if strength not in STRENGTH:
        raise HTTPException(400, "Unknown strength.")

    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "That file is over 15 MB.")

    try:
        original = load_image(io.BytesIO(data))
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Couldn't read that image.")

    if not busy.acquire(blocking=False):
        raise HTTPException(429, "Busy with another photo. Try again in a minute.")

    try:
        start = time.time()
        result = protect(original, eps=STRENGTH[strength], steps=60)
        seconds = time.time() - start
    finally:
        busy.release()

    return {
        "original": to_data_url(original),
        "protected": to_data_url(result),
        "psnr": round(psnr(original, result), 2),
        "ssim": round(ssim(original, result), 4),
        "seconds": round(seconds),
    }


# Must stay LAST: serves the website from /web
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")