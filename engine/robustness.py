import io
import torch
import torch.nn.functional as F
from PIL import Image
from .protect import embed, pil_to_tensor


def jpeg(img, quality):
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def feature_distance(a, b):
    with torch.no_grad():
        return F.mse_loss(embed(pil_to_tensor(a)), embed(pil_to_tensor(b))).item()


def jpeg_test(original, protected, qualities=(95, 85, 75, 60)):
    print(f"\n{'quality':>8} {'baseline':>10} {'protected':>10} {'ratio':>8}")
    print(f"{'PNG':>8} {feature_distance(original, original):>10.4f} "
          f"{feature_distance(original, protected):>10.4f}")
    for q in qualities:
        base = feature_distance(original, jpeg(original, q))
        prot = feature_distance(original, jpeg(protected, q))
        print(f"{q:>8} {base:>10.4f} {prot:>10.4f} {prot / max(base, 1e-9):>7.1f}x")