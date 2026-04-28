# Dicionário de Dados do Probe (CacheSnap)

Este documento detalha todos os pontos de dados coletados pela infraestrutura de *probes* (testadores de borda) da CacheSnap, explicando a origem da captura, a relevância da métrica e como ela é utilizada pelos motores de diagnóstico, alertas e pela interface do *dashboard*.

A coleta ocorre via **AWS Lambda** (Node.js 20, arm64) em 8 regiões geográficas reais. Diferente da era CF Workers, a Lambda disponibiliza `dns_ms`, `tcp_ms` e `tls_ms` via `net.Socket` nativo do Node.js.

---

## 🕒 Tempos e Latência (Performance)

### `ttfb_ms` (Time To First Byte)
* **O que é:** O tempo milissegundos desde o início da requisição até a chegada do primeiro byte da resposta (cabeçalhos).
* **Como é capturado:** Via `performance.now()` medindo imediatamente antes e depois do `await fetch()` principal no worker.
* **Importância:** É a métrica mais fundamental de performance de infraestrutura web, indicando quão responsivo o servidor de borda (ou origem) é. 
* **Uso na plataforma:**
  * Componente central no gráfico principal do *dashboard*.
  * O motor de alertas (*Detector*) compara o TTFB atual contra os últimos 7 dias (*Baseline*) para encontrar *Anomalias*.
  * O motor de diagnóstico usa para medir o "custo" de um problema (ex: *Cache MISS adicionando ~400ms*).

### `download_ms`
* **O que é:** O tempo gasto apenas para baixar o corpo da resposta após a recepção do TTFB.
* **Como é capturado:** A diferença entre o término da leitura de `response.arrayBuffer()` e o momento que o TTFB foi alcançado.
* **Importância:** Isola a percepção de uma conexão de rede lenta no transporte de dados, dissociada da velocidade do servidor para processar a requisição.
* **Uso na plataforma:** Exibido em detalhes da inspeção de requisição (gráfico em forma de cascata / *waterfall*).

### `total_ms`
* **O que é:** O tempo total que o ciclo completo da requisição levou (TTFB + Download).
* **Como é capturado:** Desde o `fetchStart` até o `totalEnd` (após baixar e converter o corpo).
* **Importância:** Representa o tempo final sentido por um cliente puro para ler um recurso até o fim.
* **Uso na plataforma:** Utilizado pelo Stats API para indicar uma média geral e armazenado no histórico.

### `dns_ms` & `tls_ms`
* **O que é:** Tempo da resolução de nome (DNS) e aperto de mãos da criptografia (TLS Handshake).
* **Como é capturado:** Atualmente é `null` pela limitação do runtime do Cloudflare Workers, não expondo métricas fatiadas de conexão TCP. Preenchimento ocorrerá por agentes Node.js (VMS no Fly/AWS).
* **Importância / Uso:** Essencial para depurar se conexões seguras antigas ou o serviço de domínio estão sendo o gargalo real de performance.

---

## ⚙️ Diagnóstico Desmembrado de Servidor (`Server-Timing`)

O CacheSnap processa o cabeçalho moderno de performance `Server-Timing` para revelar o que a origem/borda gastou de processamento ("abrir a caixa preta").

### `edge_ms`
* **O que é:** Quanto tempo da requisição pertence exclusivamente a operações da CDN/Borda.
* **Como é capturado:** Pelo parser (*src/server-timing.ts*), procurando no `Server-Timing` por termos curtos/chaves (ex: `edge`, `cdn`, `cache`, `hit`) que contenham chaves numéricas `dur=`. Compatível retroativamente com `X-Timer` da CDN Fastly.
* **Importância:** Separa falsos positivos onde um site pode demorar para responder não no banco de dados, mas sim porque o *Edge Middleware* interceptou incorretamente ou foi lento.
* **Uso na plataforma:** Exibido isolado como no gráfico de barra dividida e no painel de informações ricas de uma amostra. 

### `origin_ms`
* **O que é:** O tempo gasto de processamento de backend genuíno consumido pela máquina (computação pura/banco de dados).
* **Como é capturado:** Da mesma forma, procurando chaves no cabeçalho declaradas como `origin`, `app`, `server`, `upstream`.
* **Importância/Uso:** Complementa a divisão para identificar se problemas de TTFB altos na verdade são do banco ou da CDN.

### `server_timing_breakdown` (JSONB)
* **O que é:** Todas os demais tempos detalhados num objeto contendo chaves e valores (ex: `{"db": 50, "auth": 10}`).
* **Importância:** Permite a clientes que instrumentam o *Server-Timing* a capacidade de ler fases da infraestrutura visualmente pela plataforma.

---

## 🌍 Roteamento e Tráfego 

### `served_by` (Diagnosticador Anycast)
* **O que é:** O código IATA (aeroporto) do *Point of Presence* (PoP) rebatendo a requisição (ex: `GRU`, `IAD`, `LHR`).
* **Como é capturado:** Extraído heurísticamente primariamente de `CF-Ray` para Cloudflare, e como plano B as chaves `X-Served-By`, `X-Vercel-Id`, `X-Amz-Cf-Id`.
* **Importância:** Diz com assertividade absoluta se o roteamento do cabo de fibra entre região emulada e servidor real cumpriu o prometido por roteamento Anycast.
* **Uso na plataforma:** 
   * Transforma a chave IATA numa cidade no Dashboard interativo ("São Paulo (GRU)").
   * O motor de diagnóstico aplica validação de continente (se um *probe* do Sudeste Asiático cai num painel IATA `IAD` (Virgínia), levanta a **"Anycast Routing Mismatch"**, um erro em que CDNs enviam tráfego erradamente para outros continentes, gerando *warnings*).

### `cache_status` (Hit Rate Analytics)
* **O que é:** Flag do provedor CDN informando se o recurso retornou `HIT`, `MISS`, `BYPASS`, etc.
* **Como é capturado:** É lido de 6 formatos conhecidos priorizados por herança (Ex: `X-Vercel-Cache`, `X-Cache`, `CF-Cache-Status`).
* **Importância:** É a principal engrenagem de performance *Edge*. Um *MISS* destrói performance.
* **Uso na plataforma:**
   * Alimenta a estatística de porcentagem fundamental de **"Cache Hit Ratio"** (A aba superior no painel).
   * Possui prioridade altíssima no Diagnóstico: Cache `MISS` em requisições lentas gera imediatamente em uma recomendação *Critical* educando o usuário injetar as chaves `Cache-Control`.

### `redirect_count`
* **O que é:** Quantidade de direções de rotas (*3xx*) seguidas.
* **Como é capturado:** O worker da probe manualmente em malha controla o redirecionamentos.
* **Importância:** Redirecionamentos múltiplos empilham tempo de *roundtrip* RTT inútil aos usuários.
* **Uso:** Diagnóstico adverte com multa latencial virtual (~150ms/pulo), educando que seja resolvido o redirecionamento com um passo fixo. 

---

## 🕵️‍♂️ Investigação Direta à Origem ("Bypass")

Existem 4 campos atrelados que rodam de forma passiva dependendo do setup de scheduler (`bypass_ttfb_ms`, `bypass_total_ms`, `bypass_status_code`, `bypass_error`).

* **O que é:** Trata-se de uma segunda requisição feita "invisível" que ignora deliberadamente camadas de chace usando a flag `__CacheSnap_bypass=1` combinada a restrições fortíssimas via `Pragma: no-cache`.
* **Importância:** Serve para revelar o **"True Origin Latency"**. Mostra ao desenvolvedor, comparado estatisticamente com a request normal, como o banco de dados e aplicação dele teriam performanciado se os escudos do cache fossem penetrados. 
* **Uso na plataforma:** Existe um *toggle* "Média com bypass" visual na cascata das métricas do CacheSnap, ajudando quem roda a aba ver o antes/depois da proteção. 

---

## 🛡️ Auditorias de Metadados Contextuais

### `age_s` ("Zombie Cache")
* **O que é:** Valor numérico capturando o tamanho da vida que um *assets* estático permanece no CDN advindo do cabeçalho de resposta `Age`.
* **Importância:** Um arquivo guardado por 48 horas numa borda pode reter atualizações não expurgadas do *frontend* de produção.
* **Uso na plataforma:** Diagnóstico de Anomalias monitoram idades excessivas (> 86,400 segundos / 24h) com severidade moderada e geram a ocorrência de "Zombie Cache" com recomendação sobre o processo de invalidação manual ou de *stale-while-revalidate*.

### `security_headers`
* **O que é:** Objeto JSON formatado contendo um *scan* com notas de 0 a 9 de políticas de segurança (`csp`, `hsts`, `referrer_policy`, etc).
* **Importância / Uso:** Criação da camada protetiva *zero-trust* oferecendo as pessoas uma régua na tela do site deles validando se cabeçalhos vitais Web modernos existem (Score 0-5).

### `http_version`
* **O que é:** Detecta tráfego legímo baseano heurísticas (como flags `h3`, `Alt-Svc` e raios). 
* **Importância / Uso:** O CacheSnap acusa a existência defasada do `HTTP/1.1` e sugere via diagnóstico ativar a Multiplexação `H2/H3/QUIC`.
