import dotenv from "dotenv";
import { readFileSync } from "node:fs";

dotenv.config();

// ── Modelos para geração de código  ───────────────

function parsearModelos(valor) {
  return valor
    .split(/[\n,]/)
    .map((modelo) => modelo.trim())
    .filter(Boolean);
}

export const MODELOS = parsearModelos(process.env.MODELOS ?? "");

function parsearListaDeIds(valor) {
  return valor
    .split(/[\n,]/)
    .map((id) => id.trim())
    .filter(Boolean);
}

// ── Prompts de geração ──────────────────────────────────────────────────────

function carregarPrompts() {
  const caminhoPrompts = new URL("../prompts.json", import.meta.url);
  const conteudo = readFileSync(caminhoPrompts, "utf8");
  const prompts = JSON.parse(conteudo);

  if (!Array.isArray(prompts)) {
    throw new Error("prompts.json deve conter um array de prompts.");
  }

  return prompts.filter(
    (prompt) =>
      prompt &&
      typeof prompt.id === "string" &&
      prompt.id.trim() &&
      typeof prompt.texto === "string" &&
      prompt.texto.trim(),
  );
}

const PROMPTS_DISPONIVEIS = carregarPrompts();

const IDS_DISPONIVEIS = new Set(PROMPTS_DISPONIVEIS.map((p) => p.id));
const MAPA_PROMPTS_POR_ID = new Map(
  PROMPTS_DISPONIVEIS.map((prompt) => [prompt.id, prompt]),
);

function resolverPrompts() {
  const prompt = process.env.PROMPT?.trim();

  if (!prompt) return [];

  if (IDS_DISPONIVEIS.has(prompt)) {
    return [MAPA_PROMPTS_POR_ID.get(prompt)];
  }

  return [{ id: "custom", texto: prompt }];
}

export const PROMPTS = resolverPrompts();

// ── System prompt para a API ────────────────────────────────────────────────

export const SYSTEM_PROMPT = `Respond only with a valid JSON object. No markdown, no explanation, no text before or after.
Required format:
{
  "files": [
    { "path": "relative/path/to/file.ext", "content": "full file content here" }
  ]
}
Each object in "files" must have exactly the keys "path" and "content", nothing else.`;

// ── Constantes de controle ──────────────────────────────────────────────────

export const MAX_TENTATIVAS_API = 3;
export const TEMPERATURA_PADRAO = 0;
export const PAUSA_ENTRE_MODELOS_MS = 5000;

// ── Variáveis de ambiente ───────────────────────────────────────────────────

const VARIAVEIS_OBRIGATORIAS = [
  "OPENROUTER_API_KEY",
  "GH_TOKEN",
  "GITHUB_OWNER",
  "GITHUB_REPO",
];

export function validarVariaveisDeAmbiente() {
  const faltando = VARIAVEIS_OBRIGATORIAS.filter(
    (variavel) => !process.env[variavel],
  );

  if (MODELOS.length === 0) {
    faltando.push("MODELOS (lista separada por vírgula ou quebra de linha)");
  }

  if (PROMPTS.length === 0) {
    faltando.push("PROMPTS (nenhum prompt válido selecionado)");
  }

  if (faltando.length > 0) {
    console.error(
      `Erro: Variáveis de ambiente não definidas: ${faltando.join(", ")}`,
    );
    process.exit(1);
  }
}

export function criarRepositorioConfig() {
  return {
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
  };
}
