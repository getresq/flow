use std::path::PathBuf;

pub fn package_relative_dir(name: &str) -> Option<PathBuf> {
    let exe_path = std::env::current_exe().ok()?;
    package_relative_dir_from_exe(&exe_path, name)
}

fn package_relative_dir_from_exe(exe_path: &std::path::Path, name: &str) -> Option<PathBuf> {
    let package_root = exe_path.parent()?.parent()?;
    let candidate = package_root.join(name);
    candidate.is_dir().then_some(candidate)
}

pub fn env_or_package_or_source_dir(
    env_name: &str,
    package_name: &str,
    source_relative_path: &str,
) -> PathBuf {
    std::env::var(env_name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| package_relative_dir(package_name))
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(source_relative_path))
}

#[cfg(test)]
mod tests {
    use super::package_relative_dir_from_exe;

    #[test]
    fn resolves_package_relative_directories_from_packaged_binary_path() {
        let root = std::env::temp_dir().join(format!(
            "resq-flow-package-path-test-{}",
            std::process::id(),
        ));
        let bin_dir = root.join("bin");
        let flows_dir = root.join("flows");
        std::fs::create_dir_all(&bin_dir).expect("create bin dir");
        std::fs::create_dir_all(&flows_dir).expect("create flows dir");

        let resolved = package_relative_dir_from_exe(&bin_dir.join("resq-flow-relay"), "flows")
            .expect("resolve package flows dir");
        assert_eq!(resolved, flows_dir);

        let _ = std::fs::remove_dir_all(root);
    }
}
