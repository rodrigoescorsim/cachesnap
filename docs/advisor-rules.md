# Advisor Rules — CacheSnap

Documentação de todas as regras de análise automática do produto. Cada seção corresponde a uma tela que exibe um card advisor ou um painel de insights equivalente.

## Thresholds globais compartilhados

| Constante | Valor | Significado |
|-----------|-------|-------------|
| `MONITOR_TTFB.ELITE` | 250ms | Latência excelente |
| `MONITOR_TTFB.FAST` | 500ms | Limiar de warning de TTFB |
| `MONITOR_TTFB.SLOW` | 1000ms | Limiar de critical de TTFB |
| `MONITOR_CACHE.GOOD` | 80% | Limiar de warning de cache hit |
| `MONITOR_CACHE.LOW` | 50% | Limiar de critical de cache hit |
| `SSL_CRITICAL_DAYS` | 15 dias | SSL expirando — crítico |
| `SSL_WARNING_DAYS` | 30 dias | SSL expirando — aviso |
| `SECURITY_SCORE_CRITICAL` | ≤ 2/9 | Score de segurança crítico |
| `SECURITY_SCORE_WARNING` | ≤ 5/9 | Score de segurança insuficiente |
| `DELTA_WARN` (Insights) | +20% | Degradação de TTFB vs baseline 24h |

---

## 1. Monitors Overview

**Função:** `derivePortfolioAdvisor` — `src/components/advisor/advisor-card.helpers.ts`

Analisa o conjunto de todos os monitores ativos. Retorna `null` quando há menos de 3 monitores ativos.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| CRITICAL | `X monitor(s) DOWN` | Monitor inacessível em todas as regiões probing | `errorRegionCount >= totalRegionCount` |
| CRITICAL | `Origin Health: X failing` | Monitor retornando erros 5xx do servidor de origem | `error5xxCount > 0` |
| CRITICAL | `Critical Cache Efficiency issue` | Taxa de cache hit extremamente baixa | `cacheHitAvg1h < 50%` |
| CRITICAL | `Critical Latency detected` | Latência média 1h acima do threshold crítico | `ttfbAvg1h >= 1000ms` |
| WARNING | `X degraded · X with 4xx errors · X no cache headers` | Um ou mais monitores com problemas moderados de performance, erros 4xx ou sem headers de cache | `errorRegionCount > 0` OU `ttfbAvg1h >= 500ms` OU `cacheHitAvg1h < 80%` OU `error4xxCount > 0` OU `cacheStatus = 'NO HEADER'` |
| HEALTHY | `X monitors healthy` | Nenhuma condição de alerta ativa em nenhum monitor | Nenhuma condição de warning/critical detectada |

**Prioridade de critical:** DOWN > 5xx > Cache crítico > Latência crítica. Apenas a categoria mais grave é exibida.

---

## 2. Live

**Função:** `deriveMonitorDetailLiveAdvisor` — `src/components/advisor/advisor-card.helpers.ts`

Analisa probes em tempo real do monitor selecionado. Usa dados ao vivo, não históricos.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| WARNING | `Monitor Offline` | Nenhum probe recebido no período atual | `isOffline = true` |
| CRITICAL | `Site Down — Unreachable` | Todas as regiões reportando falha de conexão | `isDown = true` (100% das regiões com erro) |
| CRITICAL | `Partial Outage detected` | Algumas regiões com falha de conexão | `isDegraded = true` (`errorRegionCount > 0`) |
| CRITICAL | `Critical cache efficiency: X%` | Grande parte das requests chegando à origin. BYPASS/DYNAMIC reduz para WARNING pois pode ser intencional | `hasLiveCacheData = true` E `liveGlobalHitRate < 50%` |
| CRITICAL | `High latency: Xms` | Latência global ao vivo acima do threshold crítico | `liveAvgTtfb > 1000ms` |
| WARNING | `Cache Hit Rate X% · TTFB Xms · X slow regions` | Combinação de problemas moderados detectados ao vivo | `liveAvgTtfb > 500ms` OU `liveGlobalHitRate < 80%` OU `ttfbVsPeriodPct > 20%` OU `slowRegionCount > 0` |
| WARNING | `High regional variance: +X% / X%` | Spread extremo entre regiões mais rápida e mais lenta vs média global | `slowestVsGlobal.deltaPct >= 70%` E `abs(fastestVsGlobal.deltaPct) >= 70%` |
| WARNING | `X slow region(s)` | Uma ou mais regiões isoladas com latência elevada | `slowRegionCount > 0` (após checks anteriores) |
| HEALTHY | `Live performance stable` | Todos os indicadores ao vivo dentro dos limites saudáveis | Todos os checks acima passam sem alertas |

---

## 3. Performance

**Função:** `deriveMonitorPerformancePeriodAdvisor` — `src/components/advisor/advisor-card.helpers.ts`

Analisa dados históricos agregados no período selecionado (1h, 24h, 7d, 30d). Compara com o período anterior equivalente quando disponível.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| WARNING | `No data for this period` | Sem dados registrados no período selecionado | `isOffline = true` |
| CRITICAL | `Site Down — Unreachable` | Todas as regiões com falha no janela analisada | `isDown = true` |
| CRITICAL | `Significant downtime detected` | Queda parcial detectada no período | `isDegraded = true` |
| CRITICAL | `Critical cache efficiency: X%` | Maioria das requests atingindo origin diretamente | `globalHitRate < 50%` |
| CRITICAL | `High latency: Xms` | Latência média global elevada no período | `avgTtfb > 1000ms` |
| CRITICAL | `Latency up X% vs previous [range]` | Regressão severa de TTFB vs período anterior | `hasHistory = true` E `ttfbChangePct > 40%` |
| WARNING | `Cache Hit Rate X% · TTFB Xms · X slow regions · TTFB +X%` | Combinação de problemas moderados no período | `avgTtfb > 500ms` OU `globalHitRate < 80%` OU `ttfbChangePct > 10%` OU `cacheChangePp < -10pp` OU `slowRegionCount > 0` |
| HEALTHY | `TTFB X% · cache hit +Xpp` | Melhoria mensurável vs período anterior | `ttfbChangePct < -10%` OU `cacheChangePp > +10pp` |
| HEALTHY | `Performance stable` | Desempenho dentro dos parâmetros esperados | Nenhuma condição de alerta ativa e sem melhoria significativa |

---

## 4. Trends

**Função:** `deriveMonitorTrendsAdvisor` — `src/components/advisor/advisor-card.helpers.ts`

Analisa spikes de latência detectados e regressões regionais semana-a-semana no período selecionado.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| CRITICAL | `X latency spikes · Regional regression` | Volume alto de spikes E/OU regressão regional severa | `spikeCount > 5` OU `worstRegion.changePct > 50%` |
| WARNING | `X latency spike(s) · Regional regression` | Spikes moderados E/OU regressão regional moderada | `spikeCount 1–5` OU `worstRegion.changePct` entre 20–50% |
| HEALTHY | `Performance patterns stable` | Nenhum spike ou regressão detectada (histórico sendo construído) | `spikeCount = 0` E nenhuma regressão (sem histórico suficiente) |
| HEALTHY | `Stable trends` | Padrões estáveis no período analisado | `spikeCount = 0` E `worstRegion.changePct <= 20%` |

**Definição de spike:** bucket com `ttfb_avg > prev_avg * 1.5` E `ttfb_avg - prev_avg > 150ms`.

---

## 5. Patterns

**Função:** `deriveMonitorPatternsAdvisor` — `src/components/advisor/advisor-card.helpers.ts`

Analisa a distribuição horária de TTFB e cache hit ao longo do dia. Retorna `null` quando há menos de 3 pontos horários disponíveis.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| CRITICAL | `Peak hour latency: Xms at HH:00` | Latência crítica na pior hora do dia | `worstHour.ttfb_avg >= 1000ms` |
| WARNING | `Peak Xms at HH:00 · Cache dip X% at HH:00 · Xms spread` | Pico de latência OU queda de cache em hora específica OU alta variância entre horas | `worstHour.ttfb_avg >= 500ms` OU `worstHour.cache_hit_pct < 80%` OU (`spread >= 300ms` E `spread > avgGeral`) |
| HEALTHY | `Stable hourly patterns` | Desempenho consistente em todas as horas do dia. Se spread > 100ms, exibe as horas de pico e mínimo como contexto | Todas as condições acima passam |

**Nota:** `spread = worstHour.ttfb_avg - bestHour.ttfb_avg`. A condição de high variance exige que o spread seja simultaneamente ≥ 300ms e maior que a média geral do período para evitar falsos positivos em sites naturalmente lentos.

---

## 6. Security

**Função:** `deriveMonitorSecurityAdvisor` — `src/components/advisor/advisor-card.helpers.ts`

Analisa headers de segurança, certificado SSL/TLS e consistência entre regiões. Retorna `null` quando não há dados de segurança coletados.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| CRITICAL | `SSL certificate expired` | Certificado vencido — browsers bloqueiam o acesso para todos os visitantes | `sslDaysRemaining <= 0` |
| CRITICAL | `SSL expiring in X days` | Expiração iminente do certificado | `sslDaysRemaining < 15` |
| CRITICAL | `Security score: X/9 — critical` | Maioria dos headers de segurança ausentes — exposto a XSS, clickjacking e downgrade attacks | `securityScore <= 2` |
| WARNING | `SSL renewing soon: X days left` | Certificado próximo do prazo de renovação | `15 <= sslDaysRemaining < 30` |
| WARNING | `Security score: X/9` | Vários headers ausentes — cada um é uma superfície de ataque explorável | `3 <= securityScore <= 5` |
| WARNING | `Security drift: X region(s) differ` | Configurações de headers diferentes entre regiões — algumas edges menos protegidas | `hasDrift = true` (múltiplos perfis de assinatura detectados via `securityByRegion`) |
| WARNING | `Deprecated TLS: X` | Protocolo TLS obsoleto em uso — vulnerável a POODLE e BEAST | `sslProtocol` contém `"1.0"` ou `"1.1"` |
| WARNING | `HSTS header missing` | Header crítico ausente mesmo com bom score — browsers podem conectar via HTTP primeiro | `hasHsts = false` E `securityScore > 5` |
| HEALTHY | `Security posture good: X/9` | Todos os headers críticos ativos, sem drift regional e certificado válido por prazo confortável | `securityScore >= 6`, sem drift, `sslDaysRemaining >= 30` (ou sem dados de SSL) |

**Headers rastreados (score /9):** HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, COEP, CORP.

**Detecção de drift:** agrupa regiões por assinatura idêntica de headers via `buildSecurityComparisonProfile`. Se houver mais de um perfil, a região (ou regiões) com configuração diferente da maioria dispara o warning.

---

## 7. Insights

**Função:** `deriveInsights` — `src/components/insights/insights.helpers.ts`

Painel diferente dos advisors de monitor individual: opera sobre a lista completa de monitores ativos e gera até **5 insights priorizados**. Cada insight tem severidade, título, descrição, métrica de destaque e link de ação.

| Severidade | Nome | Detalhes | Thresholds |
|------------|------|----------|------------|
| CRITICAL | `Critical response time` | Pior monitor da frota com TTFB extremamente alto na última hora | `ttfbAvg1h > 1000ms` |
| WARNING | `Elevated TTFB detected` | Pior monitor com TTFB elevado mas abaixo do crítico | `500ms < ttfbAvg1h <= 1000ms` |
| CRITICAL | `High cache miss rate` | Pior monitor com cache hit abaixo do crítico | `cacheHitAvg1h < 50%` |
| WARNING | `High cache miss rate` | Pior monitor com cache hit abaixo do ideal | `50% <= cacheHitAvg1h < 80%` |
| WARNING | `Regional latency detected` | Monitor com maior número de regiões lentas (gated: só é incluído se houver menos de 4 insights até aqui) | `slowRegionCount > 0` |
| WARNING | `Performance trending worse` | Monitor com maior degradação de TTFB 1h vs baseline 24h (gated: só é incluído se houver menos de 4 insights até aqui) | `(ttfbAvg1h - ttfbAvg24h) / ttfbAvg24h > 20%` |
| SUCCESS | `All systems performing optimally` | Fallback quando nenhuma condição de alerta é detectada em nenhum monitor — exibe médias globais de TTFB e cache | Nenhuma das condições acima ativa |

**Ordem de geração:** TTFB → Cache → Regiões lentas → Degradação de tendência → Fallback healthy. Limitado a 5 insights no total. Os itens 3 e 4 (regiões e degradação) só são avaliados se o total acumulado for menor que 4, para priorizar alertas mais críticos.
