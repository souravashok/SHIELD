import numpy as np
from skimage.metrics import peak_signal_noise_ratio, structural_similarity


def _arr(img):
    return np.array(img.convert("RGB"))


def psnr(a, b):
    return peak_signal_noise_ratio(_arr(a), _arr(b), data_range=255)


def ssim(a, b):
    return structural_similarity(_arr(a), _arr(b), channel_axis=2, data_range=255)


def max_pixel_change(a, b):
    return int(np.abs(_arr(a).astype(int) - _arr(b).astype(int)).max())