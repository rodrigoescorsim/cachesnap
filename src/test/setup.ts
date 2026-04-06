// Set required env vars so DB/auth modules can be imported in unit tests.
// The DB will not actually connect unless a query is executed.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_hoplens'
