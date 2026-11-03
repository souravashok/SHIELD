import torch
import torch.nn.functional as F
from torchvision import models, transforms
from PIL import Image, ImageOps

device = "cuda" if torch.cuda.is_available() else "cpu"

_model = None
_mean = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
_std = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)


def get_model():
    """Load the 'AI eye' once and reuse it."""
    global _model
    if _model is None:
        m = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        m.fc = torch.nn.Identity()
        m = m.to(device).eval()
        for p in m.parameters():
            p.requires_grad_(False)
        _model = m
    return _model


def embed(x):
    x = F.interpolate(x, size=(224, 224), mode="bilinear", align_corners=False)
    return get_model()((x - _mean) / _std)


def load_image(path_or_file, max_side=1024):
    img = ImageOps.exif_transpose(Image.open(path_or_file)).convert("RGB")
    w, h = img.size
    scale = max_side / max(w, h)
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return img


def pil_to_tensor(img):
    return transforms.ToTensor()(img).unsqueeze(0).to(device)


def tensor_to_pil(x):
    return transforms.ToPILImage()(x.squeeze(0).cpu().clamp(0, 1))


def protect(img, eps=4 / 255, alpha=1 / 255, steps=60):
    x = pil_to_tensor(img)

    with torch.no_grad():
        original_features = embed(x)

    delta = (torch.rand_like(x) * 2 - 1) * eps
    delta = ((x + delta).clamp(0, 1) - x).detach()

    for i in range(steps):
        delta.requires_grad_(True)
        adv = (x + delta).clamp(0, 1)
        loss = F.mse_loss(embed(adv), original_features)
        loss.backward()

        with torch.no_grad():
            delta = delta + alpha * delta.grad.sign()
            delta = delta.clamp(-eps, eps)
            delta = (x + delta).clamp(0, 1) - x
        delta = delta.detach()

        if i % 10 == 0 or i == steps - 1:
            print(f"  step {i + 1}/{steps}  loss {loss.item():.4f}")

    return tensor_to_pil(x + delta)