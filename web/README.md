# Shield

Shield is an early prototype that adds invisible noise to a photo so it looks the same to the human eye, but confuses the AI vision model reading it.

## How it works

A computer does not see a picture; it sees a grid of RGB pixel values from 0 to 255. Shield shifts every pixel by a few steps using Projected Gradient Descent (PGD) to push a model's internal feature vector off course:

1. Loads the photo and extracts its baseline feature vector from a pretrained **ResNet-50** model.
2. Starts from small random noise (starting at zero gives a zero gradient).
3. Runs a **60-step PGD loop**: measures how the noise shifts the model's features, nudges every pixel to push the reading further from the original, and clamps changes within `+/- eps` (out of 255).
4. Saves as lossless PNG so JPEG compression does not destroy the perturbation at save time.

**Strength levels:**
- **Light (`eps = 3/255`):** Least visible, weakest drift
- **Balanced (`eps = 4/255`):** Default trade-off
- **Strong (`eps = 6/255`):** Stronger drift, slight grain

## What's inside

- `engine/protect.py` — Runs the 60-step PGD loop against ResNet-50
- `engine/metrics.py` — Computes PSNR, SSIM, and max pixel change
- `engine/robustness.py` — Tests how well the noise survives JPEG compression
- `test_engine.py` — CLI script to test the engine on `input.jpg`
- `server/main.py` — FastAPI server (`POST /api/protect`, 15 MB limit)
- `web/` — Plain HTML, CSS, and JS interface with a before/after slider, a 25x amplified noise view, and a 6x6 RGB pixel inspector

## Results so far

Tested on a 768x1024 portrait photo (CPU):

| Metric | eps = 8/255 | eps = 4/255 | Notes |
| :--- | :--- | :--- | :--- |
| **PSNR** | 34.55 dB | 40.34 dB | >38 dB is invisible to the human eye |
| **SSIM** | 0.8092 | 0.9403 | 1.0 = identical |
| **Max pixel change** | 9/255 | 5/255 | Largest shift on a single pixel |
| **Feature drift (PNG)** | 6.69 | 3.47 | Shift in ResNet-50 reading (higher is stronger) |

**JPEG compression survival (`eps = 4/255`):**
- **Quality 95:** 0.4303 drift vs 0.0006 compression alone (**683x**)
- **Quality 85:** 0.1610 vs 0.0013 (**127x**)
- **Quality 75:** 0.0828 vs 0.0021 (**39x**)
- **Quality 60:** 0.0325 vs 0.0053 (**6x**)

## What it doesn't do yet (Next steps)

ResNet-50 is an image classifier, not an image editor. Right now, Shield proves we can disrupt how ResNet-50 reads an image, but it does not yet stop AI editing tools.

1. Swap ResNet-50 for the **Stable Diffusion VAE encoder** (`diffusers`) in `engine/protect.py`.
2. Benchmark against actual `img2img` and inpainting edits.
3. Add JPEG simulation inside the PGD loop so the noise survives heavy social media compression.

## Run locally

```bash
pip install torch torchvision pillow numpy scikit-image fastapi uvicorn python-multipart

# Run terminal test on input.jpg
python test_engine.py

# Start FastAPI server and open http://localhost:8000
python -m uvicorn server.main:app --port 8000