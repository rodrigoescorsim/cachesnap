use std::path::PathBuf;

/// Loads env files for local dev: monorepo root `.env` first, then `api/.env` overrides.
///
/// `RESEND_API_KEY` and other shared vars live in the repo root; running `cargo run` from
/// `api/` only reads that directory by default — this merges both without duplicating secrets.
pub fn load_dotenv_files() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root_env = manifest_dir.join("..").join(".env");
    let api_env = manifest_dir.join(".env");

    if root_env.exists() {
        dotenvy::from_path(&root_env).ok();
    }

    if api_env.exists() {
        dotenvy::from_path_override(&api_env).ok();
    } else {
        dotenvy::dotenv_override().ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_dotenv_files_does_not_panic() {
        load_dotenv_files();
    }
}
