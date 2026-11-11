# Vestidor: definición final

Esta definición reemplaza todo lo acordado antes.

## Usuarios

- Solo la familia: yo, mi hermano y mi mamá. Cada quien tiene su cuenta, su vestidor y su maniquí.
- Todo es privado entre cuentas.
- El registro público está desactivado. Las cuentas las creo yo.
- Como es solo familia, no hace falta aviso de privacidad formal. Sí hay una pantalla de consentimiento simple en dos momentos: antes de subir la foto de cuerpo y antes del análisis. Esa pantalla explica que la foto se manda a NVIDIA y a Cloudflare.

## Identidad (ya decidida)

- Nombre: Vestidor.
- Estilo oscuro tipo app de moda: fondo casi negro, fotos grandes y un solo acento blanco hueso.
- Prohibido: degradados morados, brillos, franjas de color en tarjetas y titulares gigantes en serif cursiva.
- Design tokens: paleta (marca, neutros, error, advertencia, éxito) y escalas fijas de tipografía y espaciado.
- Pensada primero para celular.
- Antes de construir la interfaz se presentan 3 propuestas de la pantalla principal, dentro de este estilo, para elegir una.

## Vestidor

1. Subo la foto de la prenda.
2. Se le quita el fondo en el navegador.
3. La IA propone etiquetas: tipo (arriba, abajo o calzado), color, estilo, temporada y formalidad.
4. Yo confirmo o corrijo las etiquetas.

## Modo 1: Recomiéndame

- Cuestionario: ocasión, clima, estilo o vibra, colores y nivel de formalidad. Además, "Otro" y "contexto extra" como campos opcionales de texto libre.
- La IA cruza las respuestas con mis prendas y con mi análisis de cuerpo.
- Si no hay match, dice exactamente qué me falta. Ejemplo: "te falta un pantalón formal oscuro".
- Modelo de texto gratis de NVIDIA (integrate.api.nvidia.com, compatible con la API de OpenAI). Hay que confirmar en build.nvidia.com cuál tiene Free Endpoint.

## Modo 2: Probador (solo de frente)

### Silueta

Arrastro prendas (arriba, abajo y calzado) y se ven encimadas al instante en el navegador, sin llamar a ninguna API.

### Botón "Verlo en mí"

Genera la foto realista con Cloudflare Workers AI, modelo `@cf/black-forest-labs/flux-2-klein-4b`, en dos pasadas:

1. Cuerpo completo + cabeza recortada + arriba + abajo.
2. Resultado de la pasada 1 + cabeza + calzado.

Datos técnicos de la API:

- Referencias en `input_image_0` a `input_image_3`, cada una menor a 512x512.
- Salida de 768x1024.
- Entrada en `multipart/form-data`.
- Respuesta: JPEG en base64 dentro de `result.image`.

### Postproceso

- Pegar mi cabeza original con máscara suavizada, igualando el tono de piel con el cuello (color transfer).
- Corregir el color de cada prenda comparando su color promedio real contra el generado.
- Reusar el código de las pruebas en `pruebas/`.
