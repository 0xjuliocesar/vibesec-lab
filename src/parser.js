import { log } from "./utils.js";

function tentarParseDireto(texto) {
  return JSON.parse(texto);
}

function tentarParseRemovendoMarkdown(texto) {
  const limpo = texto
    .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
    .replace(/```[\s\S]*$/, "")
    .trim();
  return JSON.parse(limpo);
}

function tentarParsePorDelimitadores(texto) {
  const inicioObj = texto.indexOf("{");
  const fimObj = texto.lastIndexOf("}");
  if (inicioObj !== -1 && fimObj > inicioObj) {
    try {
      return JSON.parse(texto.substring(inicioObj, fimObj + 1));
    } catch { }
  }

  const inicioArr = texto.indexOf("[");
  const fimArr = texto.lastIndexOf("]");
  if (inicioArr !== -1 && fimArr > inicioArr) {
    return JSON.parse(texto.substring(inicioArr, fimArr + 1));
  }

  throw new Error("Não foi possível extrair JSON válido da resposta");
}

export function extrairJSON(texto) {
  try {
    return tentarParseDireto(texto);
  } catch { }

  try {
    return tentarParseRemovendoMarkdown(texto);
  } catch { }

  return tentarParsePorDelimitadores(texto);
}

export function parsearResposta(json, modelo, promptId) {
  const conteudoBruto = json.choices?.[0]?.message?.content ?? "";

  let parsed;
  try {
    parsed = extrairJSON(conteudoBruto);
  } catch (erro) {
    throw new Error(
      `JSON inválido retornado por ${modelo} no ${promptId}: ${erro.message}`,
    );
  }

  const arquivos = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.files)
      ? parsed.files
      : [];

  if (arquivos.length === 0) {
    throw new Error(
      `Nenhum arquivo encontrado na resposta de ${modelo} no ${promptId}`,
    );
  }

  return arquivos
    .filter((arquivo) => {
      const valido =
        arquivo.path && typeof arquivo.content === "string" && !arquivo.path.endsWith("/");
      if (!valido)
        log(
          `⚠ Arquivo ignorado (path ou content inválido): ${JSON.stringify(arquivo)}`,
        );
      return valido;
    })
    .map((arquivo) => ({
      path: arquivo.path,
      content: arquivo.content,
    }));
}
