"""Quita los metadatos EXIF de una foto y la reduce para usarla como referencia.

flux-2-klein-4b pide referencias menores a 512x512, así que por defecto
el lado más largo queda en 511 px. La orientación EXIF se aplica antes de
borrar los metadatos para que la foto no salga girada.

Uso:
    python preparar_foto.py entrada.jpg salida.jpg [--max 511] [--original copia-sin-exif.jpg]
"""
import argparse

from PIL import Image, ImageOps


def preparar(entrada, salida, lado_max=511, copia_original=None):
    imagen = ImageOps.exif_transpose(Image.open(entrada)).convert("RGB")
    if copia_original:
        imagen.save(copia_original, quality=95)
    chica = imagen.copy()
    chica.thumbnail((lado_max, lado_max), Image.LANCZOS)
    chica.save(salida, quality=92)
    return chica.size


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("entrada")
    p.add_argument("salida")
    p.add_argument("--max", type=int, default=511, help="lado más largo en px (default 511)")
    p.add_argument("--original", help="guarda también una copia a tamaño completo sin EXIF")
    a = p.parse_args()
    print(preparar(a.entrada, a.salida, a.max, a.original))
