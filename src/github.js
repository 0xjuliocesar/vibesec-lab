import { log, slugModelo } from "./utils.js";

function construirCorpoPR(modelo, prompt, metadados, arquivos, pastaRaiz) {
  return `## Metadados da coleta

| Campo | Valor |
|---|---|
| Modelo | \`${modelo}\` |
| Prompt ID | \`${prompt.id}\` |
| Temperatura | \`0\` |
| Disparado por | \`${metadados.github_actor ?? "local"}\` |
| Coletado em | \`${metadados.coletado_em}\` |
| Hash da resposta | \`${metadados.hash_resposta}\` |
| Hash do script | \`${metadados.hash_script}\` |
| ID da requisição (OpenRouter) | \`${metadados.request_id}\` |

## Prompt enviado

> ${prompt.texto}

## Arquivos gerados em \`${pastaRaiz}/\`

${arquivos.map((arquivo) => `- \`${arquivo.path}\``).join("\n")}

---
*Gerado automaticamente pelo script de coleta*`;
}

export async function prepararBranchComArquivos(
  octokit,
  repo,
  modelo,
  prompt,
  arquivos,
  metadados,
) {
  const slug = slugModelo(modelo);
  const timestamp = Date.now();
  const branchName = `tcc/${prompt.id}/${slug}-${timestamp}`;
  const pastaRaiz = `${prompt.id}/${slug}`;

  const { data: branchData } = await octokit.rest.repos.getBranch({
    ...repo,
    branch: "main",
  });
  const baseCommitSha = branchData.commit.sha;
  const baseTreeSha = branchData.commit.commit.tree.sha;

  const treeItems = await Promise.allSettled(
    arquivos.map(async (arquivo) => {
      const { data: blob } = await octokit.rest.git.createBlob({
        ...repo,
        content: Buffer.from(arquivo.content, "utf8").toString("base64"),
        encoding: "base64",
      });
      return {
        path: `${pastaRaiz}/${arquivo.path}`,
        mode: "100644",
        type: "blob",
        sha: blob.sha,
      };
    }),
  ).then((results) =>
    results
      .filter((resultado) => {
        if (resultado.status === "rejected") log(`⚠ Blob falhou: ${resultado.reason}`);
        return resultado.status === "fulfilled";
      })
      .map((resultado) => resultado.value),
  );

  const { data: metadadosBlob } = await octokit.rest.git.createBlob({
    ...repo,
    content: Buffer.from(JSON.stringify(metadados, null, 2), "utf8").toString(
      "base64",
    ),
    encoding: "base64",
  });
  treeItems.push({
    path: `${pastaRaiz}/metadados.json`,
    mode: "100644",
    type: "blob",
    sha: metadadosBlob.sha,
  });

  const tituloPR = `Prompt ${prompt.id} × Modelo ${modelo} - ${timestamp}`;

  const { data: tree } = await octokit.rest.git.createTree({
    ...repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    ...repo,
    message: tituloPR,
    tree: tree.sha,
    parents: [baseCommitSha],
  });

  await octokit.rest.git.createRef({
    ...repo,
    ref: `refs/heads/${branchName}`,
    sha: commit.sha,
  });

  return {
    branchName,
    pastaRaiz,
    tituloPR,
    metadados,
    arquivos,
  };
}

export async function aguardarExecucaoWorkflow(octokit, repo, workflowId, runId) {
  for (let tentativas = 0; tentativas < 180; tentativas++) {
    const { data: run } = await octokit.rest.actions.getWorkflowRun({
      ...repo,
      run_id: runId,
    });

    if (run.status === "completed") {
      return run;
    }

    log(
      `Workflow ${workflowId} em execução para run ${runId} (status: ${run.status}). Aguardando...`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error(`Timeout aguardando conclusão do workflow ${workflowId}.`);
}

export async function dispararGeracaoLockfiles(
  octokit,
  repo,
  branchName,
  workflowId = "gerar_lockfiles.yml",
) {
  const { data: runsAntes } = await octokit.rest.actions.listWorkflowRuns({
    ...repo,
    workflow_id: workflowId,
    branch: branchName,
    event: "workflow_dispatch",
    per_page: 20,
  });
  const runIdsAntes = new Set(runsAntes.workflow_runs.map((run) => run.id));

  await octokit.rest.actions.createWorkflowDispatch({
    ...repo,
    workflow_id: workflowId,
    ref: branchName,
    inputs: {
      branch_ref: branchName,
    },
  });

  log(`Workflow de lockfiles disparado para branch ${branchName}.`);

  let runEncontrado = null;
  for (let tentativas = 0; tentativas < 24; tentativas++) {
    const { data: runsDepois } = await octokit.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: workflowId,
      branch: branchName,
      event: "workflow_dispatch",
      per_page: 20,
    });

    runEncontrado = runsDepois.workflow_runs.find((run) => !runIdsAntes.has(run.id));
    if (runEncontrado) break;

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (!runEncontrado) {
    throw new Error("Não foi possível localizar execução do workflow de lockfiles.");
  }

  const execucaoFinal = await aguardarExecucaoWorkflow(
    octokit,
    repo,
    workflowId,
    runEncontrado.id,
  );

  if (execucaoFinal.conclusion !== "success") {
    throw new Error(
      `Workflow de lockfiles falhou com conclusão: ${execucaoFinal.conclusion}`,
    );
  }

  log(`Workflow de lockfiles concluído com sucesso para ${branchName}.`);
}

export async function abrirPullRequest(
  octokit,
  repo,
  modelo,
  prompt,
  arquivos,
  metadados,
  branchName,
  pastaRaiz,
  tituloPR,
) {
  const { data: pr } = await octokit.rest.pulls.create({
    ...repo,
    title: tituloPR,
    head: branchName,
    base: "main",
    body: construirCorpoPR(modelo, prompt, metadados, arquivos, pastaRaiz),
  });

  return pr.html_url;
}

export async function dispararScanSemgrep(
  octokit,
  repo,
  branchName,
  prUrl,
  workflowId = "semgrep.yml",
) {
  const prNumber = prUrl.split("/").pop();
  const { data: runsAntes } = await octokit.rest.actions.listWorkflowRuns({
    ...repo,
    workflow_id: workflowId,
    branch: branchName,
    event: "workflow_dispatch",
    per_page: 20,
  });
  const runIdsAntes = new Set(runsAntes.workflow_runs.map((run) => run.id));

  await octokit.rest.actions.createWorkflowDispatch({
    ...repo,
    workflow_id: workflowId,
    ref: branchName,
    inputs: {
      pr_number: prNumber,
    },
  });

  log(`Scan Semgrep disparado para branch ${branchName}.`);

  let runEncontrado = null;
  for (let tentativas = 0; tentativas < 24; tentativas++) {
    const { data: runsDepois } = await octokit.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: workflowId,
      branch: branchName,
      event: "workflow_dispatch",
      per_page: 20,
    });

    runEncontrado = runsDepois.workflow_runs.find((run) => !runIdsAntes.has(run.id));
    if (runEncontrado) break;

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  if (!runEncontrado) {
    throw new Error("Não foi possível localizar execução do scan Semgrep.");
  }

  log(`Scan Semgrep iniciado (run ${runEncontrado.id}) para ${branchName}.`);
}
