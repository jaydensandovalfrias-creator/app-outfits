// Pruebas locales de la lógica que no llama a servicios externos.
// Correr con: deno test supabase/functions/_shared/
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1.0.13";
import { Image } from "jsr:@matmen/imagescript@1.3.0";
import { deBase64, inspeccionar } from "./imagen.ts";
import { estimarNeuronas } from "./cloudflare.ts";
import { extraerJson } from "./nvidia.ts";
import { ErrorApp } from "./http.ts";
import { entero, listaIA, opcionIA, rutaPropia, texto } from "./validar.ts";

const USUARIO = "0d1c2b3a-4f5e-4a6b-8c7d-9e0f1a2b3c4d";

Deno.test("inspeccionar lee tamaño y tipo de JPEG y PNG", async () => {
  const img = new Image(300, 200);
  img.fill(0x336699ff);
  assertEquals(inspeccionar(await img.encodeJPEG(80)), { tipo: "image/jpeg", ancho: 300, alto: 200 });
  assertEquals(inspeccionar(await img.encode()), { tipo: "image/png", ancho: 300, alto: 200 });
});

Deno.test("inspeccionar lee WebP con pérdida, sin pérdida y con transparencia", () => {
  const casos = [
    "UklGRrAAAABXRUJQVlA4IKQAAABwEACdASosAcgAPm02mUmkIyKhICgAgA2JaW7hdrEbQAnsA99snIe+2Yy09snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snH8AD+/8hffzse4P/QfDTt6wTAAAAAAAAAAA==",
    "UklGRiQAAABXRUJQVlA4TBgAAAAvK8ExAAdQiirUo/8BAEX6/58i+p/6/zU=",
    "UklGRtwAAABXRUJQVlA4WAoAAAAQAAAAKwEAxwAAQUxQSBIAAAABB1DAiAgAKNL//xTR/9T/rwFWUDggpAAAAHAQAJ0BKiwByAA+bTaZSaQjIqEgKACADYlpbuF2sRtACewD32ych77ZjLT2ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ych77ZOQ99snIe+2TkPfbJyHvtk5D32ycfwAP7/yF9/Ox7g/9B8NO3rBMAAAAAAAAAA",
  ];
  for (const b64 of casos) {
    assertEquals(inspeccionar(deBase64(b64)), { tipo: "image/webp", ancho: 300, alto: 200 });
  }
});

Deno.test("inspeccionar rechaza lo que no es imagen", () => {
  assertEquals(inspeccionar(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assertEquals(inspeccionar(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00])), null);
});

Deno.test("el resultado de 768x1024 se reduce a menos de 512 px", async () => {
  const img = new Image(768, 1024);
  img.fill(0x884422ff);
  const reducida = await Image.decode(await img.encodeJPEG(90));
  assert(reducida instanceof Image);
  reducida.resize(Image.RESIZE_AUTO, 511);
  const info = inspeccionar(await reducida.encodeJPEG(90));
  assertEquals(info?.alto, 511);
  assert(info !== null && info.ancho < 512);
});

Deno.test("rutaPropia bloquea rutas de otra cuenta y saltos de carpeta", () => {
  assertEquals(rutaPropia(`${USUARIO}/a.jpg`, "ruta", USUARIO), `${USUARIO}/a.jpg`);
  for (const mala of [
    "otra-cuenta/a.jpg",
    `${USUARIO}/../otra/a.jpg`,
    `${USUARIO}//a.jpg`,
    `x${USUARIO}/a.jpg`,
    `${USUARIO}`,
  ]) {
    assertThrows(() => rutaPropia(mala, "ruta", USUARIO), ErrorApp);
  }
});

Deno.test("validaciones de texto y enteros", () => {
  assertEquals(texto("  hola\u0000 ", "c", 10), "hola");
  assertEquals(texto("", "c", 10, true), null);
  assertThrows(() => texto("x".repeat(11), "c", 10), ErrorApp);
  assertThrows(() => texto(5, "c", 10), ErrorApp);
  assertEquals(entero(3, "f", 1, 5), 3);
  assertThrows(() => entero(3.5, "f", 1, 5), ErrorApp);
  assertThrows(() => entero(9, "f", 1, 5), ErrorApp);
  assertEquals(entero(undefined, "f", 1, 5, true), null);
});

Deno.test("datos de la IA se limpian y recortan", () => {
  assertEquals(extraerJson('Claro: {"a": 1} listo'), { a: 1 });
  assertEquals(extraerJson("sin json"), null);
  assertEquals(extraerJson("[1,2]"), null);
  assertEquals(opcionIA("frio", ["calor", "frio"] as const), "frio");
  assertEquals(opcionIA("polar", ["calor", "frio"] as const), null);
  assertEquals(listaIA(["a", 3, "b", "", "c"], 2, 5), ["a", "b"]);
});

Deno.test("estimación de neuronas cercana a lo medido", () => {
  // Medido en la prueba 3: 117.71 con 3 referencias y salida 768x1024.
  const estimado = estimarNeuronas(3, 768, 1024);
  assert(estimado >= 117.71 && estimado < 135, `estimado ${estimado}`);
});
