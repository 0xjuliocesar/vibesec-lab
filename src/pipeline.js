import { Octokit } from "@octokit/rest";
import {
  MODELOS,
  PROMPTS,
  SYSTEM_PROMPT,
  PAUSA_ENTRE_MODELOS_MS,
  validarVariaveisDeAmbiente,
  criarRepositorioConfig,
} from "./config.js";
import {
  log,
  sleep,
  hashDoScript,
  hashConteudo,
  salvarRespostaBruta,
} from "./utils.js";
import { gerarCodigo } from "./api.js";
import { parsearResposta } from "./parser.js";
import {
  abrirPullRequest,
  dispararGeracaoLockfiles,
  dispararScanSemgrep,
  prepararBranchComArquivos,
} from "./github.js";

function registrarInicioExecucao(scriptHash) {
  log(`=== INÍCIO DA EXECUÇÃO ===`);
  log(`Hash do script: ${scriptHash}`);
  log(`Modelos: ${MODELOS.join(", ")}`);
  log(`Prompt: ${PROMPTS[0].id}`);
}

function construirMetadados(
  modelo,
  prompt,
  jsonBruto,
  respostaTexto,
  scriptHash,
) {
  return {
    modelo,
    prompt_id: prompt.id,
    prompt_texto: prompt.texto,
    temperatura: 0,
    system_prompt: SYSTEM_PROMPT,
    coletado_em: new Date().toISOString(),
    github_actor: process.env.GITHUB_ACTOR ?? null,
    request_id: jsonBruto.id ?? null,
    hash_resposta: hashConteudo(respostaTexto),
    hash_script: scriptHash,
    usage: jsonBruto.usage ?? null,
  };
}

async function processarRespostaDoModelo(
  jsonBruto,
  prompt,
  modelo,
  scriptHash,
  octokit,
  repo,
) {
  salvarRespostaBruta(jsonBruto);
  const respostaTexto = jsonBruto.choices?.[0]?.message?.content ?? "";

  const metadados = construirMetadados(
    modelo,
    prompt,
    jsonBruto,
    respostaTexto,
    scriptHash,
  );

  log(`\n── ${modelo} × ${prompt.id} ──`);
  log(`Request ID: ${metadados.request_id}`);
  log(`Hash da resposta: ${metadados.hash_resposta}`);

  let arquivos;
  try {
    arquivos = parsearResposta(jsonBruto, modelo, prompt.id);
    log(`Arquivos extraídos: ${arquivos.length}`);
  } catch (erro) {
    log(`✗ Parse falhou: ${erro.message}`);
    metadados.erro_parse = erro.message;
    metadados.resposta_bruta = respostaTexto;
    arquivos = [];
  }

  if (!arquivos || arquivos.length === 0) {
    log(
      `⚠ Nenhum arquivo válido extraído para ${modelo} × ${prompt.id}. PR não será criado.`,
    );
    return;
  }

  const branchPreparada = await prepararBranchComArquivos(
    octokit,
    repo,
    modelo,
    prompt,
    arquivos,
    metadados,
  );
  log(`✓ Branch preparada: ${branchPreparada.branchName}`);

  await dispararGeracaoLockfiles(octokit, repo, branchPreparada.branchName);

  const prUrl = await abrirPullRequest(
    octokit,
    repo,
    modelo,
    prompt,
    arquivos,
    metadados,
    branchPreparada.branchName,
    branchPreparada.pastaRaiz,
    branchPreparada.tituloPR,
  );
  log(`✓ PR criado: ${prUrl}`);

  await dispararScanSemgrep(octokit, repo, branchPreparada.branchName, prUrl);
  log(`✓ Scan Semgrep disparado para ${branchPreparada.branchName}.`);
}

export async function executarPipeline() {
  validarVariaveisDeAmbiente();

  const repo = criarRepositorioConfig();
  const octokit = new Octokit({ auth: process.env.GH_TOKEN });
  const scriptHash = hashDoScript();

  registrarInicioExecucao(scriptHash);

  for (const modelo of MODELOS) {
    log(`\n══ Processando modelo: ${modelo} ══`);

    const prompt = PROMPTS[0];
    try {
      const jsonBruto = await gerarCodigo(modelo, prompt.texto);
      await processarRespostaDoModelo(
        jsonBruto,
        prompt,
        modelo,
        scriptHash,
        octokit,
        repo,
      );
    } catch (erro) {
      log(`✗ Falha em ${modelo} × ${prompt.id}: ${erro.message}`);
    }

    if (MODELOS.indexOf(modelo) < MODELOS.length - 1) {
      log(`Aguardando 5s antes do próximo modelo...`);
      await sleep(PAUSA_ENTRE_MODELOS_MS);
    }
  }

  log(`\n=== EXECUÇÃO FINALIZADA ===`);
}
