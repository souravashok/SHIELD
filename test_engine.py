from engine.protect import load_image, protect
from engine.metrics import psnr, ssim, max_pixel_change
from engine.robustness import jpeg_test

original = load_image("input.jpg")
print("Protecting...")
protected = protect(original, eps=4 / 255, steps=60)
protected.save("protected.png")

print(f"\nPSNR: {psnr(original, protected):.2f} dB")
print(f"SSIM: {ssim(original, protected):.4f}")
print(f"Max pixel change: {max_pixel_change(original, protected)} / 255")

jpeg_test(original, protected)