"""Add Pencil Study and Earthrise without replacing the original three backgrounds.

User intent: visible pencil-drawn scenery, and lunar surface with Earth in black space.
The user's reference attachment is not accessible here. Image generation is unavailable.
Build deterministic high-resolution raster artwork offline; no per-frame noise rendering.
Pencil uses paper grain, broken graphite strokes and cross-hatching, not vector recoloring.
Earthrise uses an attributed NASA Earth image when present, with original lunar terrain.
Live collision ground is NOT baked into these plates; matching runtime terrain is separate.
"""
from pathlib import Path
import math
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/client/src/assets/backgrounds'
ART = ROOT / 'art/backgrounds'
W, H = 1920, 1080

def noise(rng, scale, amplitude):
    a = rng.normal(0, amplitude, (max(2, H // scale), max(2, W // scale))).astype(np.float32)
    return np.asarray(Image.fromarray(a).resize((W, H), Image.Resampling.BICUBIC))


def rough_line(draw, points, rng, fill, width=1, jitter=1.3):
    """Short gaps and pressure changes prevent an SVG-perfect outline."""
    for start, end in zip(points, points[1:]):
        length = math.dist(start, end)
        count = max(2, int(length / 7))
        pts = [(start[0] + (end[0] - start[0]) * t / count + rng.uniform(-jitter, jitter),
                start[1] + (end[1] - start[1]) * t / count + rng.uniform(-jitter, jitter))
               for t in range(count + 1)]
        for i in range(len(pts) - 1):
            if rng.random() > .07:
                draw.line(pts[i:i+2], fill=fill, width=width)


def hatch_polygon(canvas, polygon, rng, shade, density=7, slope=-1.5, cross=False):
    mask = Image.new('L', (W, H))
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    strokes = Image.new('RGB', (W, H), (255, 255, 255))
    d = ImageDraw.Draw(strokes)
    xs, ys = zip(*polygon)
    for y in range(int(min(ys))-600, min(H, int(max(ys)))+500, density):
        x = min(xs) - 30
        while x < max(xs) + 50:
            length = rng.uniform(25, 85)
            dx = length / math.sqrt(1 + slope*slope)
            dy = dx * slope
            color = rng.randint(max(65, shade-22), min(250, shade+30))
            rough_line(d, [(x,y+rng.uniform(-5,5)), (x+dx,y+dy)], rng, (color,)*3, jitter=.85)
            x += dx + rng.uniform(2,12)
    if cross:
        for y in range(int(min(ys)), min(H, int(max(ys)))+50, density*3):
            rough_line(d, [(min(xs)-20,y),(max(xs)+30,y-70)], rng, (shade+15,)*3, jitter=2)
    textured = ImageChops.multiply(canvas, strokes)
    return Image.composite(textured, canvas, mask)


def pencil():
    rng = random.Random(71731)
    nr = np.random.default_rng(5172)
    yy, xx = np.mgrid[:H,:W]
    grain = noise(nr, 3, 1.0) + noise(nr, 90, 1.2) + nr.normal(0,.65,(H,W))
    vignette = ((xx-W*.45)**2/W**2 + (yy-H*.45)**2/H**2)*2
    paper = np.stack([np.clip(base+grain-vignette,0,255) for base in (245,242,233)],axis=-1).astype(np.uint8)
    canvas = Image.fromarray(paper)
    d = ImageDraw.Draw(canvas)
    # Long, dry-pencil cirrus gestures, not the old filled cloud silhouettes.
    for cx, cy, width in [(230,210,340),(820,145,460),(1520,225,370)]:
        for i in range(15):
            y = cy + i*2.6
            a = cx-width*.5 + rng.uniform(-35,35)
            b = cx+width*.5 + rng.uniform(-20,20)
            pts = [(x, y + math.sin((x-cx)/width*5)*8) for x in range(int(a),int(b),9)]
            rough_line(d,pts,rng,(217+i%5,214+i%5,207+i%5),jitter=.9)
    # Lightly constructed sun, with deliberately incomplete rings.
    for i in range(4):
        points = [(1570+math.cos(t)*58+rng.uniform(-1.5,1.5), 331+math.sin(t)*58+rng.uniform(-1.5,1.5))
                  for t in np.linspace(.25+i*.04,6.15-i*.06,150)]
        rough_line(d,points,rng,(202,200,193),jitter=.6)
    # Distant mountain mass, softened with airy graphite contour passes.
    distant = [(0,692),(170,566),(292,632),(415,510),(590,657),(790,571),(975,661),(1155,535),(1350,668),(1550,562),(1710,600),(1840,514),(1920,613)]
    d.polygon(distant+[(W,H),(0,H)],fill=(231,229,222))
    for i in range(3):
        rough_line(d,distant,rng,(190+i*7,189+i*7,183+i*7),jitter=2.0)
    # Faceted mountain faces shaded by thousands of clipped, broken pencil strokes.
    faces = [(240,660,610,435,920,810),(1030,730,1280,482,1550,815),(-200,840,105,563,440,840),(1480,835,1775,530,2040,825)]
    for left,base,peak,top,right,bottom in faces:
        outline = [(left,base),(peak-100,top+130),(peak,top),(peak+58,top+63),(right,bottom)]
        d = ImageDraw.Draw(canvas)
        d.polygon(outline+[(right,H),(left,H)],fill=(230,228,220))
        leftface = [(left,base),(peak-100,top+130),(peak,top),(peak-12,top+120),(peak+90,bottom),(left,bottom)]
        rightface = [(peak,top),(peak+58,top+63),(right,bottom),(peak+90,bottom),(peak-12,top+120)]
        canvas = hatch_polygon(canvas,leftface,rng,201,density=10,slope=-1.6)
        canvas = hatch_polygon(canvas,rightface,rng,168,density=6,slope=1.8,cross=True)
        d = ImageDraw.Draw(canvas)
        for i in range(3):
            rough_line(d,outline,rng,(130+i*15,129+i*15,124+i*15),jitter=1.8,width=1)
        # Crevices flow downhill from the ridge with varying pencil pressure.
        for i in range(23):
            t = i/24
            x = peak+(right-peak)*t
            y = top+(bottom-top)*t
            endx=x+rng.uniform(10,90)
            endy=y+rng.uniform(45,170)
            rough_line(d,[(x,y),(x+rng.uniform(-18,18),y+25),(endx,endy)],rng,(172,170,164),jitter=2)
        for i in range(10):
            x = peak-20-i*9
            y = top+60+i*11
            rough_line(d,[(x,y),(x-10,y+46),(x-70,y+105)],rng,(175,173,168),jitter=2)
    # Crosshatched foothills curve across the lower edge; no walkable ground is baked in.
    for base,amp,phase,shade in [(825,47,.2,205),(924,36,2,193),(1020,26,4,180)]:
        pts=[(x,base+math.sin(x*.0043+phase)*amp+math.sin(x*.011)*9) for x in range(0,W+1,8)]
        canvas = hatch_polygon(canvas,pts+[(W,H),(0,H)],rng,shade,density=8,slope=-.6,cross=True)
        d=ImageDraw.Draw(canvas)
        for i in range(3): rough_line(d,pts,rng,(151+i*13,149+i*13,143+i*13),jitter=2)
        for offset in range(15,125,18):
            rough_line(d,[(x,y+offset) for x,y in pts],rng,(202,199,192),jitter=2)
    # Hand-marked sparse conifers and shrubs at the margins, not flat triangle stamps.
    d=ImageDraw.Draw(canvas)
    for x in list(range(0,480,26))+list(range(1450,1920,30)):
        y=922+math.sin(x*.0043+2)*36+math.sin(x*.011)*9
        height=rng.uniform(18,42)
        rough_line(d,[(x,y-height),(x+1,y+3)],rng,(125,125,121),jitter=.5)
        for h in range(4,int(height),4):
            spread=h*.25
            rough_line(d,[(x-spread,y-height+h+4),(x,y-height+h),(x+spread,y-height+h+5)],rng,(145,144,139),jitter=.7)
    return canvas


def earthrise():
    nr = np.random.default_rng(61727)
    rng = random.Random(61727)
    yy,xx=np.mgrid[:H,:W]
    # Black space, not a blue atmospheric sky. Sparse stars deliberately dim.
    field=np.zeros((H,W,3),dtype=np.float32)
    for i,value in enumerate((3,5,10)): field[:,:,i]=value+yy/H*(1+i)
    canvas=Image.fromarray(np.uint8(field))
    d=ImageDraw.Draw(canvas)
    for i in range(155):
        x,y=rng.randrange(W),rng.randrange(690)
        v=rng.randrange(32,110)
        d.ellipse((x,y,x+(1 if i%13 else 2),y+(1 if i%13 else 2)),fill=(v,v,min(255,v+9)))
    # Official NASA Apollo 17 Blue Marble, composited locally, never hotlinked at runtime.
    src=Image.open(ART/'source/nasa-apollo17-earth.jpg').convert('RGB')
    earth=src.crop((26,26,1015,1015)).resize((324,324),Image.Resampling.LANCZOS)
    mask=Image.new('L',(324,324))
    ImageDraw.Draw(mask).ellipse((2,2,322,322),fill=255)
    mask=mask.filter(ImageFilter.GaussianBlur(.8))
    glow=Image.new('RGBA',(W,H))
    gd=ImageDraw.Draw(glow)
    gd.ellipse((1404,159,1740,495),fill=(79,146,215,55))
    glow=glow.filter(ImageFilter.GaussianBlur(7))
    canvas=Image.alpha_composite(canvas.convert('RGBA'),glow).convert('RGB')
    canvas.paste(earth,(1410,165),mask)
    # Low, rugged lunar ranges: multi-scale relief, side-lit as airless regolith.
    for layer in range(3):
        base=[747,844,995][layer]
        amp=[61,32,18][layer]
        xs=np.arange(W)
        ridge=base+np.sin(xs*.005+layer*2)*amp+np.sin(xs*.012+1)*amp*.37+np.sin(xs*.04)*amp*.10+np.sin(xs*.091)*2
        ridge-=np.exp(-((xs-180)/180)**2)*72 if layer==0 else 0
        ridge-=np.exp(-((xs-1760)/160)**2)*48 if layer==0 else 0
        maskarr=yy>=ridge[np.newaxis,:]
        # Directional rolling relief rather than featureless gray silhouettes.
        broad=noise(nr,115,20)+noise(nr,36,10)+noise(nr,9,3)+nr.normal(0,1.6,(H,W))
        relief=np.sin(xx*.018+np.sin(yy*.009))*3
        shade=([89,100,112][layer]+broad+relief+(yy-base)*.025)
        # Crater bowls with opposing bright rim/dark inner wall, not uniformly drawn rings.
        for i in range([95,135,155][layer]):
            cx=rng.randrange(-50,W+50)
            cy=rng.randrange(base+25,H+110)
            rx=rng.uniform(5,46)*(1+layer*.16)
            ry=rx*rng.uniform(.19,.42)
            x0=max(0,int(cx-rx*1.5));x1=min(W,int(cx+rx*1.5)+1)
            y0=max(0,int(cy-ry*1.6));y1=min(H,int(cy+ry*1.6)+1)
            if x0>=x1 or y0>=y1: continue
            lx=(xx[y0:y1,x0:x1]-cx)/rx
            ly=(yy[y0:y1,x0:x1]-cy)/ry
            radius=np.sqrt(lx*lx+ly*ly)
            bowl=-np.exp(-(radius/.77)**4)*12
            rim=np.exp(-((radius-1)/.11)**2)*(-lx*.65-ly*.60)*24
            shade[y0:y1,x0:x1]+=bowl+rim
        # Small highland ridges cast sharp cold shadows near the visible skyline.
        depth=yy-ridge[np.newaxis,:]
        edge=np.exp(-depth/20)*(5+np.sin(xx*.028)*6)
        shade+=edge
        rock=np.stack([np.clip(shade*.96,0,255),np.clip(shade*.98,0,255),np.clip(shade*1.035,0,255)],axis=-1).astype(np.uint8)
        canvas=Image.composite(Image.fromarray(rock),canvas,Image.fromarray(np.uint8(maskarr)*255))
    return canvas


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for name,build in [('pencil-study',pencil),('lunar-earthrise',earthrise)]:
        image=build().convert('RGB')
        # Keep lossless local masters separate from deployable images.
        image.save(ART/f'{name}-master.png',optimize=True)
        path=OUT/f'{name}.webp'
        image.save(path,'WEBP',quality=82,method=6)
        print(f'{name}: {image.size}, {path.stat().st_size:,} bytes')
        assert image.size==(W,H)
        assert path.stat().st_size<300_000,'Background exceeds 300 kB transfer budget'


if __name__=='__main__':
    main()
