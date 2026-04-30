# CacheSnap Advisor Framework — v1.0

Este documento define a inteligência do CacheSnap, separando diagnósticos de urgência (Alertas) de sugestões de otimização (Conselhos).

---

## 🎯 Estratégia de Entrega (Modelo Híbrido)

Os diagnósticos seguem dois fluxos principais:
1. **Contextual (Reativo)**: Exibido nas abas técnicas (Live, Edge Audit, etc.) quando um problema é detectado na visualização atual.
2. **Consolidado (Estratégico)**: Uma lista priorizada na aba **Insights**, servindo como um "Executive Summary".

---

## 🏷️ Taxonomia e Diferenciação Semântica

| Tipo | Foco | Urgência | Destino Principal |
| :--- | :--- | :--- | :--- |
| **Alerta (Critical)** | Disponibilidade e Erros Críticos | Imediata | Push (Slack/Email) |
| **Alerta (Warning)** | Degradação severa de performance | Alta | Push + Dashboard |
| **Conselho (Info)** | Otimização e Protocolos | Roadmap | Aba Insights |
| **Conselho (Best Practice)** | Segurança e Conformidade | Baixa | Aba Security |

---

## 🗺️ Matriz de Telas vs. Conselhos

| Tela | Foco do Diagnóstico | Conselhos Aplicáveis |
| :--- | :--- | :--- |
| **Live** | Saúde imediata e protocolos | AD01, AD02, AD04, AD08, AD14 |
| **Performance** | Benchmarking e eficiência | AD05, AD06, AD09, AD19, AD20, AD21 |
| **Edge Audit** | Topologia e custos de CDN | AD03, AD10, AD20 |
| **Trends** | Padrões e consistência | AD07, AD11, AD15, AD16, AD17 |
| **Security** | Proteção e conformidade | AD07, AD12, AD13 |
| **Insights** | Consolidação e priorização | *Agregador de todos os itens (incl. AD19)* |

---

## 🚨 1. Alertas (Dano & Urgência)

### AD14: Alerta de Erros Críticos (Origin Health)
- **Tipo**: Alerta (Critical)
- **Gatilho**: Qualquer erro 5xx detectado ou taxa de 4xx > 5% na última hora.
- **Contexto**: Exibido no topo de todas as telas e enviado via Push.
- **Insight**: "{percent}% dos requests retornando erro {status}. Investigue o origin imediatamente."

### AD15: Desvio de Curto Prazo (1H vs 24H)
- **Tipo**: Alerta (Warning)
- **Gatilho**: Média de TTFB da última 1 hora > 40% acima da média das últimas 24 horas.
- **Contexto**: Aba Trends e Insights.
- **Insight**: "Performance degradou {percent}% na última hora em relação à média diária."

### AD16: Tendência de Degradação (24H vs 7D)
- **Tipo**: Alerta (Warning)
- **Gatilho**: Média de TTFB das últimas 24 horas > 25% acima da média dos últimos 7 dias.
- **Contexto**: Aba Trends e Insights.
- **Insight**: "Degradação sustentada de {percent}% nas últimas 24h em relação à semana passada."

### AD17: Regressão de Performance (7D vs 30D)
- **Tipo**: Alerta (Warning)
- **Gatilho**: Média de TTFB dos últimos 7 dias > 15% acima da média dos últimos 30 dias.
- **Contexto**: Aba Insights.
- **Insight**: "Regressão sistemática de {percent}% detectada esta semana em relação ao último mês."

### AD03: Otimizar Terminação TLS na Borda (Edge)
- **Tipo**: Alerta (Warning)
- **Gatilho**: Handshake TLS transoceânico (ex: Handshake de 400ms em regiões remotas).
- **Contexto**: Aba Edge Audit e Performance.
- **Insight**: "Seu SSL está sendo resolvido muito longe do usuário. Verifique a cobertura da sua CDN."

### AD09: Benchmark "Vs Global" Negativo
- **Tipo**: Alerta (Warning)
- **Gatilho**: TTFB regional > 50% mais lento que a média global.
- **Contexto**: Aba Performance.
- **Insight**: "Esta região está operando em 'Degraded State' comparada ao resto do mundo."

### AD19: Abismo de Performance Regional
- **Tipo**: Alerta (Warning)
- **Gatilho**: (Hit Rate Global > 80%) + (TTFB da pior região > 2.5x a melhor).
- **Contexto**: Aba Performance e Insights.
- **Insight**: "Mesmo com cache alto, a região {pior} está muito lenta comparada às demais. Verifique a topologia da sua CDN nesta localidade."

### AD11: Consistência de Cache (Zombie Cache)
- **Tipo**: Alerta (Warning)
- **Gatilho**: `Age` header variando > 24h entre POPs para o mesmo recurso.
- **Contexto**: Aba Trends.
- **Insight**: "Seu cache está 'preso' em algumas regiões (Zombie Cache). Considere uma purga agressiva."

### AD20: Latência em HIT (Edge Delivery Slow)
- **Tipo**: Alerta (Warning)
- **Gatilho**: Hit Rate > 80% combinada com TTFB > 250ms (Default Configurável).
- **Contexto**: Aba Performance, Edge Audit e Insights.
- **Insight**: "Seu cache está funcionando bem (Hit Rate alto), mas a latência de entrega está acima do esperado ({ttfb}ms). Verifique processamento pesado no Edge ou latência de storage da CDN."

### AD21: Cache Thrashing (Invalidação Frenética)
- **Tipo**: Alerta (Warning)
- **Gatilho**: Média de `Age` < 60s combinada com Hit Rate < 40%.
- **Contexto**: Aba Performance e Insights.
- **Insight**: "Seu cache está expirando ou sendo invalidado muito rápido. Verifique headers de s-maxage ou excesso de purges automáticos."

---

## 💡 2. Conselhos (Oportunidade & Melhoria)

### AD01: Upgrade para TLS 1.3
- **Tipo**: Conselho (Info)
- **Gatilho**: Uso de TLS 1.2 ou inferior.
- **Contexto**: Breakdown de TTFB na aba Live.
- **Insight**: "Você está perdendo ~100ms em handshakes. O TLS 1.3 resolveria isso com 1-RTT."

### AD02: Ativar OCSP Stapling
- **Tipo**: Conselho (Info)
- **Gatilho**: Latência de TLS inconsistente em regiões remotas.
- **Contexto**: Tabela Live (detalhe da região).
- **Insight**: "O Stapling traria a prova de validade do certificado já no handshake, economizando tempo."

### AD08: Otimização de DNS
- **Tipo**: Conselho (Info)
- **Gatilho**: Resolução DNS > 50ms.
- **Contexto**: Barra de DNS na aba Live.
- **Insight**: "Seu DNS está lento. Considere um provedor Anycast premium para acelerar o primeiro byte."

### AD05: Implementar Cache-Control "Stale-While-Revalidate"
- **Tipo**: Conselho (Info)
- **Gatilho**: Baixo Hit Ratio + TTFB de origem alto.
- **Contexto**: Aba Performance.
- **Insight**: "Sirva o cache antigo enquanto revalida em background para eliminar a espera da origem."

### AD10: Ajuste de Price Class (CDN)
- **Tipo**: Conselho (Info)
- **Gatilho**: Bypass retorna HIT consistentemente em regiões de alto custo (Ásia/África).
- **Contexto**: Aba Edge Audit.
- **Insight**: "Sua CDN pode estar ignorando POPs caros por configuração de custo. Verifique seu Price Class."

### AD07: Forçar HSTS (Strict-Transport-Security)
- **Tipo**: Conselho (Best Practice)
- **Gatilho**: Header HSTS ausente.
- **Contexto**: Aba Security e Trends.
- **Insight**: "Elimine o redirecionamento 301 inicial forçando HTTPS no browser."

### AD12: Implementar Content-Security-Policy (CSP)
- **Tipo**: Conselho (Best Practice)
- **Gatilho**: Header CSP ausente ou inseguro.
- **Contexto**: Aba Security.
- **Insight**: "Proteja seus usuários contra ataques XSS definindo uma política de CSP estrita."

### AD13: Restringir Permissions-Policy
- **Tipo**: Conselho (Best Practice)
- **Gatilho**: Header Permissions-Policy ausente.
- **Contexto**: Aba Security.
- **Insight**: "Limite o acesso de scripts a recursos sensíveis (câmera, microfone) via Permissions-Policy."

---

## ⚙️ Configuração & Integração

- **Thresholds**: Todos os gatilhos percentuais são configuráveis por monitor.
- **Alertas**: Itens marcados como "Alerta" (Critical/Warning) possuem toggle para notificação Push.
- **Insights Tab**: Atua como o agregador central, ordenando todos os itens ativos por severidade.
