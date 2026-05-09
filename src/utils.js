import crypto from "crypto";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

export function hashConteudo(conteudo) {
  return crypto.createHash("sha256").update(conteudo).digest("hex");
}

export function sleep(milissegundos) {
  return new Promise((resolve) => setTimeout(resolve, milissegundos));
}

export function hashDoScript() {
  const caminho = fileURLToPath(import.meta.url);
  const caminhoIndex = path.resolve(path.dirname(caminho), "..", "index.js");
  const conteudo = readFileSync(caminhoIndex);
  return crypto.createHash("sha256").update(conteudo).digest("hex");
}

/** Acrescenta o JSON bruto retornado pela API (OpenRouter) em responses.json. */
export function salvarRespostaBruta(jsonBruto) {
  const responsesPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "responses.json",
  );
  let lista = [];
  try {
    const parsed = JSON.parse(readFileSync(responsesPath, "utf8"));
    if (Array.isArray(parsed)) lista = parsed;
  } catch {
    // arquivo inexistente ou JSON inválido — inicia lista vazia
  }
  lista.push(jsonBruto);
  writeFileSync(responsesPath, JSON.stringify(lista, null, 2), "utf8");
}

export function log(mensagem) {
  const linha = `[${new Date().toISOString()}] ${mensagem}`;
  console.log(linha);
}

export function slugModelo(modelo) {
  return modelo.replace(/\//g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
}
