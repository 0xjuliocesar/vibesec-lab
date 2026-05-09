import { SYSTEM_PROMPT, MAX_TENTATIVAS_API } from "./config.js";
import { log, sleep } from "./utils.js";

export async function chamarAPI(
  modelo,
  promptTexto,
  systemPrompt = SYSTEM_PROMPT,
) {
  const payload = {
    model: modelo,
    temperature: 0,
    reasoning: {
      exclude: true,
    },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: promptTexto,
      },
    ],
    response_format: { type: "json_object" },
    plugins: [{ id: "response-healing" }],
  };

  const resposta = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(payload),
    },
  );

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(`API error ${resposta.status}: ${erro}`);
  }

  return await resposta.json();
}

export async function gerarCodigo(
  modelo,
  promptTexto,
  tentativas = MAX_TENTATIVAS_API,
) {
  for (let tentativaAtual = 0; tentativaAtual < tentativas; tentativaAtual++) {
    try {
      return await chamarAPI(modelo, promptTexto);
    } catch (erro) {
      if (tentativaAtual === tentativas - 1) throw erro;
      const espera = Math.pow(2, tentativaAtual) * 1000;
      log(
        `⚠ Tentativa ${tentativaAtual + 1}/${tentativas} falhou: ${erro.message}`,
      );
      log(`  Aguardando ${espera / 1000}s antes de tentar novamente...`);
      await sleep(espera);
    }
  }
}
