// Lectura de imágenes desde Storage y revisión de formato y tamaño.
import { ErrorApp } from "./http.ts";

export type TipoImagen = "image/jpeg" | "image/png" | "image/webp";
export interface Imagen {
  bytes: Uint8Array;
  tipo: TipoImagen;
  ancho: number;
  alto: number;
}

/** Lee ancho, alto y tipo de los encabezados de JPEG, PNG o WebP. */
export function inspeccionar(b: Uint8Array): { tipo: TipoImagen; ancho: number; alto: number } | null {
  // PNG: firma de 8 bytes y luego el bloque IHDR.
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { tipo: "image/png", ancho: v.getUint32(16), alto: v.getUint32(20) };
  }
  // JPEG: recorre los marcadores hasta el SOF.
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marcador = b[i + 1];
      if (marcador === 0xff) {
        i++;
        continue;
      }
      const largo = (b[i + 2] << 8) | b[i + 3];
      const esSOF = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
      if (esSOF) {
        return { tipo: "image/jpeg", alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
      }
      if (largo < 2) return null;
      i += 2 + largo;
    }
    return null;
  }
  // WebP: contenedor RIFF con bloque VP8, VP8L o VP8X.
  const ascii = (o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
  if (b.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    const bloque = ascii(12, 4);
    if (bloque === "VP8 ") {
      return { tipo: "image/webp", ancho: ((b[27] << 8) | b[26]) & 0x3fff, alto: ((b[29] << 8) | b[28]) & 0x3fff };
    }
    if (bloque === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { tipo: "image/webp", ancho: (bits & 0x3fff) + 1, alto: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (bloque === "VP8X") {
      return {
        tipo: "image/webp",
        ancho: (b[24] | (b[25] << 8) | (b[26] << 16)) + 1,
        alto: (b[27] | (b[28] << 8) | (b[29] << 16)) + 1,
      };
    }
  }
  return null;
}

// Cliente mínimo de Storage que necesitamos (el de supabase-js lo cumple).
interface ClienteStorage {
  storage: {
    from(bucket: string): {
      download(ruta: string): Promise<{ data: Blob | null; error: unknown }>;
    };
  };
}

/**
 * Descarga una imagen con el cliente del usuario (las políticas de Storage
 * aplican) y revisa que sea una imagen real. Con `referencia`, exige que mida
 * menos de 512 px por lado, como pide flux-2-klein-4b.
 */
export async function descargar(
  cliente: ClienteStorage,
  bucket: string,
  ruta: string,
  referencia: boolean,
): Promise<Imagen> {
  const { data, error } = await cliente.storage.from(bucket).download(ruta);
  if (error || !data) {
    throw new ErrorApp("imagen_no_encontrada", 404, "No encontramos esa imagen en tu cuenta. Vuelve a subirla.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const info = inspeccionar(bytes);
  if (!info) {
    throw new ErrorApp("imagen_invalida", 422, "La imagen debe ser JPEG, PNG o WebP.");
  }
  if (referencia && (info.ancho >= 512 || info.alto >= 512)) {
    throw new ErrorApp(
      "imagen_grande",
      422,
      `La imagen de referencia debe medir menos de 512 px por lado (mide ${info.ancho}x${info.alto}).`,
    );
  }
  return { bytes, ...info };
}

export function aBase64(b: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < b.length; i += 0x8000) {
    binario += String.fromCharCode(...b.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

export function deBase64(texto: string): Uint8Array {
  const binario = atob(texto);
  const b = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) b[i] = binario.charCodeAt(i);
  return b;
}

export function comoDataUrl(img: Imagen): string {
  return `data:${img.tipo};base64,${aBase64(img.bytes)}`;
}
