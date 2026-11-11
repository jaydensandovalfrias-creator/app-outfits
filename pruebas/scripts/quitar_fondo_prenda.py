"""Quita el fondo de la foto de una prenda con GrabCut (OpenCV) y la recorta.

En la prueba 3, además del rectángulo, se marcaron a mano zonas de fondo
(el pantalón gris y la cobija). Aquí se pueden pasar con --fondo como
polígonos en coordenadas de la foto original: "x1,y1 x2,y2 x3,y3 ...".
En la app esto se hará en el navegador; este script es la referencia.

Uso:
    python quitar_fondo_prenda.py prenda-original.jpg sudadera-511.jpg \
        [--margen 0.03] [--fondo "0,0 700,0 700,300 0,500"] [--lado 511]
"""
import argparse

import cv2
import numpy as np
from PIL import Image

GRIS_FONDO = 235


def quitar_fondo(entrada, salida, margen=0.03, poligonos_fondo=(), lado=511, alto_trabajo=700):
    img = cv2.imread(entrada)
    H, W = img.shape[:2]
    k = alto_trabajo / H
    chica = cv2.resize(img, (round(W * k), alto_trabajo), interpolation=cv2.INTER_AREA)
    h, w = chica.shape[:2]

    mascara = np.full((h, w), cv2.GC_BGD, np.uint8)
    mx, my = round(w * margen), round(h * margen)
    mascara[my:h - my, mx:w - mx] = cv2.GC_PR_FGD
    for pol in poligonos_fondo:
        cv2.fillPoly(mascara, [(np.array(pol, np.float32) * k).astype(np.int32)], cv2.GC_BGD)

    bgd, fgd = np.zeros((1, 65)), np.zeros((1, 65))
    cv2.grabCut(chica, mascara, None, bgd, fgd, 10, cv2.GC_INIT_WITH_MASK)
    m = np.where((mascara == cv2.GC_FGD) | (mascara == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # Limpieza: quita ruido, se queda con la pieza más grande y rellena huecos
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, etiquetas, stats, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        mayor = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        m = np.where(etiquetas == mayor, 255, 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    relleno = m.copy()
    cv2.floodFill(relleno, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    m = m | cv2.bitwise_not(relleno)

    M = cv2.GaussianBlur(cv2.resize(m, (W, H)), (15, 15), 0)
    x, y, bw, bh = cv2.boundingRect((M > 127).astype(np.uint8))
    alfa = (M.astype(np.float32) / 255)[..., None]
    sin_fondo = (img * alfa + GRIS_FONDO * (1 - alfa)).astype(np.uint8)[y:y + bh, x:x + bw]
    sin_fondo = cv2.copyMakeBorder(sin_fondo, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=(GRIS_FONDO,) * 3)

    resultado = Image.fromarray(cv2.cvtColor(sin_fondo, cv2.COLOR_BGR2RGB))
    resultado.thumbnail((lado, lado), Image.LANCZOS)
    resultado.save(salida, quality=95)
    return resultado.size


def leer_poligono(texto):
    return [tuple(float(v) for v in punto.split(",")) for punto in texto.split()]


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("entrada")
    p.add_argument("salida")
    p.add_argument("--margen", type=float, default=0.03, help="borde que se toma como fondo seguro (fracción)")
    p.add_argument("--fondo", action="append", default=[], help="polígono extra de fondo; se puede repetir")
    p.add_argument("--lado", type=int, default=511)
    a = p.parse_args()
    print(quitar_fondo(a.entrada, a.salida, a.margen, [leer_poligono(f) for f in a.fondo], a.lado))
