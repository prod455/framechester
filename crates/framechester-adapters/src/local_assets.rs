use framechester_core::domain::{AssetManifest, Scene};
use framechester_core::error::{FramechesterError, Result};
use framechester_core::ports::{AdapterInfo, AssetProvider};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::io::Read;
use std::path::{Component, Path};

pub(crate) fn local_media_demuxer(asset: &AssetManifest) -> Result<&'static str> {
    let extension = asset
        .path
        .as_ref()
        .and_then(|path| path.extension())
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match (asset.kind.as_str(), extension.as_str()) {
        ("image", "png" | "jpg" | "jpeg" | "webp" | "bmp") => Ok("image2"),
        ("video", "mp4" | "mov" | "m4v") => Ok("mov"),
        ("video", "mkv" | "webm") => Ok("matroska"),
        ("video", "avi") => Ok("avi"),
        _ => Err(FramechesterError::InvalidInput(format!(
            "tipo/extensao de asset nao suportado para cena {}",
            asset.scene_id
        ))),
    }
}

pub fn validate_local_asset(asset: &AssetManifest) -> Result<()> {
    local_media_demuxer(asset)?;
    if asset.license.trim().is_empty()
        || asset.provenance.trim().is_empty()
        || asset.restrictions.trim().is_empty()
    {
        return Err(FramechesterError::InvalidInput(format!(
            "asset da cena {} exige licenca, proveniencia e restricoes explicitas",
            asset.scene_id
        )));
    }
    let path = asset.path.as_ref().ok_or_else(|| {
        FramechesterError::InvalidInput(format!("asset da cena {} sem path", asset.scene_id))
    })?;
    if !path.is_file() {
        return Err(FramechesterError::InvalidInput(format!(
            "arquivo de asset ausente para cena {}",
            asset.scene_id
        )));
    }
    let mut file = std::fs::File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    let actual = format!("{:x}", digest.finalize());
    if !actual.eq_ignore_ascii_case(asset.checksum.trim()) {
        return Err(FramechesterError::InvalidInput(format!(
            "checksum SHA256 divergente para asset da cena {}",
            asset.scene_id
        )));
    }
    Ok(())
}

#[derive(Debug, Clone)]
pub struct LocalAssetProvider {
    assets: Vec<AssetManifest>,
}

impl LocalAssetProvider {
    pub fn from_json_file(path: &Path) -> Result<Self> {
        let path = path.canonicalize()?;
        let directory = path
            .parent()
            .ok_or_else(|| FramechesterError::InvalidInput("manifesto sem diretorio".into()))?;
        let mut assets: Vec<AssetManifest> = serde_json::from_slice(&std::fs::read(&path)?)?;
        if assets.is_empty() {
            return Err(FramechesterError::InvalidInput(
                "manifesto de assets vazio".into(),
            ));
        }
        let mut scene_ids = HashSet::new();
        for asset in &mut assets {
            if !scene_ids.insert(asset.scene_id) {
                return Err(FramechesterError::InvalidInput(format!(
                    "manifesto tem assets duplicados para cena {}",
                    asset.scene_id
                )));
            }
            let relative = asset.path.as_ref().ok_or_else(|| {
                FramechesterError::InvalidInput(format!(
                    "asset da cena {} sem path",
                    asset.scene_id
                ))
            })?;
            if relative.is_absolute()
                || relative
                    .components()
                    .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
            {
                return Err(FramechesterError::InvalidInput(
                    "path de asset deve ser relativo e permanecer no diretorio do manifesto".into(),
                ));
            }
            let absolute = directory.join(relative).canonicalize()?;
            if !absolute.starts_with(directory) {
                return Err(FramechesterError::InvalidInput(
                    "asset fora do diretorio do manifesto".into(),
                ));
            }
            asset.path = Some(absolute);
            validate_local_asset(asset)?;
        }
        Ok(Self { assets })
    }
}

impl AssetProvider for LocalAssetProvider {
    fn info(&self) -> AdapterInfo {
        AdapterInfo::local(
            "local-assets",
            "licencas individuais declaradas no manifesto",
        )
    }

    fn resolve(&self, scene: &Scene, _index: usize) -> Result<AssetManifest> {
        let asset = self
            .assets
            .iter()
            .find(|asset| asset.scene_id == scene.id)
            .cloned()
            .ok_or_else(|| {
                FramechesterError::Unavailable(format!("asset ausente para cena {}", scene.id))
            })?;
        validate_local_asset(&asset)?;
        Ok(asset)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::path::PathBuf;

    fn scene(id: u32) -> Scene {
        Scene {
            id,
            heading: "Cena original".into(),
            narration: "Narracao de teste".into(),
            visual_brief: "Imagem autorizada".into(),
            duration_hint_secs: 1.0,
        }
    }

    fn manifest() -> AssetManifest {
        AssetManifest {
            scene_id: 2,
            kind: "image".into(),
            path: Some(PathBuf::from("image.png")),
            license: "CC0-1.0".into(),
            provenance: "fixture sintetica local".into(),
            checksum: format!("{:x}", Sha256::digest(b"fixture")),
            restrictions: "nenhuma; fixture sintetica".into(),
        }
    }

    fn write_manifest(directory: &Path, assets: &[AssetManifest]) -> std::path::PathBuf {
        let path = directory.join("assets.json");
        std::fs::write(&path, serde_json::to_vec(assets).unwrap()).unwrap();
        path
    }

    #[test]
    fn resolves_by_scene_id_and_manifest_directory() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("image.png"), b"fixture").unwrap();
        let path = write_manifest(directory.path(), &[manifest()]);
        let provider = LocalAssetProvider::from_json_file(&path).unwrap();
        let resolved = provider.resolve(&scene(2), 0).unwrap();
        assert_eq!(resolved.scene_id, 2);
        assert_eq!(resolved.kind, "image");
        assert_eq!(
            resolved.path.unwrap(),
            directory.path().join("image.png").canonicalize().unwrap()
        );
        assert!(provider.resolve(&scene(0), 2).is_err());
        assert!(!provider.info().network);
    }

    #[test]
    fn rejects_missing_rights_metadata_or_bad_checksum() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("image.png"), b"fixture").unwrap();
        let mut invalid = Vec::new();
        let mut no_license = manifest();
        no_license.license.clear();
        invalid.push(no_license);
        let mut no_provenance = manifest();
        no_provenance.provenance.clear();
        invalid.push(no_provenance);
        let mut no_restrictions = manifest();
        no_restrictions.restrictions.clear();
        invalid.push(no_restrictions);
        let mut wrong_hash = manifest();
        wrong_hash.checksum = "0".repeat(64);
        invalid.push(wrong_hash);
        for asset in invalid {
            let path = write_manifest(directory.path(), &[asset]);
            assert!(LocalAssetProvider::from_json_file(&path).is_err());
        }
    }

    #[test]
    fn rejects_ambiguous_scenes_and_paths_outside_manifest() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("image.png"), b"fixture").unwrap();
        let path = write_manifest(directory.path(), &[manifest(), manifest()]);
        assert!(LocalAssetProvider::from_json_file(&path).is_err());
        let mut outside = manifest();
        outside.path = Some(directory.path().join("image.png"));
        let path = write_manifest(directory.path(), &[outside]);
        assert!(LocalAssetProvider::from_json_file(&path).is_err());
        let nested = directory.path().join("nested");
        std::fs::create_dir(&nested).unwrap();
        let mut traversal = manifest();
        traversal.path = Some("../image.png".into());
        let path = write_manifest(&nested, &[traversal]);
        assert!(LocalAssetProvider::from_json_file(&path).is_err());
    }

    #[test]
    fn rejects_unsupported_media_and_rechecks_modified_files() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("image.png"), b"fixture").unwrap();
        let mut unsupported = manifest();
        unsupported.kind = "remote".into();
        let path = write_manifest(directory.path(), &[unsupported]);
        assert!(LocalAssetProvider::from_json_file(&path).is_err());
        let path = write_manifest(directory.path(), &[manifest()]);
        let provider = LocalAssetProvider::from_json_file(&path).unwrap();
        std::fs::write(directory.path().join("image.png"), b"alterado").unwrap();
        assert!(provider.resolve(&scene(2), 0).is_err());
    }

    #[test]
    fn rejects_empty_manifest_and_missing_media() {
        let directory = tempfile::tempdir().unwrap();
        let path = write_manifest(directory.path(), &[]);
        assert!(LocalAssetProvider::from_json_file(&path).is_err());
        let path = write_manifest(directory.path(), &[manifest()]);
        assert!(LocalAssetProvider::from_json_file(&path).is_err());
    }
}
