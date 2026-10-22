"""
把角色设定图（1536×1024，左边全身像、中间 4×2 表情、右边 3×2 动作）切成游戏用的素材：
  src/chars/art/<id>_pose0.webp   左边大全身像（透明底，高 400）
  src/chars/art/<id>_pose1-6.webp 6 个动作（透明底，高 400，按设定图从左到右、从上到下）
  src/chars/art/<id>_face0-7.webp 8 个表情头像（160×160，保留面板浅色底）

用法：pip install rembg pillow scipy；python3 scripts/cut_art.py 设定图目录   （文件名 = 角色 id，如 docs/art/xiaoting.webp）
抠图用 rembg 的 isnet-anime 模型（专门针对动漫角色）。
"""
import sys, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage
from rembg import new_session, remove

OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'chars', 'art')
REG = {'full': (0, 90, 445, 935), 'face': (432, 60, 1058, 500), 'act': (1052, 60, 1536, 690)}
PH = 400
sess = new_session('isnet-anime')


def comps(rgba, ox, oy, min_area=3000):
    a = np.asarray(rgba)[:, :, 3] > 40
    lab, _ = ndimage.label(ndimage.binary_dilation(a, iterations=2))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        area = int((lab[sl] == i + 1).sum())
        if area > min_area:
            out.append(dict(x=sl[1].start + ox, y=sl[0].start + oy, w=sl[1].stop - sl[1].start, h=sl[0].stop - sl[0].start, area=area, label=i + 1))
    return sorted(out, key=lambda c: -c['area']), lab


def cut(rgba, lab, c, ox, oy):
    arr = np.asarray(rgba).copy()
    arr[:, :, 3] = np.where(lab == c['label'], arr[:, :, 3], 0)  # 只留这一个人，去掉旁边的小图、星星
    x, y = c['x'] - ox, c['y'] - oy
    return Image.fromarray(arr).crop((x - 2, y - 2, x + c['w'] + 2, y + c['h'] + 2))


def save_pose(img, path):
    s = PH / img.height
    img.resize((max(1, round(img.width * s)), PH), Image.LANCZOS).save(path, 'WEBP', quality=80, method=6)


for src in sorted(sum((glob.glob(os.path.join(sys.argv[1], e)) for e in ('*.png', '*.webp', '*.jpg')), [])):
    n = os.path.splitext(os.path.basename(src))[0]
    sheet = Image.open(src).convert('RGB')
    parts = {}
    for k, (x0, y0, x1, y1) in REG.items():
        rgba = remove(sheet.crop((x0, y0, x1, y1)), session=sess)
        parts[k] = (rgba, *comps(rgba, x0, y0), x0, y0)

    rgba, cs, lab, ox, oy = parts['full']
    save_pose(cut(rgba, lab, cs[0], ox, oy), f'{OUT}/{n}_pose0.webp')
    rgba, cs, lab, ox, oy = parts['act']
    for i, c in enumerate(sorted(cs[:6], key=lambda c: ((c['y'] - 60) // 200, c['x']))):
        save_pose(cut(rgba, lab, c, ox, oy), f'{OUT}/{n}_pose{i + 1}.webp')

    # 表情：抠图在这里不总是可靠，只用它找格子位置；缺的格子按等距补上
    fs = [f for f in parts['face'][1] if 110 <= f['w'] <= 150 and 140 <= f['h'] <= 190]
    rows = [sorted([f for f in fs if (f['y'] < 200) == (r == 0)], key=lambda f: f['x']) for r in range(2)]
    full = [r for r in rows if len(r) == 4]
    if full:
        cols = [f['x'] + f['w'] / 2 for f in full[0]]
    else:
        c0 = (rows[0] or rows[1])[0]
        c0 = c0['x'] + c0['w'] / 2
        k = round((c0 - 514) / 151)
        cols = [c0 + (i - k) * 151 for i in range(4)]
    tops = [min(f['y'] for f in r) if r else None for r in rows]
    tops[0] = tops[0] if tops[0] is not None else tops[1] - 205
    tops[1] = tops[1] if tops[1] is not None else tops[0] + 205
    for r in range(2):
        for ci in range(4):
            cx = cols[ci]
            for f in rows[r]:
                if abs(f['x'] + f['w'] / 2 - cx) < 50:
                    cx = f['x'] + f['w'] / 2
            side, top = 128, tops[r] - 2
            box = (int(cx - side / 2), int(top), int(cx + side / 2), int(top + side))
            sheet.crop(box).resize((160, 160), Image.LANCZOS).save(f'{OUT}/{n}_face{r * 4 + ci}.webp', 'WEBP', quality=82, method=6)
    print('ok', n)
