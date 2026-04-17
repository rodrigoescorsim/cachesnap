#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Region {
    pub id: String,
    pub lambda_url: String,
}
