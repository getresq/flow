# Release Artifacts

`resq-flow` publishes versioned release artifacts from Git tags.

The release workflow runs for tags matching `v*` and creates:

- `resq-flow-x86_64-unknown-linux-gnu.tar.gz`
- `resq-flow-x86_64-unknown-linux-gnu.tar.gz.sha256`

The tarball contains:

```text
resq-flow-x86_64-unknown-linux-gnu/
  bin/resq-flow-relay
  contracts/
    ...
  flows/
    ...
  ui/
    ...
```

Downstream deployments can pin a release tag, download the tarball during image build, verify the checksum, and install `bin/resq-flow-relay`. Flow-specific data stays in the `contracts/` and `flows/` config directories.

## Creating A Release

Update the version in `relay/Cargo.toml`, then tag and push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The GitHub Release is created by `.github/workflows/release.yml`.

Regular CI for pushes and pull requests runs from `.github/workflows/ci.yml`, including TypeScript coverage for the UI and CLI.

## Local Packaging Check

After building the relay and UI locally, package the same artifact shape with:

```bash
cargo build --locked --release --manifest-path relay/Cargo.toml
cd ui && bun install --frozen-lockfile && bun run build
cd ..
scripts/package-release.sh x86_64-unknown-linux-gnu relay/target/release/resq-flow-relay ui/dist ui/src/flow-contracts ui/src/flow-definitions dist
```

The package script requires Linux `sha256sum`, which is available in the release workflow runner.
