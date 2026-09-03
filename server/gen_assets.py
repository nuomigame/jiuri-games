import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageChops
import os, math, random

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "img")
os.makedirs(OUT, exist_ok=True)

random.seed(42)
np.random.seed(42)

# ---- palette -------------------------------------------------------------
LIME   = (200, 240, 75)
LIME2  = (170, 220, 60)
AMBER  = (240, 168, 92)
GOLD   = (255, 205, 120)
INK    = (10, 10, 14)

def clamp(x): return max(0, min(255, int(x)))

def grain(img, amount=8, seed=1):
    rng = np.random.default_rng(seed)
    arr = np.asarray(img).astype(np.float32)
    n = rng.normal(0, amount, arr.shape[:2])[..., None]
    arr += n
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))

def vignette(w, h, strength=0.55):
    y, x = np.ogrid[:h, :w]
    cx, cy = w/2, h/2
    d = np.sqrt(((x-cx)/(w/2))**2 + ((y-cy)/(h/2))**2)
    v = 1 - strength*np.clip(d-0.55, 0, 1)**1.6
    return v[..., None].astype(np.float32)

def canvas(size, base):
    w, h = size
    # base = (topColor, bottomColor), each a 3-tuple
    t = np.linspace(0, 1, h).astype(np.float32)[:, None, None]
    top = np.array(base[0], dtype=np.float32)[None, None, :]
    bot = np.array(base[1], dtype=np.float32)[None, None, :]
    return (top*(1 - t) + bot*t) * np.ones((1, w, 1), dtype=np.float32)

def radial_glow(size, cx, cy, radius, color, intensity):
    w, h = size
    y, x = np.ogrid[:h, :w]
    d = np.sqrt((x-cx)**2 + (y-cy)**2)/radius
    glow = np.exp(-(d**2)*2.2)[..., None]*intensity
    c = np.array(color, dtype=np.float32)[None, None, :]
    return c*glow

def blur(img, r):
    return img.filter(ImageFilter.GaussianBlur(r))

def save(img, name, q=95):
    img.save(os.path.join(OUT, name), quality=q)
    print("wrote", name, img.size)

# ---------------------------------------------------------------------------
# HERO - dreamy sea-of-clouds cinematic
# ---------------------------------------------------------------------------
def make_hero():
    w, h = 1920, 1080
    img = Image.fromarray(np.clip(canvas((w,h), ((26,24,36),(44,34,40))),0,255).astype(np.uint8)).convert("RGB")
    # warm sun glow upper-right (screen-add so it stays bright)
    glow = np.zeros((h,w,3), np.float32)
    glow += radial_glow((w,h), w*0.80, h*0.22, 560, (255,214,150), 1.0)
    glow += radial_glow((w,h), w*0.80, h*0.22, 260, (255,240,196), 1.35)
    glow += radial_glow((w,h), w*0.80, h*0.22, 110, (255,250,226), 1.6)
    img = ImageChops.screen(img, Image.fromarray(np.clip(glow,0,255).astype(np.uint8)))
    # warm horizon band
    band = radial_glow((w,h), w*0.5, h*0.58, w*0.95, (150,104,82), 0.5)
    img = ImageChops.screen(img, Image.fromarray(np.clip(band,0,255).astype(np.uint8)))
    # sea of clouds (screen-additive so lower half fills with fluffy light)
    cl = Image.new("RGB", (w,h), (0,0,0))
    d = ImageDraw.Draw(cl)
    for i in range(300):
        depth = i/300
        y = h*(0.40 + 0.62*depth) + random.uniform(-70, 70)
        y = min(h+140, y)
        x = random.uniform(-220, w+220)
        r = random.uniform(30, 185)*(0.35 + depth*0.95)
        v = 110 + int(150*random.random())
        # warm clouds; cooler far/high ones
        c = (v, int(v*0.95), int(v*0.90)) if random.random() < 0.85 else (int(v*0.7), int(v*0.75), int(v*0.86))
        d.ellipse([x-r, y-r*0.5, x+r, y+r*0.5], fill=c)
    cl = blur(cl, 44)
    cl = ImageEnhance.Brightness(cl).enhance(1.05)
    img = ImageChops.screen(img, cl)
    # bright cloud-top foam
    hi = Image.new("RGB", (w,h), (0,0,0))
    d = ImageDraw.Draw(hi)
    for i in range(140):
        depth = i/140
        y = h*(0.55 + 0.45*depth) + random.uniform(-40, 40)
        x = random.uniform(-140, w+140)
        r = random.uniform(18, 82)*(0.42 + depth*0.85)
        v = 205 + int(50*random.random())
        d.ellipse([x-r, y-r*0.5, x+r, y+r*0.5], fill=(v, int(v*0.97), int(v*0.93)))
    hi = blur(hi, 24)
    img = ImageChops.screen(img, hi)
    # drifting light motes / embers
    part = Image.new("RGB", (w,h), (0,0,0))
    d = ImageDraw.Draw(part)
    for i in range(170):
        x = random.uniform(0, w); y = random.uniform(0, h)
        r = random.uniform(1, 3.2)
        col = random.choice([(255,226,150),(200,240,75),(255,182,120),(255,255,255)])
        d.ellipse([x-r, y-r, x+r, y+r], fill=col)
    part = blur(part, 2)
    img = ImageChops.screen(img, part)

    arr = np.asarray(img).astype(np.float32)*vignette(w, h, 0.34)
    img = Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
    img = grain(img, 4, seed=7)
    save(img, "hero.jpg")
    save(img.resize((1600, 900), Image.LANCZOS), "hero-poster.jpg")

# ---------------------------------------------------------------------------
# PORTRAIT - explorer silhouette in lime rim light
# ---------------------------------------------------------------------------
def make_portrait():
    w, h = 900, 1120
    arr = canvas((w,h), ((26,26,34), (20,22,28)))
    arr += radial_glow((w,h), w*0.5, h*0.36, 620, (70,120,70), 0.35)
    img = Image.fromarray(np.clip(arr,0,255).astype(np.uint8)).convert("RGB")

    # soft glow disc behind figure
    glow = Image.new("RGB", (w,h), (0,0,0))
    d = ImageDraw.Draw(glow)
    d.ellipse([w*0.22, h*0.14, w*0.78, h*0.86], fill=(70, 90, 70))
    glow = blur(glow, 90)
    img = Image.blend(img, glow, 0.5)

    # hooded explorer silhouette (stylized)
    fig = Image.new("RGBA", (w,h), (0,0,0,0))
    d = ImageDraw.Draw(fig)
    cx = w*0.5
    # body cloak
    d.polygon([(cx-180, h*0.52),(cx+180, h*0.52),(cx+245, h),(cx-245, h)], fill=(18,18,24,255))
    # shoulders
    d.ellipse([cx-200, h*0.42, cx+200, h*0.72], fill=(16,16,22,255))
    # hood
    d.polygon([(cx-120, h*0.30),(cx, h*0.06),(cx+120, h*0.30),(cx+95, h*0.52),(cx-95, h*0.52)], fill=(14,14,20,255))
    d.ellipse([cx-95, h*0.42, cx+95, h*0.66], fill=(14,14,20,255))
    # face void
    d.ellipse([cx-58, h*0.24, cx+58, h*0.46], fill=(6,6,9,255))
    # lime rim light on left edge
    rim = Image.new("RGBA", (w,h), (0,0,0,0))
    dr = ImageDraw.Draw(rim)
    dr.line([(cx-120, h*0.30),(cx, h*0.06),(cx+120, h*0.30)], fill=(*LIME, 230), width=5, joint="curve")
    dr.line([(cx-165, h*0.50),(cx-118, h*0.50)], fill=(*LIME, 200), width=3)
    rim = blur(rim, 2)
    img = Image.alpha_composite(img.convert("RGBA"), fig).convert("RGB")
    img = Image.alpha_composite(img.convert("RGBA"), rim).convert("RGB")

    # floating lime particles
    part = Image.new("RGB", (w,h), (0,0,0))
    d = ImageDraw.Draw(part)
    for i in range(70):
        x = random.uniform(0,w); y = random.uniform(0,h)
        r = random.uniform(1,3)
        d.ellipse([x-r,y-r,x+r,y+r], fill=(200,240,75))
    part = blur(part, 2)
    img = Image.blend(img, part, 0.55)

    arr = np.asarray(img).astype(np.float32)*vignette(w,h,0.45)
    img = Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
    img = grain(img, 4, seed=11)
    save(img, "avatar.jpg")

# ---------------------------------------------------------------------------
# PROJECT / abstract art cards
# ---------------------------------------------------------------------------
def make_project_card(name, hue, w=1200, h=900):
    arr = canvas((w,h), (tuple(int(c*0.55) for c in hue), (14,14,20)))
    # large soft blob
    arr += radial_glow((w,h), w*0.32, h*0.4, max(w,h)*0.6, hue, 0.5)
    arr += radial_glow((w,h), w*0.72, h*0.68, max(w,h)*0.5, tuple(int(c*0.5) for c in hue), 0.4)
    img = Image.fromarray(np.clip(arr,0,255).astype(np.uint8)).convert("RGB")

    # floating glossy 3d-ish spheres / cubes
    art = Image.new("RGBA", (w,h), (0,0,0,0))
    d = ImageDraw.Draw(art)
    for i in range(26):
        x = random.uniform(0.05,0.95)*w; y = random.uniform(0.1,0.9)*h
        r = random.uniform(18, 120)*(random.uniform(0.5,1))
        base = tuple(min(255,int(c*(0.7+0.6*random.random()))) for c in hue)
        d.ellipse([x-r,y-r,x+r,y+r], fill=(*base, 200))
        # specular highlight
        hr = r*0.28
        d.ellipse([x-r*0.4-hr, y-r*0.45-hr, x-r*0.4+hr, y-r*0.45+hr], fill=(255,255,255,120))
    art = blur(art, 7)
    img = Image.alpha_composite(img.convert("RGBA"), art).convert("RGB")

    # geometry lines / rings
    d = ImageDraw.Draw(img, "RGBA")
    for i in range(3):
        rr = random.uniform(120, 320)
        x = random.uniform(0.2,0.8)*w; y=random.uniform(0.2,0.8)*h
        d.ellipse([x-rr, y-rr, x+rr, y+rr], outline=(*LIME, 70), width=2 if i else 3)

    arr = np.asarray(img).astype(np.float32)*vignette(w,h,0.5)
    img = Image.fromarray(np.clip(arr,0,255).astype(np.uint8))
    img = grain(img, 6, seed=int(hash(name)%999))
    save(img, name)

def make_default_cover(name="card-default.jpg", w=900, h=640):
    make_project_card(name, LIME, w, h)

# ---------------------------------------------------------------------------
# LOGO mark (transparent PNG)
# ---------------------------------------------------------------------------
def make_logo():
    s = 256
    img = Image.new("RGBA", (s,s), (0,0,0,0))
    d = ImageDraw.Draw(img)
    # rounded diamond / mountain mark
    cx, cy = s/2, s/2
    r = 96
    d.polygon([(cx, cy-r*0.9),(cx+r*0.95, cy+r*0.6),(cx-r*0.95, cy+r*0.6)], fill=(*LIME, 255))
    d.polygon([(cx, cy-r*0.35),(cx+r*0.55, cy+r*0.9),(cx-r*0.55, cy+r*0.9)], fill=(*INK, 255))
    img.save(os.path.join(OUT, "logo.png"))
    print("wrote logo.png")

make_hero()
make_portrait()
make_project_card("p1.jpg", (200,240,75))     # lime
make_project_card("p2.jpg", (120,190,255))     # sky
make_project_card("p3.jpg", (255,150,120))     # coral
make_project_card("p4.jpg", (170,120,255))     # violet
make_project_card("p5.jpg", (120,220,190))     # teal
make_project_card("p6.jpg", (255,200,110))     # amber
make_default_cover()
make_logo()
print("DONE")
