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

### Pantalla principal elegida: A, abre en el probador

- Arriba: el nombre "Vestidor" y el botón para agregar prenda.
- En medio: la silueta con el outfit actual y el botón "Verlo en mí".
- Abajo: pestañas Arriba, Abajo y Calzado, con una tira de prendas para tocar y poner.
- Barra inferior: Vestidor, Probador (activa al abrir) y Recomiéndame.

### Tokens

- Color: hueso (marca) `#EDE6D8`, fondo `#0F0E0D`, superficie `#1A1918`, superficie 2 `#252321`, borde `#34312E`, texto `#E4DFD6`, texto secundario `#9C968D`, error `#E5675A`, advertencia `#E0B04A`, éxito `#6DBE8A`.
- El acento hueso solo marca la acción principal y lo seleccionado. Error, advertencia y éxito se usan únicamente para estados.
- Tipografía: Archivo. El nombre "Vestidor" va expandido (ancho 125%, peso 700). Escala: 12, 14, 16, 20, 25 y 31 px.
- Espaciado: 4, 8, 12, 16, 24, 32, 48 y 64 px.
- Radios: 8 px en fotos, 14 px en paneles y 999 px en botones.
- Áreas táctiles de al menos 44 px.

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

- Pegar mi cabeza original con máscara suavizada igualando tono de piel con el cuello (color transfer), y corregir el color de cada prenda comparando su color promedio real contra el generado. Reúsa el código de `pruebas/scripts/`.

### Cuota

- 10,000 neuronas diarias para toda la app (~40 outfits con calzado). Límite diario por usuario configurable y contador visible.

## Análisis de cuerpo

- Con un modelo de visión gratis de NVIDIA: tono de piel y colores que favorecen, y proporciones para recomendar cortes y largos. Se guarda en el perfil y alimenta el modo Recomiéndame.

## Stack, privacidad y seguridad

- PWA instalable en Vercel; Supabase (Auth, base de datos, Storage); todas las llamadas con API keys en Supabase Edge Functions.
- Fotos en buckets privados con RLS, URLs firmadas de caducidad corta, EXIF eliminado antes de subir. API keys solo en secretos de Edge Functions; solo la anon key va al cliente. `pruebas/fotos/` sigue en `.gitignore`.
- Skeleton del mismo tamaño que el contenido final; vista de progreso propia durante "Verlo en mí"; spinner solo en acciones cortas. Accesibilidad completa y prefers-reduced-motion. Dime el nombre técnico de cada animación que uses.

## Skills (en `.claude/skills/` del repo)

- frontend-design: repo github.com/anthropics/claude-code, carpeta `plugins/frontend-design`. Desde ahora.
  - Nota de instalación: esa carpeta ya no está en anthropics/claude-code. Su marketplace apunta a github.com/anthropics/claude-plugins-official, carpeta `plugins/frontend-design`, y de ahí se instaló.
- supabase/agent-skills: se instala con `npx skills add supabase/agent-skills`. Desde la fase 1.
- apple-design y emil-design-eng: repo github.com/emilkowalski/skills. Solo en la fase 5, una a la vez.
- Antes de instalar cada una, confirmar que existe en esa fuente.

## Fases

Detenerse al final de cada una para revisión.

0. Instala frontend-design y supabase/agent-skills en `.claude/skills/` y confirma que cargan. Luego dime paso a paso qué configuro yo en Supabase, Vercel, NVIDIA y en el entorno de Claude Code (dominios permitidos y secretos). Espera a que te confirme cada cosa.
1. Base de datos, Storage, Auth y Edge Functions, con pruebas de que RLS bloquea el acceso entre usuarios.
2. Interfaz con la pantalla A como base: login, vestidor, subir prenda, perfil con maniquí, consentimiento y análisis. Aquí conectamos Chrome DevTools MCP.
3. Probador: silueta con arrastre y "Verlo en mí".
4. Recomiéndame con "no match".
5. Pulido con apple-design y emil-design-eng, y PWA instalable.
6. Revisión antes de publicar: secretos fuera del repo, RLS, auth del lado del servidor, rate limiting y logs, validación de inputs, tipos y tamaño de archivos, API que devuelva solo lo necesario, security headers, HTTPS, escaneo de dependencias. Dime cómo comprobaste cada punto, junta la rama con main y despliega en Vercel.
