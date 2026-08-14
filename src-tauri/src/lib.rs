//! أوامر سطح المكتب وطبقة تقديم أصول المصحف.
//! أصول العرض الأساسية تُحمّل مرة واحدة في لقطة ذاكرة ثابتة قبل إنشاء الواجهة؛
//! بوابة السلامة تفحص اللقطة نفسها التي ستُعرض لاحقاً، فتُغلق نافذة TOCTOU.
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::Manager;

const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_ASSET_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ASSET_TOTAL_BYTES: u64 = 80 * 1024 * 1024;
const MAX_BACKUP_BYTES: usize = 8 * 1024 * 1024;
const TRUSTED_BUNDLE_SHA256: &str =
    "b2e4f708e0111045d0f5a0e238ed7e139cebff2ca098e7f9603a550834ffc8f2";
static TEMP_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudTarget {
    provider: &'static str,
    label: &'static str,
    folder: String,
}

#[derive(Deserialize)]
struct AssetManifest {
    schema_version: Option<u8>,
    bundle: AssetBundle,
    files: Vec<AssetManifestFile>,
}

#[derive(Deserialize)]
struct AssetBundle {
    sha256: String,
    name: Option<String>,
    mushaf: Option<String>,
    pages_total: Option<u16>,
    pages_present: Option<Vec<u16>>,
    generated_at_utc: Option<String>,
}

#[derive(Deserialize)]
struct AssetManifestFile {
    path: String,
    size: Option<u64>,
}

/// لقطة غير قابلة للتبديل لأصول العرض التي يغطيها manifest.json.
struct MushafAssetStore {
    root: PathBuf,
    files: HashMap<String, Vec<u8>>,
}

fn strip_verbatim(path: &Path) -> PathBuf {
    let value = path.to_string_lossy();
    match value.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path.to_path_buf(),
    }
}

fn mushaf_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    Ok(strip_verbatim(&dir).join("assets").join("mushaf-qcf4"))
}

fn safe_relative_path(value: &str) -> bool {
    if value.is_empty()
        || value.len() > 160
        || value.contains('\\')
        || value.contains('\0')
        || value.starts_with('/')
    {
        return false;
    }
    Path::new(value)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn expected_asset_paths() -> HashSet<String> {
    let mut paths = HashSet::from([
        "LICENSE.md".to_string(),
        "README.md".to_string(),
        "extras/surah-name-v2.ttf".to_string(),
        "font-map.json".to_string(),
        "index.json".to_string(),
        "layout/meta.json".to_string(),
        "surah-names.json".to_string(),
        "verses-text.json".to_string(),
        "verses.json".to_string(),
    ]);
    for page in 1..=604 {
        paths.insert(format!("pages/{page:03}.json"));
    }
    for font in 1..=47 {
        paths.insert(format!("fonts/QCF4_Hafs_{font:02}_W.woff2"));
    }
    paths.insert("fonts/QCF4_QBSML.woff2".to_string());
    paths
}

fn validate_inventory(paths: &[String]) -> Result<(), String> {
    let expected = expected_asset_paths();
    if paths.is_empty() || paths.len() != expected.len() {
        return Err(format!(
            "قائمة الأصول غير مكتملة: المتوقع {} والموجود {}",
            expected.len(),
            paths.len()
        ));
    }
    let mut seen = HashSet::with_capacity(paths.len());
    for path in paths {
        if !safe_relative_path(path) || !expected.contains(path) {
            return Err(format!("مسار أصل غير مسموح: {path}"));
        }
        if !seen.insert(path.clone()) {
            return Err(format!("مسار أصل مكرر: {path}"));
        }
    }
    if seen != expected {
        return Err("قائمة الأصول لا تطابق مخزون الإصدار".to_string());
    }
    Ok(())
}

fn read_file_limited(path: &Path, maximum: u64) -> Result<Vec<u8>, String> {
    let file = std::fs::File::open(path).map_err(|_| "تعذر فتح الملف".to_string())?;
    let mut limited = file.take(maximum + 1);
    let mut bytes = Vec::new();
    limited
        .read_to_end(&mut bytes)
        .map_err(|_| "تعذر قراءة الملف".to_string())?;
    if bytes.len() as u64 > maximum {
        return Err("حجم الملف يتجاوز الحد الآمن".to_string());
    }
    Ok(bytes)
}

impl MushafAssetStore {
    fn load(root: PathBuf) -> Result<Self, String> {
        let canonical_root = root
            .canonicalize()
            .map_err(|_| "تعذر فتح جذر أصول المصحف".to_string())?;
        let manifest_path = root.join("manifest.json");
        let manifest_meta =
            std::fs::metadata(&manifest_path).map_err(|_| "manifest.json مفقود".to_string())?;
        if manifest_meta.len() == 0 || manifest_meta.len() > MAX_MANIFEST_BYTES {
            return Err("حجم manifest.json غير صالح".to_string());
        }
        let manifest_bytes = read_file_limited(&manifest_path, MAX_MANIFEST_BYTES)
            .map_err(|_| "تعذر قراءة manifest.json ضمن الحد الآمن".to_string())?;
        let manifest: AssetManifest = serde_json::from_slice(&manifest_bytes)
            .map_err(|_| "مخطط manifest.json غير صالح".to_string())?;
        if manifest.bundle.sha256 != TRUSTED_BUNDLE_SHA256 {
            return Err("بصمة الحزمة ليست معتمدة في هذا الإصدار".to_string());
        }
        match manifest.schema_version {
            None => {}
            Some(2) => {
                let pages_ok = manifest
                    .bundle
                    .pages_present
                    .as_ref()
                    .map(|pages| {
                        pages.len() == 604
                            && pages
                                .iter()
                                .enumerate()
                                .all(|(index, page)| *page as usize == index + 1)
                    })
                    .unwrap_or(false);
                if manifest.bundle.name.as_deref() != Some("mushaf-qcf4-bundle")
                    || manifest
                        .bundle
                        .mushaf
                        .as_deref()
                        .map(str::is_empty)
                        .unwrap_or(true)
                    || manifest.bundle.pages_total != Some(604)
                    || !pages_ok
                    || manifest
                        .bundle
                        .generated_at_utc
                        .as_deref()
                        .map(|value| value.len() != 20 || !value.ends_with('Z'))
                        .unwrap_or(true)
                {
                    return Err("بيانات وصف حزمة المانيفست غير صالحة".to_string());
                }
            }
            Some(version) => {
                return Err(format!("إصدار مخطط المانيفست غير مدعوم: {version}"));
            }
        }
        let paths: Vec<String> = manifest
            .files
            .iter()
            .map(|file| file.path.clone())
            .collect();
        validate_inventory(&paths)?;

        let sizes_present = manifest
            .files
            .iter()
            .filter(|file| file.size.is_some())
            .count();
        if sizes_present != 0 && sizes_present != manifest.files.len() {
            return Err("حقول أحجام الأصول جزئية".to_string());
        }
        if manifest.schema_version == Some(2) && sizes_present != manifest.files.len() {
            return Err("مخطط المانيفست 2 يتطلب حجم كل أصل".to_string());
        }

        let mut total = manifest_bytes.len() as u64;
        let mut files = HashMap::with_capacity(manifest.files.len() + 1);
        files.insert("manifest.json".to_string(), manifest_bytes);
        for entry in manifest.files {
            let path = root.join(&entry.path);
            let metadata = std::fs::symlink_metadata(&path)
                .map_err(|_| format!("أصل إلزامي مفقود: {}", entry.path))?;
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(format!("نوع أصل غير مسموح: {}", entry.path));
            }
            if metadata.len() == 0 || metadata.len() > MAX_ASSET_BYTES {
                return Err(format!("حجم أصل غير صالح: {}", entry.path));
            }
            if let Some(declared) = entry.size {
                if declared != metadata.len() {
                    return Err(format!("حجم أصل لا يطابق المانيفست: {}", entry.path));
                }
            }
            let canonical = path
                .canonicalize()
                .map_err(|_| format!("تعذر حسم أصل: {}", entry.path))?;
            if !canonical.starts_with(&canonical_root) {
                return Err(format!("أصل خارج الجذر: {}", entry.path));
            }
            total = total
                .checked_add(metadata.len())
                .ok_or_else(|| "تجاوز مجموع أحجام الأصول الحد".to_string())?;
            if total > MAX_ASSET_TOTAL_BYTES {
                return Err("تجاوز مجموع أحجام الأصول الحد الآمن".to_string());
            }
            let bytes = read_file_limited(&path, MAX_ASSET_BYTES)
                .map_err(|_| format!("تعذر قراءة أصل ضمن الحد: {}", entry.path))?;
            if bytes.len() as u64 != metadata.len() {
                return Err(format!("تغير أصل أثناء إنشاء اللقطة: {}", entry.path));
            }
            files.insert(entry.path, bytes);
        }
        Ok(Self { root, files })
    }
}

#[tauri::command]
fn asset_base(store: tauri::State<'_, MushafAssetStore>) -> String {
    store.root.to_string_lossy().into_owned()
}

fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("json") => "application/json; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("md") => "text/markdown; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn allowed_origin(request: &tauri::http::Request<Vec<u8>>) -> Option<&str> {
    let origin = request.headers().get("Origin")?.to_str().ok()?;
    matches!(
        origin,
        "http://tauri.localhost"
            | "https://tauri.localhost"
            | "tauri://localhost"
            | "http://localhost:1420"
            | "http://127.0.0.1:1420"
    )
    .then_some(origin)
}

fn response(
    status: u16,
    mime: &'static str,
    bytes: Vec<u8>,
    origin: Option<&str>,
) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff");
    if let Some(value) = origin {
        builder = builder.header("Access-Control-Allow-Origin", value);
    }
    builder.body(bytes).expect("valid static response")
}

fn is_allowed_tafsir_path(relative: &str) -> bool {
    let parts: Vec<&str> = relative.split('/').collect();
    if parts.len() != 3
        || parts[0] != "tafsir"
        || !matches!(parts[1], "ibn-kathir" | "sadi" | "asbab")
    {
        return false;
    }
    let Some(stem) = parts[2].strip_suffix(".json") else {
        return false;
    };
    stem.parse::<u16>()
        .map(|surah| (1..=114).contains(&surah) && stem == surah.to_string())
        .unwrap_or(false)
}

fn serve_mushaf(
    app: &tauri::AppHandle,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use percent_encoding::percent_decode;

    let origin_header = request.headers().get("Origin").is_some();
    let origin = allowed_origin(request);
    if origin_header && origin.is_none() {
        return response(
            403,
            "text/plain; charset=utf-8",
            b"forbidden origin".to_vec(),
            None,
        );
    }
    if request.method() != tauri::http::Method::GET && request.method() != tauri::http::Method::HEAD
    {
        return response(
            405,
            "text/plain; charset=utf-8",
            b"method not allowed".to_vec(),
            origin,
        );
    }
    let Some(raw) = request
        .uri()
        .path()
        .strip_prefix('/')
        .filter(|value| !value.is_empty())
    else {
        return response(
            400,
            "text/plain; charset=utf-8",
            b"invalid path".to_vec(),
            origin,
        );
    };
    let Ok(decoded) = percent_decode(raw.as_bytes()).decode_utf8() else {
        return response(
            400,
            "text/plain; charset=utf-8",
            b"invalid encoding".to_vec(),
            origin,
        );
    };
    if decoded.chars().any(char::is_control) {
        return response(
            400,
            "text/plain; charset=utf-8",
            b"invalid path".to_vec(),
            origin,
        );
    }

    let path = PathBuf::from(decoded.as_ref());
    let store = app.state::<MushafAssetStore>();
    let Ok(relative_path) = path.strip_prefix(&store.root) else {
        return response(
            403,
            "text/plain; charset=utf-8",
            b"forbidden path".to_vec(),
            origin,
        );
    };
    if !relative_path
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
    {
        return response(
            403,
            "text/plain; charset=utf-8",
            b"forbidden path".to_vec(),
            origin,
        );
    }
    let relative = relative_path.to_string_lossy().replace('\\', "/");
    if let Some(bytes) = store.files.get(&relative) {
        let body = if request.method() == tauri::http::Method::HEAD {
            Vec::new()
        } else {
            bytes.clone()
        };
        return response(200, mime_for(&path), body, origin);
    }

    // التفاسير ليست نص العرض القرآني ولا تدخل بوابة البصمات. تُقرأ عند الطلب
    // لكن ضمن مسارين مغلقين، مع حسم canonical وحد أقصى للحجم.
    if !is_allowed_tafsir_path(&relative) {
        return response(
            404,
            "text/plain; charset=utf-8",
            b"not found".to_vec(),
            origin,
        );
    }
    let Ok(canonical_root) = store.root.canonicalize() else {
        return response(
            500,
            "text/plain; charset=utf-8",
            b"resource error".to_vec(),
            origin,
        );
    };
    let Ok(metadata) = std::fs::symlink_metadata(&path) else {
        return response(
            404,
            "text/plain; charset=utf-8",
            b"not found".to_vec(),
            origin,
        );
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_ASSET_BYTES
    {
        return response(
            403,
            "text/plain; charset=utf-8",
            b"forbidden resource".to_vec(),
            origin,
        );
    }
    let Ok(canonical) = path.canonicalize() else {
        return response(
            404,
            "text/plain; charset=utf-8",
            b"not found".to_vec(),
            origin,
        );
    };
    if !canonical.starts_with(canonical_root) {
        return response(
            403,
            "text/plain; charset=utf-8",
            b"forbidden resource".to_vec(),
            origin,
        );
    }
    match read_file_limited(&path, MAX_ASSET_BYTES) {
        Ok(bytes) if bytes.len() as u64 <= MAX_ASSET_BYTES => {
            let body = if request.method() == tauri::http::Method::HEAD {
                Vec::new()
            } else {
                bytes
            };
            response(200, "application/json; charset=utf-8", body, origin)
        }
        _ => response(
            500,
            "text/plain; charset=utf-8",
            b"resource error".to_vec(),
            origin,
        ),
    }
}

fn detect_onedrive() -> Option<PathBuf> {
    for variable in ["OneDriveConsumer", "OneDrive", "OneDriveCommercial"] {
        if let Ok(value) = std::env::var(variable) {
            let path = PathBuf::from(value);
            if path.is_dir() {
                return Some(path);
            }
        }
    }
    None
}

fn detect_gdrive() -> Option<PathBuf> {
    for letter in b'D'..=b'Z' {
        let drive_root = PathBuf::from(format!("{}:\\", letter as char));
        let candidate = drive_root.join("My Drive");
        // لا يكفي وجود مجلد اسمه My Drive: علامة DriveFS تقلل احتمال اختيار
        // مجلد عادي بالاسم نفسه. عند غيابها يبقى «حفظ باسم» هو المسار الآمن.
        let drivefs_marker = drive_root.join(".shortcut-targets-by-id");
        if candidate.is_dir() && drivefs_marker.is_dir() {
            return Some(candidate);
        }
    }
    None
}

#[tauri::command]
fn cloud_targets() -> Vec<CloudTarget> {
    let mut targets = Vec::new();
    if let Some(path) = detect_onedrive() {
        targets.push(CloudTarget {
            provider: "onedrive",
            label: "OneDrive",
            folder: path.to_string_lossy().into_owned(),
        });
    }
    if let Some(path) = detect_gdrive() {
        targets.push(CloudTarget {
            provider: "gdrive",
            label: "Google Drive",
            folder: path.to_string_lossy().into_owned(),
        });
    }
    targets
}

fn validate_backup_contents(contents: &str) -> Result<(), String> {
    if contents.is_empty() || contents.len() > MAX_BACKUP_BYTES {
        return Err("حجم النسخة الاحتياطية غير مسموح".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(contents)
        .map_err(|_| "محتوى النسخة الاحتياطية ليس JSON صالحاً".to_string())?;
    let object = value
        .as_object()
        .ok_or_else(|| "مخطط النسخة الاحتياطية غير صالح".to_string())?;
    if object.get("app").and_then(|item| item.as_str()) != Some("mushaf-mubtakir") {
        return Err("النسخة الاحتياطية لا تخص هذا التطبيق".to_string());
    }
    let version = object
        .get("backupVersion")
        .and_then(|item| item.as_u64())
        .ok_or_else(|| "إصدار النسخة الاحتياطية غير صالح".to_string())?;
    if version != 1 {
        return Err("إصدار النسخة الاحتياطية غير مدعوم".to_string());
    }
    if object
        .get("createdAt")
        .and_then(|item| item.as_str())
        .is_none()
    {
        return Err("تاريخ النسخة الاحتياطية مفقود".to_string());
    }
    let stores = object
        .get("stores")
        .and_then(|item| item.as_object())
        .ok_or_else(|| "مخازن النسخة الاحتياطية غير صالحة".to_string())?;
    if stores.is_empty()
        || stores
            .keys()
            .any(|key| !matches!(key.as_str(), "mushaf-reader" | "mushaf-wirds"))
    {
        return Err("النسخة الاحتياطية تحوي مخازن غير مسموحة".to_string());
    }
    Ok(())
}

fn validate_cloud_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty()
        || filename.len() > 128
        || !filename.ends_with(".bak")
        || !filename
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        || filename.starts_with('.')
    {
        return Err("اسم ملف النسخة الاحتياطية غير صالح".to_string());
    }
    Ok(())
}

fn validate_selected_backup_path(
    path: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| !extension.eq_ignore_ascii_case("bak"))
            .unwrap_or(true)
    {
        return Err("مسار النسخة الاحتياطية غير صالح".to_string());
    }
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && name.len() <= 160 && !name.chars().any(char::is_control))
        .ok_or_else(|| "اسم ملف النسخة الاحتياطية غير صالح".to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "مجلد النسخة الاحتياطية غير صالح".to_string())?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|_| "يجب أن يكون مجلد الحفظ موجوداً".to_string())?;
    if !canonical_parent.is_dir() {
        return Err("مجلد الحفظ غير صالح".to_string());
    }
    if !allowed_roots
        .iter()
        .any(|root| canonical_parent.starts_with(root))
    {
        return Err(
            "الحفظ المباشر مسموح داخل سطح المكتب/المستندات/التنزيلات أو مجلد مزامنة معروف فقط"
                .to_string(),
        );
    }
    let target = canonical_parent.join(filename);
    if let Ok(metadata) = std::fs::symlink_metadata(&target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("وجهة الحفظ ليست ملفاً عادياً".to_string());
        }
    }
    Ok(target)
}

fn allowed_backup_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = [
        app.path().desktop_dir().ok(),
        app.path().document_dir().ok(),
        app.path().download_dir().ok(),
        detect_onedrive(),
        detect_gdrive(),
    ];
    let mut roots = Vec::new();
    for candidate in candidates.iter_mut().filter_map(Option::take) {
        if let Ok(canonical) = candidate.canonicalize() {
            if canonical.is_dir() && !roots.contains(&canonical) {
                roots.push(canonical);
            }
        }
    }
    roots
}

fn unique_sibling(path: &Path, tag: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "مجلد النسخة الاحتياطية غير صالح".to_string())?;
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("backup.bak");
    for _ in 0..1000 {
        let counter = TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{filename}.wartil-{tag}-{}-{counter}",
            std::process::id()
        ));
        match std::fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
            Ok(_) => continue,
            Err(_) => return Err("تعذر تجهيز ملف النسخة الاحتياطية المؤقت".to_string()),
        }
    }
    Err("تعذر اختيار اسم مؤقت للنسخة الاحتياطية".to_string())
}

fn write_temp_file(path: &Path, contents: &str) -> Result<(), String> {
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
            .map_err(|_| "تعذر إنشاء ملف النسخة الاحتياطية المؤقت".to_string())?;
        file.write_all(contents.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|_| "تعذر إكمال كتابة النسخة الاحتياطية".to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(path);
    }
    result
}

#[cfg(not(windows))]
fn install_temp_file(temp: &Path, target: &Path, overwrite: bool) -> Result<(), String> {
    if overwrite {
        return std::fs::rename(temp, target)
            .map_err(|_| "تعذر تثبيت النسخة الاحتياطية".to_string());
    }
    // hard_link يفشل إن سبقنا طرف آخر وأنشأ الهدف، بخلاف rename في Unix
    // الذي قد يستبدله رغم طلب create-new.
    std::fs::hard_link(temp, target).map_err(|_| "تعذر تثبيت النسخة الاحتياطية".to_string())?;
    std::fs::remove_file(temp).map_err(|_| "ثُبتت النسخة لكن تعذر تنظيف الملف المؤقت".to_string())
}

#[cfg(windows)]
fn install_temp_file(temp: &Path, target: &Path, overwrite: bool) -> Result<(), String> {
    if !overwrite || !target.exists() {
        return std::fs::rename(temp, target)
            .map_err(|_| "تعذر تثبيت النسخة الاحتياطية".to_string());
    }

    // rename في ويندوز لا يستبدل ملفاً موجوداً. ننقل الأصل أولاً إلى اسم
    // rollback في المجلد نفسه، ثم نثبت الجديد، ونستعيد الأصل إذا فشلت الخطوة.
    // بذلك لا نفتح الملف الأصلي بـ truncate ولا نفقده عند خطأ كتابة.
    let rollback = unique_sibling(target, "rollback")?;
    std::fs::rename(target, &rollback)
        .map_err(|_| "تعذر تجهيز الملف الحالي للاستبدال".to_string())?;
    match std::fs::rename(temp, target) {
        Ok(()) => {
            let _ = std::fs::remove_file(rollback);
            Ok(())
        }
        Err(_) => {
            let restored = std::fs::rename(&rollback, target).is_ok();
            let _ = std::fs::remove_file(temp);
            if restored {
                Err("تعذر تثبيت النسخة الجديدة؛ أُعيد الملف السابق".to_string())
            } else {
                Err(format!(
                    "تعذر الاستبدال والاستعادة؛ بقي الملف السابق باسم {}",
                    rollback.to_string_lossy()
                ))
            }
        }
    }
}

fn write_backup(path: &Path, contents: &str, overwrite: bool) -> Result<(), String> {
    let temp = unique_sibling(path, "new")?;
    write_temp_file(&temp, contents)?;
    let result = install_temp_file(&temp, path, overwrite);
    if result.is_err() {
        let _ = std::fs::remove_file(temp);
    }
    result
}

fn available_cloud_path(directory: &Path, filename: &str) -> Result<PathBuf, String> {
    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("backup");
    for suffix in 0..1000 {
        let candidate = if suffix == 0 {
            directory.join(filename)
        } else {
            directory.join(format!("{stem}-{suffix}.bak"))
        };
        match std::fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
            Ok(_) => continue,
            Err(_) => return Err("تعذر فحص وجهة النسخة الاحتياطية".to_string()),
        }
    }
    Err("تعذر اختيار اسم غير مستخدم للنسخة الاحتياطية".to_string())
}

#[tauri::command]
fn save_backup_to_cloud(
    provider: String,
    filename: String,
    contents: String,
) -> Result<String, String> {
    validate_backup_contents(&contents)?;
    validate_cloud_filename(&filename)?;
    let base = match provider.as_str() {
        "onedrive" => detect_onedrive(),
        "gdrive" => detect_gdrive(),
        _ => return Err("مزوّد سحابي غير معروف".to_string()),
    }
    .ok_or_else(|| "مجلد المزامنة السحابية غير متاح".to_string())?;
    let canonical_base = base
        .canonicalize()
        .map_err(|_| "تعذر حسم مجلد المزامنة".to_string())?;
    let directory = base.join("ورتل القرآن");
    std::fs::create_dir_all(&directory)
        .map_err(|_| "تعذر إنشاء مجلد النسخ الاحتياطية".to_string())?;
    let canonical_directory = directory
        .canonicalize()
        .map_err(|_| "تعذر حسم مجلد النسخ الاحتياطية".to_string())?;
    if !canonical_directory.starts_with(&canonical_base) {
        return Err("مجلد النسخ الاحتياطية خارج جذر المزامنة".to_string());
    }
    let path = available_cloud_path(&canonical_directory, &filename)?;
    write_backup(&path, &contents, false)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_backup_to_path(
    app: tauri::AppHandle,
    path: String,
    contents: String,
) -> Result<String, String> {
    validate_backup_contents(&contents)?;
    let roots = allowed_backup_roots(&app);
    let target = validate_selected_backup_path(Path::new(&path), &roots)?;
    write_backup(&target, &contents, true)?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let root = mushaf_root(app.handle())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            let store = MushafAssetStore::load(root)
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(store);
            Ok(())
        })
        .register_uri_scheme_protocol("mushaf", |context, request| {
            serve_mushaf(context.app_handle(), &request)
        })
        .invoke_handler(tauri::generate_handler![
            asset_base,
            cloud_targets,
            save_backup_to_cloud,
            save_backup_to_path
        ])
        .run(tauri::generate_context!())
        .expect("تعذر تشغيل ورتل القرآن");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expected_inventory_is_complete() {
        let paths: Vec<String> = expected_asset_paths().into_iter().collect();
        assert_eq!(paths.len(), 661);
        assert!(validate_inventory(&paths).is_ok());
    }

    #[test]
    fn inventory_rejects_empty_duplicate_and_traversal() {
        assert!(validate_inventory(&[]).is_err());
        let mut paths: Vec<String> = expected_asset_paths().into_iter().collect();
        paths[0] = paths[1].clone();
        assert!(validate_inventory(&paths).is_err());
        assert!(!safe_relative_path("../pages/001.json"));
        assert!(!safe_relative_path("pages\\001.json"));
    }

    #[test]
    fn tafsir_paths_are_closed() {
        assert!(is_allowed_tafsir_path("tafsir/sadi/1.json"));
        assert!(is_allowed_tafsir_path("tafsir/ibn-kathir/114.json"));
        assert!(is_allowed_tafsir_path("tafsir/asbab/2.json"));
        assert!(!is_allowed_tafsir_path("tafsir/sadi/0.json"));
        assert!(!is_allowed_tafsir_path("tafsir/other/1.json"));
        assert!(!is_allowed_tafsir_path("tafsir/sadi/../1.json"));
    }

    #[test]
    fn cloud_filename_rejects_path_components() {
        assert!(validate_cloud_filename("mushaf-backup-2026-08-14.bak").is_ok());
        assert!(validate_cloud_filename("../escape.bak").is_err());
        assert!(validate_cloud_filename("folder/escape.bak").is_err());
        assert!(validate_cloud_filename("backup.json").is_err());
    }

    #[test]
    fn installed_bundle_loads_into_an_immutable_snapshot() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets")
            .join("mushaf-qcf4");
        let store = MushafAssetStore::load(root).expect("installed bundle must validate");
        assert_eq!(store.files.len(), 662); // 661 inventory entries + manifest.json
    }

    #[test]
    fn backup_replacement_preserves_old_file_until_new_file_is_complete() {
        let directory = std::env::temp_dir().join(format!(
            "wartil-backup-test-{}-{}",
            std::process::id(),
            TEMP_FILE_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).expect("create isolated test directory");
        let target = directory.join("backup.bak");
        std::fs::write(&target, "old").expect("seed old backup");
        write_backup(&target, "new", true).expect("replace backup");
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "new");
        std::fs::remove_dir_all(directory).expect("clean isolated test directory");
    }
}
