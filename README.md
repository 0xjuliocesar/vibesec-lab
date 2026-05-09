# VibeSec Lab

> Análise de Vulnerabilidades em Código Gerado por LLMs: Um Estudo Experimental sobre Vibe Coding

> Este repositório é um **template executável** do experimento descrito no TCC.

## Sumário

- [Contexto e Motivação](#contexto-e-motivação)
- [Como Funciona](#como-funciona)
- [Estrutura do Repositório](#estrutura-do-repositório)
- [Prompts Disponíveis](#prompts-disponíveis)
- [Como Usar](#como-usar)
- [GitHub Actions](#github-actions)
- [Análise de Segurança com Semgrep](#análise-de-segurança-com-semgrep)
- [Rastreabilidade e Metadados](#rastreabilidade-e-metadados)

---

## Contexto e Motivação

O _vibe coding_ — prática de delegar a escrita de código quase inteiramente a modelos de linguagem (LLMs) — vem ganhando popularidade, mas ainda há poucas evidências empíricas sobre o perfil de segurança do código que esses modelos produzem.

Este repositório implementa um **pipeline automatizado e reprodutível** para coletar e analisar código gerado por LLMs:

1. Um prompt é enviado a um ou mais LLMs (via [OpenRouter](https://openrouter.ai/)).
2. O código gerado é salvo em branches isoladas e submetido via Pull Request.
3. O pipeline dispara o workflow `semgrep.yml` via GitHub Actions, que executa um **full scan** com Semgrep Code (SAST - _Static Application Security Testing_) + Semgrep Supply Chain (SCA - _Software Composition Analysis_). Os resultados são enviados ao Semgrep AppSec Platform e postados como comentários no PR.
4. Os resultados permitem comparar o nível de segurança entre modelos e prompts.

---

## Como Funciona

### Etapas detalhadas

| Etapa                    | O que acontece                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Disparo**           | O workflow `gerar_codigos.yml` é acionado manualmente com os parâmetros `modelos`, `prompt` e (opcionalmente) `descricao`.                                                                                                                            |
| **2. Geração de código** | O script chama a API do OpenRouter para cada modelo, em paralelo, com até 3 tentativas e backoff exponencial.                                                                                                                                         |
| **3. Parse**             | A resposta JSON é validada e os arquivos de código são extraídos.                                                                                                                                                                                     |
| **4. Branch + commit**   | Uma branch `tcc/<prompt_id>/<modelo_slug>-<timestamp>` é criada, os arquivos são comitados junto com um `metadados.json`.                                                                                                                             |
| **5. Lockfiles**         | O workflow `gerar_lockfiles.yml` é disparado automaticamente para a nova branch, instala as dependências (Node.js, Python, Ruby, Go) e commita os arquivos de lock.                                                                                   |
| **6. PR**                | Um Pull Request é aberto de volta para `main`.                                                                                                                                                                                                        |
| **7. Scan Semgrep**      | Após abrir o PR, o pipeline dispara o workflow `semgrep.yml` via `workflow_dispatch`, passando o número do PR. O Semgrep executa um **full scan** com o Semgrep Code (SAST) + Semgrep Supply Chain (SCA) e posta os resultados como comentário no PR. |

---

## Estrutura do Repositório

```
.
├── index.js                    # Ponto de entrada — chama executarPipeline()
├── prompts.json                # Biblioteca de prompts de exemplo
├── package.json
├── .gitignore
│
├── src/
│   ├── pipeline.js             # Orquestrador principal do fluxo
│   ├── api.js                  # Chamadas à API do OpenRouter (com retry)
│   ├── parser.js               # Parse e validação da resposta JSON dos LLMs
│   ├── github.js               # Criação de branches, commits, PRs e disparo de workflows
│   ├── config.js               # Carregamento de configurações e variáveis de ambiente
│   └── utils.js                # Funções utilitárias (log, sleep, hash, slug)
│
└── .github/
    └── workflows/
        ├── gerar_codigos.yml   # Workflow principal (disparo manual)
        ├── gerar_lockfiles.yml # Gera lockfiles de dependências na branch do PR
        └── semgrep.yml         # Full scan Semgrep Code (SAST) + Semgrep Supply Chain (SCA) (disparado pelo pipeline após abrir o PR)
```

---

## Prompts Disponíveis

O arquivo `prompts.json` contém uma biblioteca de prompts de exemplo. Ao disparar o workflow, você pode informar o **ID de um prompt** do arquivo ou um **prompt personalizado** — o pipeline detecta automaticamente.

| ID                      | Domínio                                                | Stack solicitada             |
| ----------------------- | ------------------------------------------------------ | ---------------------------- |
| `marketplace-anuncios`  | Marketplace de produtos usados com chat interno        | React + Node.js (TypeScript) |
| `gestao-times`          | Sistema de gestão de times para empresas de tecnologia | Ruby on Rails                |
| `gestao-financeira`     | Plataforma de gestão financeira para pequenas empresas | Python + Django              |
| `prontuario-eletronico` | Sistema de prontuário eletrônico para clínicas médicas | Angular (TypeScript) + Go    |

Você pode adicionar seus próprios prompts ao `prompts.json` ou simplesmente digitar o texto diretamente no campo `prompt` do workflow.

---

## Como Usar

Este repositório é um **template**. Para utilizá-lo:

### 1. Criar o repositório a partir do template

Clique em **Use this template → Create a new repository** no GitHub.

### 2. Configurar o Semgrep AppSec Platform (setup único)

As etapas abaixo precisam ser executadas **uma única vez**. Após isso, todos os scans usam essa configuração automaticamente.

#### 2.1. Conectar o repositório

1. Acesse [semgrep.dev](https://semgrep.dev), faça login com sua conta GitHub e siga o processo de onboarding adicionando o seu repositório.
2. Navegue até **Settings → Tokens → API Tokens**, gere um token e adicione-o como secret `SEMGREP_APP_TOKEN` no repositório (passo 3).

#### 2.2. Configurar rulesets do Semgrep Code

Para cada ruleset abaixo, acesse a URL correspondente no Semgrep Registry, clique em **Add to Policy** e selecione **Comment mode**.

| Ruleset               | URL                                     | Cobertura                             |
| --------------------- | --------------------------------------- | ------------------------------------- |
| `p/default`           | https://semgrep.dev/p/default           | Regras gerais de segurança (baseline) |
| `p/owasp-top-ten`     | https://semgrep.dev/p/owasp-top-ten     | OWASP Top 10                          |
| `p/cwe-top-25`        | https://semgrep.dev/p/cwe-top-25        | CWE Top 25                            |
| `p/sql-injection`     | https://semgrep.dev/p/sql-injection     | Injeção SQL                           |
| `p/command-injection` | https://semgrep.dev/p/command-injection | Injeção de comandos                   |
| `p/javascript`        | https://semgrep.dev/p/javascript        | JavaScript genérico                   |
| `p/typescript`        | https://semgrep.dev/p/typescript        | TypeScript                            |
| `p/react`             | https://semgrep.dev/p/react             | React (frontend)                      |
| `p/nodejs`            | https://semgrep.dev/p/nodejs            | Node.js (backend)                     |
| `p/expressjs`         | https://semgrep.dev/p/expressjs         | Express.js                            |
| `p/python`            | https://semgrep.dev/p/python            | Python genérico                       |
| `p/django`            | https://semgrep.dev/p/django            | Django                                |
| `p/golang`            | https://semgrep.dev/p/golang            | Go (Golang)                           |
| `p/ruby`              | https://semgrep.dev/p/ruby              | Ruby genérico                         |
| `p/brakeman`          | https://semgrep.dev/p/brakeman          | Ruby on Rails (Brakeman)              |
| `p/comment`           | https://semgrep.dev/p/comment           | —                                     |

A configuração resultante deve ter em média **~3085 regras** no modo Comment, cobrindo severidades Critical, High e Medium.

#### 2.3. Configurar policy do Semgrep Supply Chain

1. Acesse **Rules & Policies → Policies** na plataforma.
2. Na aba **Supply Chain**, clique em **Create Policy** e crie uma policy com o nome `Comment on all reachable findings`.
3. Configure as condições: **Reachability** `is` **Always reachable** `or` **Reachable**.
4. Configure a ação: **Leave a comment**.
5. Defina o escopo como **All projects** e ative a policy (status: **Enabled**).

#### 2.4. Configurações gerais (Settings → General)

**Geral**

| Configuração                        | Status               | Observação                                                                                   |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| **Semgrep Multimodal**              | ✅ Ativado           | Habilita autotriage, autofixes, AI-powered scanning e tag de findings com contexto de código |
| **AI providers**                    | OpenAI + AWS Bedrock | Provedores de IA gerenciados pela própria Semgrep (chave da Semgrep)                         |
| **Triage via code review comments** | ✅ Ativado           | Permite triar findings diretamente pelos comentários do PR                                   |

**Semgrep Code (SAST)**

| Configuração                             | Status     | Observação                                                                                        |
| ---------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| **Code scans**                           | ✅ Ativado | Habilita o produto Code em todos os scans futuros                                                 |
| **Cross-file analysis**                  | ✅ Ativado | Rastreia fluxo de dados entre arquivos (1,8× mais vulnerabilidades em média)                      |
| **Rule-defined fix**                     | ✅ Ativado | Sugere correções escritas por humanos nos comentários do PR                                       |
| **Noise filter for Code PR/MR comments** | ✅ Ativado | Não posta comentário em achados classificados como prováveis falsos positivos (opção recomendada) |
| **AI-powered scans**                     | ✅ Ativado | Detecta falhas de lógica de negócio como IDOR e problemas de autorização                          |
| **Suggested fix**                        | ✅ Ativado | Exibe sugestões de código geradas por IA nos comentários do PR (threshold: high confidence)       |

**Semgrep Supply Chain (SCA)**

| Configuração                        | Status     | Observação                                                                     |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| **Supply Chain scans**              | ✅ Ativado | Habilita o produto Supply Chain em todos os scans futuros                      |
| **Dependency search**               | ✅ Ativado | Coleta e armazena nomes e versões de dependências dos lockfiles escaneados     |
| **Malicious dependency advisories** | ✅ Ativado | Inclui regras de detecção de dependências maliciosas nos scans de Supply Chain |

### 3. Configurar as secrets

Acesse **Settings → Secrets and variables → Actions** no seu repositório e adicione:

| Secret               | Descrição                                                            |
| -------------------- | -------------------------------------------------------------------- |
| `OPENROUTER_API_KEY` | Chave de API do [OpenRouter](https://openrouter.ai/)                 |
| `SEMGREP_APP_TOKEN`  | Token de autenticação do Semgrep AppSec Platform (Settings → Tokens) |

> O `GITHUB_TOKEN` é gerado automaticamente pelo GitHub Actions — não é necessário configurar.

### 4. Executar o pipeline

Acesse **Actions → Geração e Coleta de Código → Run workflow** e preencha os parâmetros.

---

## GitHub Actions

### `gerar_codigos.yml` — Geração e Coleta de Código

Disparado **manualmente** via `workflow_dispatch`.

**Inputs:**

| Parâmetro   | Obrigatório | Descrição                                                                               |
| ----------- | ----------- | --------------------------------------------------------------------------------------- |
| `modelos`   | ✅          | Modelos OpenRouter a utilizar (separados por vírgula ou quebra de linha)                |
| `prompt`    | ✅          | ID de um prompt do `prompts.json` (ex: `marketplace-anuncios`) ou texto livre do prompt |
| `descricao` | ❌          | Descrição livre para identificar a execução no histórico                                |

Ao final, o arquivo `responses.json` é salvo como artefato da execução por 90 dias.

### `gerar_lockfiles.yml` — Geração de Lockfiles

Disparado automaticamente pelo pipeline após cada branch ser criada. Detecta e instala dependências para:

- **Node.js** — gera `package-lock.json` via `npm install --package-lock-only`
- **Python** — instala via `pip` a partir de `requirements.txt`, `setup.py` ou `pyproject.toml`
- **Ruby** — gera `Gemfile.lock` via `bundle lock`

Os lockfiles são commitados diretamente na branch, garantindo que o Semgrep Supply Chain tenha as informações de dependências para análise.

### `semgrep.yml` — Análise de Segurança

Disparado **programaticamente** pelo pipeline após o PR ser aberto. Recebe o número do PR como input e injeta `SEMGREP_PR_ID` para que a plataforma saiba onde postar os comentários.

Executa um **full scan** com:

- `--code` — habilita o produto SAST (Semgrep Code)
- `--pro` — ativa o Semgrep Pro Engine com cross-file (interfile) analysis
- `--supply-chain` — habilita SCA com análise de alcançabilidade (reachability)

O resultado é enviado ao Semgrep AppSec Platform, que posta os achados como comentários no PR.

---

## Análise de Segurança com Semgrep

O workflow `semgrep.yml` é disparado pelo pipeline após a abertura de cada PR, executando um **full scan** — não um diff scan — garantindo que todo o código gerado seja analisado.

Dois tipos de análise são executados:

| Tipo                                             | O que analisa                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **SAST** (_Static Application Security Testing_) | Vulnerabilidades no código-fonte (ex.: injeção SQL, XSS, autenticação insegura, exposição de segredos) |
| **SCA** (_Software Composition Analysis_)        | Vulnerabilidades em dependências de terceiros (CVEs), com análise de alcançabilidade (_reachability_)  |

### Features ativas

**Habilitadas pelo código** (versionadas em Git, garantidas a cada execução)

| Feature                                     | Mecanismo                                              |
| ------------------------------------------- | ------------------------------------------------------ |
| Semgrep Code (SAST)                         | Flag `--code` no `semgrep.yml`                         |
| Semgrep Pro Engine                          | Flag `--pro` no `semgrep.yml`                          |
| Semgrep Supply Chain (SCA com reachability) | Flag `--supply-chain` no `semgrep.yml`                 |
| Full scan (não diff-aware)                  | Trigger `workflow_dispatch` sem `SEMGREP_BASELINE_REF` |
| PR comments associados ao PR correto        | `SEMGREP_PR_ID` injetado pelo pipeline                 |

**Habilitadas manualmente no Semgrep AppSec Platform** (setup único)

| Feature                                                                                                                                      | Onde configurar                                |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Regras Semgrep Code (~3085 regras, modo Comment)                                                                                             | Rules &amp; Policies → Policies → Code         |
| Regra Semgrep Supply Chain (_Leave a comment_ em findings alcançáveis)                                                                       | Rules &amp; Policies → Policies → Supply Chain |
| Semgrep Multimodal, Code scans, Cross-file analysis, Rule-defined fix, Noise filter for Code PR/MR comments, AI-powered scans, Suggested fix | Settings → General                             |
| Supply Chain scans, Dependency search, Malicious dependency advisories                                                                       | Settings → General                             |

### Linguagens com suporte completo (SAST + SCA + Reachability)

| Linguagem               | SAST | SCA | Reachability | Observação                                                           |
| ----------------------- | ---- | --- | ------------ | -------------------------------------------------------------------- |
| JavaScript / TypeScript | ✅   | ✅  | ✅           | Requer `package-lock.json`, `yarn.lock` ou `pnpm-lock.yaml` para SCA |
| Python                  | ✅   | ✅  | ✅           | Requer `requirement.txt` ou `requirement.pip` para SCA               |
| Ruby                    | ✅   | ✅  | ✅           | Requer `Gemfile.lock` para SCA                                       |
| Go                      | ✅   | ✅  | ✅           | Requer `go.mod` para SCA                                             |

---

## Rastreabilidade e Metadados

Cada PR criado pelo pipeline inclui um arquivo `metadados.json` na branch, com:

```json
{
  "modelo": "openai/gpt-4o",
  "prompt_id": "marketplace-anuncios",
  "prompt_texto": "...",
  "temperatura": 0,
  "system_prompt": "...",
  "coletado_em": "2025-04-23T18:00:00.000Z",
  "github_actor": "username",
  "request_id": "gen-...",
  "hash_resposta": "sha256...",
  "hash_script": "sha256...",
  "usage": { "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0 }
}
```

O corpo do PR também exibe uma tabela com esses campos, incluindo o campo **Disparado por** (`github_actor`), registrando quem acionou o workflow.

**Reprodutibilidade:** `temperatura = 0` em todas as chamadas à API e `hash_script` registrado garantem que variações nos resultados entre execuções são atribuíveis ao modelo, não ao script. O comportamento de análise está integralmente codificado nos workflows versionados em Git; a configuração de regras requer o setup único na plataforma Semgrep descrito em [Como Usar](#como-usar).
