"""Detección de cara compartida por los demás scripts (OpenCV, clasificador Haar)."""
import cv2


def detectar_cara(ruta):
    """Devuelve (x, y, lado) de la cara más grande, o lanza ValueError si no hay."""
    gris = cv2.cvtColor(cv2.imread(ruta), cv2.COLOR_BGR2GRAY)
    clasificador = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    caras = clasificador.detectMultiScale(gris, 1.05, 5, minSize=(20, 20))
    if len(caras) == 0:
        raise ValueError(f"no se encontró una cara en {ruta}")
    x, y, w, _ = max(caras, key=lambda c: c[2])
    return int(x), int(y), int(w)
