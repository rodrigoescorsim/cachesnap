// Scheduler: a cada intervalo configurado por monitor, dispara os probes
// nas regiões ativas chamando os Cloudflare Workers.
//
// Implementação completa vem no Dia 4 do cronograma.
// Por ora: stub para compilar e estrutura comentada.

use crate::AppState;

pub async fn start(state: AppState) {
    tracing::info!("Scheduler started — probe dispatch will run here");
    // TODO Dia 4:
    // 1. Buscar todos os monitors ativos no banco
    // 2. Para cada monitor, calcular se chegou a hora do próximo check
    // 3. Disparar fetch() para cada Worker nas regiões configuradas
    //    com header { monitor_id, callback_url: api/ingest }
    // 4. Repetir com tokio::time::interval
    let _ = state; // evitar warning de variável não usada
}
