# CacheSnap Advisor Framework — v1.0

Este documento define como o motor de conselhos do CacheSnap se integra à interface. O objetivo é fornecer diagnósticos contextuais baseados na tela que o usuário está navegando.

---

## 🎯 Estratégia de Entrega (Modelo Híbrido)

Para maximizar a utilidade, os conselhos seguem dois fluxos:
1. **Contextual (Reativo)**: Cards ou "pills" exibidos diretamente nas abas técnicas (Live, Edge Audit, etc.) quando um problema é detectado na visualização atual.
2. **Consolidado (Estratégico)**: Uma lista única e priorizada na aba **Insights**, servindo como um "Executive Summary" para otimização do monitor.

---

## 🗺️ Matriz de Telas vs. Conselhos

| Tela | Foco do Diagnóstico | Conselhos Aplicáveis |
| :--- | :--- | :--- |
| **Live** | Saúde imediata e protocolos | AD01, AD02, AD04, AD08 |
| **Performance** | Benchmarking e eficiência | AD05, AD06, AD09 |
| **Edge Audit** | Topologia e custos de CDN | AD03, AD10 |
| **Trends** | Padrões e consistência | AD07, AD11 |
| **Security** | Proteção e conformidade | AD07, AD12, AD13 |
| **Insights** | Consolidação e priorização | *Agregador de todos os conselhos* |

---

## ⚡ 1. Live Dashboard (Handshake & DNS)

### AD01: Upgrade para TLS 1.3
- **Contexto**: Exibido no breakdown de TTFB quando a barra de TLS (roxa) está acima da média.
- **Gatilho**: Uso de TLS 1.2 ou inferior.
- **Insight**: "Você está perdendo ~100ms em handshakes desnecessários. O TLS 1.3 resolveria isso com 1-RTT."

### AD02: Ativar OCSP Stapling
- **Contexto**: Exibido no detalhe da região na tabela Live.
- **Gatilho**: Latência de TLS inconsistente em regiões remotas.
- **Insight**: "O browser está perdendo tempo validando seu certificado. O Stapling traria essa prova já no handshake."

### AD08: Otimização de DNS
- **Contexto**: Exibido quando a barra de DNS (azul) é > 50ms.
- **Gatilho**: Resolução DNS lenta em POPs específicos.
- **Insight**: "Seu DNS está levando mais tempo que o próprio processamento do Edge. Considere um provedor Anycast premium."

---

## 📊 2. Performance View (Eficiência & Benchmarking)

### AD05: Implementar Cache-Control "Stale-While-Revalidate"
- **Contexto**: Exibido na tabela de performance histórica ao detectar MISS frequente.
- **Gatilho**: Monitor com baixo Hit Ratio e TTFB de origem alto.
- **Insight**: "Não faça seu usuário esperar a origem. Sirva o cache antigo enquanto revalida em background."

### AD09: Benchmark "Vs Global" Negativo
- **Contexto**: Exibido quando uma região está > 50% mais lenta que a média global.
- **Gatilho**: TTFB regional muito acima do benchmark global.
- **Insight**: "Esta região está operando em 'Degraded State'. Verifique o roteamento do provedor local."

---

## 🌐 3. Edge Audit (Topologia & Custo)

### AD03: Otimizar Terminação TLS na Borda (Edge)
- **Contexto**: Exibido no painel de Global Impact Analysis.
- **Gatilho**: Handshake TLS transoceânico (ex: Handshake de 400ms em Sydney).
- **Insight**: "Seu SSL está sendo resolvido muito longe do usuário. Verifique se o seu plano de CDN inclui POPs nesta região."

### AD10: Ajuste de Price Class (CloudFront/CDNs)
- **Contexto**: Exibido quando o Edge Audit detecta falha sistemática de bypass em regiões específicas.
- **Gatilho**: Bypass retorna HIT consistentemente em regiões de alto custo (Ásia/África).
- **Insight**: "Sua CDN pode estar economizando custos ao ignorar POPs caros, forçando o tráfego para regiões distantes."

---

## 📈 4. Trends & Security (Padrões de Longo Prazo)

### AD07: Forçar HSTS (Strict-Transport-Security)
- **Contexto**: Exibido na aba Trends ou Security.
- **Gatilho**: Header HSTS ausente.
- **Insight**: "Elimine o redirecionamento 301 inicial. Forçar HTTPS no browser economiza um RTT completo no primeiro acesso."

### AD11: Consistência de Cache (Zombie Cache)
- **Contexto**: Exibido na aba Trends ao detectar Headers de `Age` muito discrepantes entre regiões.
- **Gatilho**: `Age` header variando > 24h entre POPs para o mesmo recurso.
- **Insight**: "Seu cache está 'preso' em algumas regiões (Zombie Cache). Considere uma política de purga mais agressiva."

---

## 🛡️ 5. Security Audit (Proteção & Conformidade)

### AD12: Implementar Content-Security-Policy (CSP)
- **Contexto**: Exibido na aba Security.
- **Gatilho**: Header `Content-Security-Policy` ausente ou muito permissivo (`unsafe-inline`).
- **Insight**: "Seu site está vulnerável a ataques de XSS. Defina uma política de CSP estrita para proteger seus usuários."

### AD13: Restringir Permissions-Policy
- **Contexto**: Exibido na aba Security.
- **Gatilho**: Header `Permissions-Policy` ausente.
- **Insight**: "Limite o acesso de scripts de terceiros a recursos sensíveis como câmera e microfone. Adicione uma Permissions-Policy para maior controle."

---

## 💡 6. Insights (Centralizador de Inteligência)

A aba **Insights** funciona como o "Executive Summary" do monitor. Ela não gera novos gatilhos, mas consome todos os gatilhos disparados pelas outras abas e os organiza em um formato de lista de tarefas (To-Do List).

- **Ordenação**: Impacto na Performance (High -> Low).
- **Ação**: Cada item linka diretamente para a tela onde o problema foi detectado (ex: "Ver no Edge Audit").
