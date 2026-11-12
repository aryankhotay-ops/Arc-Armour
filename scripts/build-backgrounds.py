"""Build original arcade backdrops from the saved Golden Valley visual language.

Fallback for unavailable image-generation models; NOT AI-generated reference images.
No screenshot crops, tanks, HUD or collision terrain. Keep the flight area quiet.
Editable SVG masters -> 1920x1080 sRGB WebP plates, with bounded transfer size.
Requires Pillow, Node and the project's Playwright Chromium. Run: python3 scripts/build-backgrounds.py.
"""
from pathlib import Path
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/client/src/assets/backgrounds'
MASTERS = ROOT / 'art/backgrounds'
W, H = 1920, 1080


def polygon(points, color, opacity=1):
    p = ' '.join(f'{x:.1f},{y:.1f}' for x, y in points)
    return f'<polygon points="{p}" fill="{color}" opacity="{opacity}"/>'


def hill(y, amp, phase, color, highlight):
    pts = [(x, y + math.sin(x * .0048 + phase) * amp + math.sin(x * .0102 + phase) * amp * .23) for x in range(0, W + 1, 6)]
    path = 'M' + ' L'.join(f'{x},{sy:.1f}' for x, sy in pts)
    return f'<path d="{path} L{W},{H} L0,{H}Z" fill="{color}"/><path d="{path}" fill="none" stroke="{highlight}" stroke-width="2" opacity=".55"/>'


def pine(x, y, height, color, snow=False):
    s = f'<path d="M{x},{y-height}L{x-height*.27},{y-height*.30}H{x+height*.27}Z M{x},{y-height*.72}L{x-height*.36},{y}H{x+height*.36}Z" fill="{color}"/>'
    if snow:
        s += f'<path d="M{x},{y-height}l{-height*.14},{height*.35}h{height*.28}Z" fill="#bed3e2" opacity=".55"/>'
    return s


def peaks(night=False):
    s = ''
    colors = ('#657fa8', '#445e8a', '#b9d3eb') if night else ('#a595ca', '#796aa8', '#e3d1ed')
    for x, y, width, height in [(-90, 630, 210, 320), (345, 588, 310, 360), (735, 655, 260, 300), (1210, 578, 340, 365), (1800, 625, 280, 360)]:
        s += polygon([(x-width, y+height), (x, y), (x+width*1.3, y+height)], colors[0])
        s += polygon([(x,y), (x+width*.16,y+height), (x+width*1.3,y+height)], colors[1])
        s += polygon([(x,y), (x-45,y+100), (x-16,y+78), (x+20,y+119), (x+55,y+70)], colors[2])
        s += polygon([(x,y), (x+20,y+119), (x+55,y+70)], '#90aaca' if night else '#b9a2d4')
    return s


def cloud(x, y, scale, alpha, color):
    return f'<g transform="translate({x} {y}) scale({scale})" opacity="{alpha}" fill="{color}"><ellipse cx="0" cy="18" rx="115" ry="25"/><ellipse cx="-40" cy="0" rx="47" ry="33"/><ellipse cx="17" cy="-12" rx="53" ry="45"/><ellipse cx="69" cy="9" rx="46" ry="29"/></g>'


def plate(theme):
    night = theme == 'moonlit-alpine'
    desert = theme == 'desert-canyon'
    sky = ['#182842', '#2c4c68', '#597991', '#acacb0'] if night else (['#302649', '#855975', '#dd947e', '#f6c69a'] if desert else ['#242052', '#654686', '#ce719d', '#ffd59d'])
    s = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><defs><linearGradient id="sky" x2="0" y2="1">'
    for stop, color in zip([0, .4, .72, 1], sky):
        s += f'<stop offset="{stop}" stop-color="{color}"/>'
    s += '</linearGradient><radialGradient id="glow"><stop stop-color="#ffe9c1" stop-opacity=".26"/><stop offset="1" stop-color="#ffe9c1" stop-opacity="0"/></radialGradient><linearGradient id="orb" x2="0" y2="1"><stop stop-color="#fff6d6"/><stop offset="1" stop-color="' + ('#c9dde9' if night else '#ffc276') + '"/></linearGradient><linearGradient id="aurora" x2="0" y2="1"><stop stop-color="#86dacb" stop-opacity="0"/><stop offset=".55" stop-color="#86dacb" stop-opacity=".14"/><stop offset="1" stop-color="#ab9ddb" stop-opacity="0"/></linearGradient></defs>'
    s += f'<rect width="{W}" height="{H}" fill="url(#sky)"/>'
    if night:
        # Deterministic sparse stars; never twinkle or consume simulation randomness.
        for i in range(66):
            x, y = (i * 277 + 93) % W, (i * 151 + 37) % 580
            s += f'<circle cx="{x}" cy="{y}" r="{1.1 if i % 5 else 1.7}" fill="#d6e9e9" opacity="{.16 + (i % 4) * .08}"/>'
        s += '<path d="M-80,165Q290,60 590,210T1200,170T2010,100L2010,315Q1550,395 1210,345T590,335T-80,380Z" fill="url(#aurora)"/>'
    s += '<ellipse cx="1550" cy="345" rx="370" ry="330" fill="url(#glow)"/><circle cx="1550" cy="345" r="105" fill="#ffe8bf" opacity=".06"/><circle cx="1550" cy="345" r="82" fill="url(#orb)"/>'
    if night:
        for x, y, r in [(1520, 324, 17), (1575, 366, 23), (1525, 387, 10)]:
            s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#7d9cbb" opacity=".12"/>'
    for x, y, size, alpha in [(150,330,1.0,.16), (450,265,1.2,.24), (910,375,.85,.16), (1280,235,1,.17), (1850,455,1.1,.17)]:
        s += cloud(x, y, size, alpha if not night else alpha*.4, '#fff0db' if not night else '#c5d5e8')
    if desert:
        for x, y, width in [(-80,670,320),(325,615,270),(920,685,390),(1420,640,220),(1910,600,330)]:
            points = [(x-width,y+350),(x-width*.7,y+120),(x-width*.55,y+50),(x-width*.50,y),(x+width*.18,y),(x+width*.25,y+100),(x+width*.65,y+180),(x+width,y+350)]
            s += polygon(points, '#b88188')
            s += polygon([(x+width*.18,y),(x+width*.25,y+100),(x+width*.65,y+180),(x+width,y+350),(x-width*.12,y+350),(x-width*.06,y+30)], '#926879')
            s += f'<path d="M{x-width*.48},{y+8}H{x+width*.16}" stroke="#e5aca0" stroke-width="5" opacity=".7"/>'
            for offset in [105,155,215]:
                s += f'<path d="M{x-width*.45},{y+offset}H{x+width*.2}" stroke="#cd9795" stroke-width="3" opacity=".35"/>'
        s += hill(795,44,.7,'#a76a70','#db9790')
        s += hill(872,35,2,'#be856b','#f1bb87')
        s += hill(960,28,4,'#917267','#d6a48a')
        # Distant scrub only: no near cactus silhouettes that could suggest collision.
        for i in range(34):
            x = i*61+9
            y = 960 + math.sin(x*.0048+4)*28 + math.sin(x*.0102+4)*28*.23
            s += f'<path d="M{x},{y}q-7,-16 -13,-6M{x},{y}q0,-22 5,-18M{x},{y}q12,-15 17,-5" fill="none" stroke="#706263" stroke-width="3"/>'
    else:
        s += peaks(night)
        s += hill(782,43,.8, '#526884' if night else '#7968a1', '#98aabe' if night else '#c39cba')
        s += hill(876,37,2, '#395f76' if night else '#578685', '#7799ae' if night else '#91b49e')
        for i in range(84):
            x = i*24+4
            y = 876 + math.sin(x*.0048+2)*37 + math.sin(x*.0102+2)*37*.23
            s += pine(x,y,18+(i*17)%22, '#304e68' if night else '#3e7070', night)
        s += hill(955,29,4,'#304f66' if night else '#417969', '#7596a5' if night else '#91b37e')
        for i in range(55):
            x = i*37+5
            y = 955+math.sin(x*.0048+4)*29+math.sin(x*.0102+4)*29*.23
            s += pine(x,y,22+(i*13)%26, '#294359' if night else '#326557', night)
    s += '</svg>\n'
    return s


def main():
    import subprocess
    import tempfile
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    MASTERS.mkdir(parents=True, exist_ok=True)
    themes = ['golden-valley', 'desert-canyon', 'moonlit-alpine']
    for theme in themes:
        svg = plate(theme)
        (MASTERS / f'{theme}.svg').write_text(svg, encoding='utf-8')
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['node', str(ROOT / 'scripts/rasterize-backgrounds.mjs'), tmp], check=True)
        for theme in themes:
            image = Image.open(Path(tmp) / f'{theme}.png').convert('RGB')
            path = OUT / f'{theme}.webp'
            image.save(path, 'WEBP', quality=88, method=6)
            print(f'{theme}: {W}x{H}, {path.stat().st_size:,} bytes')
            assert image.size == (W, H)
            assert path.stat().st_size < 220_000, 'Background exceeds 220 kB budget'


if __name__ == '__main__':
    main()
