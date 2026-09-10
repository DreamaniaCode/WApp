#!/usr/bin/env python3
"""
Generate official brand assets for WApp Manager Pro.
Processes the master logo to create transparent PNGs, favicons, and multi-resolution ICOs.
"""

import os
import sys
import math
from PIL import Image

def generate_assets(src_path="public/logo-1024.png"):
    if not os.path.exists(src_path):
        src_path = "public/logo.png"
    
    master = Image.open(src_path).convert("RGBA")
    w, h = master.size

    # 1. 512x512
    img_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    img_512.save("public/logo.png", "PNG")
    img_512.save("public/icon.png", "PNG")
    img_512.save("landing/logo.png", "PNG")
    os.makedirs("public/landing", exist_ok=True)
    img_512.save("public/landing/logo.png", "PNG")

    # 2. 256x256
    img_256 = master.resize((256, 256), Image.Resampling.LANCZOS)
    img_256.save("src/app/icon.png", "PNG")

    # 3. 32x32 Favicon
    img_32 = master.resize((32, 32), Image.Resampling.LANCZOS)
    img_32.save("public/favicon-32.png", "PNG")

    # 4. Multi-resolution ICOs
    ico_sizes_full = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    ico_sizes_fav = [(48, 48), (32, 32), (16, 16)]

    os.makedirs("build", exist_ok=True)
    master.save("public/icon.ico", format="ICO", sizes=ico_sizes_full)
    master.save("build/icon.ico", format="ICO", sizes=ico_sizes_full)
    master.save("public/favicon.ico", format="ICO", sizes=ico_sizes_fav)
    master.save("src/app/favicon.ico", format="ICO", sizes=ico_sizes_fav)

    print("All official brand assets generated successfully!")

if __name__ == "__main__":
    generate_assets()
