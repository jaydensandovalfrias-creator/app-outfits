"""Recorta la cabeza (cara y cabello) de una foto de cuerpo completo.

Parte de la caja de la cara que detecta OpenCV y la agranda para incluir
el cabello y la barbilla. Las proporciones salen de la prueba 3, donde la
cabeza quedó completa con poco fondo.

Uso:
    python recortar_cabeza.py persona-original.jpg cabeza-511.jpg [--lado 511]
"""
import argparse

from PIL import Image

from cara import detectar_cara

# Relativo al ancho de la cara detectada (w)
CENTRO_X = 0.51   # centro horizontal del recorte: x + 0.51w
ARRIBA = 0.46     # el recorte empieza 0.46w arriba de la caja (cabello)
TAMANO = 1.55     # lado del recorte cuadrado: 1.55w


def recortar(entrada, salida, lado=511):
    x, y, w = detectar_cara(entrada)
    s = round(TAMANO * w)
    izq = round(x + CENTRO_X * w - s / 2)
    arr = round(y - ARRIBA * w)
    cabeza = Image.open(entrada).convert("RGB").crop((izq, arr, izq + s, arr + s))
    cabeza.resize((lado, lado), Image.LANCZOS).save(salida, quality=95)
    return (izq, arr, s)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("entrada")
    p.add_argument("salida")
    p.add_argument("--lado", type=int, default=511)
    a = p.parse_args()
    print(recortar(a.entrada, a.salida, a.lado))
