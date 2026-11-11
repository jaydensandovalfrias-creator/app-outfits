# Scripts de las pruebas

Código de las pruebas de conexión y del probador con flux-2-klein-4b. Solo código: las fotos van en `pruebas/fotos/`, que está en `.gitignore` y nunca se sube.

## Instalar

```bash
python3 -m venv .venv
.venv/bin/pip install -r pruebas/scripts/requirements.txt
```

## Flujo de la prueba 3

Todos los comandos se corren desde `pruebas/scripts/`.

```bash
python preparar_foto.py persona.jpg ../fotos/persona-511.jpg --original ../fotos/persona-original.jpg
python preparar_foto.py prenda.jpg ../fotos/prenda-511.jpg --original ../fotos/prenda-original.jpg
python recortar_cabeza.py ../fotos/persona-original.jpg ../fotos/cabeza-511.jpg
python quitar_fondo_prenda.py ../fotos/prenda-original.jpg ../fotos/sudadera-511.jpg
./generar.sh ../fotos/resultado.jpg "Dress the person from the first image in the hoodie from the second image. The face and hair must match the third image exactly. Keep the body shape, pose, shorts and background from the first image unchanged. Full body photo." 768 1024 ../fotos/persona-511.jpg ../fotos/sudadera-511.jpg ../fotos/cabeza-511.jpg
python pegar_cabeza.py ../fotos/persona-original.jpg ../fotos/resultado.jpg ../fotos/resultado-cabeza-pegada.jpg
```

## Lo que se midió

| Prueba | Referencias | Neuronas | Tiempo |
| --- | --- | --- | --- |
| 1, solo texto 1024x1024 | 0 | 104.20 | 4.4 s |
| 2, persona + prenda 768x1024 | 2 | 112.22 | 4.6 s |
| 3, persona + prenda + cabeza 768x1024 | 3 | 117.71 | 4.9 s |

El plan gratis de Workers AI da 10,000 neuronas al día.

## Límites conocidos

- La detección de cara usa el clasificador Haar de OpenCV: funciona con fotos de frente y falla de perfil.
- `quitar_fondo_prenda.py` sin `--fondo` puede dejar pedazos de lo que rodea a la prenda cuando la foto está tomada sobre la cama. En la prueba 3 se marcaron a mano dos zonas de fondo.
- `pegar_cabeza.py` todavía no iguala el tono de piel (color transfer), y tampoco existe aún la corrección de color de las prendas. Las dos están en `docs/definicion.md`.
