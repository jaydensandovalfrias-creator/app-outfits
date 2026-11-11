"""Pega la cabeza original sobre el resultado de la IA.

Detecta la cara en las dos imágenes, escala la foto original para que las
caras midan lo mismo, la alinea y la mezcla con una máscara elíptica de
bordes suavizados. Es la versión que se probó en la prueba 3.

Pendiente según docs/definicion.md: igualar el tono de piel con el cuello
(color transfer). Esta versión todavía no lo hace.

Uso:
    python pegar_cabeza.py persona-original.jpg resultado.jpg salida.jpg [--suavizado 6]
"""
import argparse

from PIL import Image, ImageDraw, ImageFilter

from cara import detectar_cara

# Elipse de la cabeza, relativa a la caja de la cara del resultado (x, y, w)
ELIPSE = (-0.10, -0.385, 1.13, 1.08)  # izquierda, arriba, derecha, abajo


def pegar(original, resultado, salida, suavizado=6):
    ox, oy, ow = detectar_cara(original)
    rx, ry, rw = detectar_cara(resultado)
    escala = rw / ow

    base = Image.open(resultado).convert("RGB")
    orig = Image.open(original).convert("RGB")
    grande = orig.resize((round(orig.width * escala), round(orig.height * escala)), Image.LANCZOS)
    capa = Image.new("RGB", base.size)
    capa.paste(grande, (round(rx - ox * escala), round(ry - oy * escala)))

    i, a, d, b = ELIPSE
    mascara = Image.new("L", base.size, 0)
    ImageDraw.Draw(mascara).ellipse((rx + i * rw, ry + a * rw, rx + d * rw, ry + b * rw), fill=255)
    mascara = mascara.filter(ImageFilter.GaussianBlur(suavizado))

    Image.composite(capa, base, mascara).save(salida, quality=95)
    return escala


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("original")
    p.add_argument("resultado")
    p.add_argument("salida")
    p.add_argument("--suavizado", type=float, default=6, help="radio del desenfoque de la máscara en px")
    a = p.parse_args()
    print(pegar(a.original, a.resultado, a.salida, a.suavizado))
