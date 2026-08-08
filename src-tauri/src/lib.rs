//! ورتل القرآن — أوامر سطح المكتب الخلفية (Tauri).
//! بروتوكول mushaf:// مخصص يقدّم أصول المصحف من مجلد الموارد (بديل عن
//! بروتوكول asset المدمج الذي تعطّل بسبب بادئة \\?\ في مسار ويندوز)،
//! إضافة لأوامر اكتشاف مجلدات المزامنة السحابية وحفظ النسخة الاحتياطية
//! فيها (خدمة السحابة ترفعها تلقائياً — بلا OAuth وبلا اتصال من التطبيق).
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudTarget {
    provider: &'static str,
    label: &'static str,
    folder: String,
}

/// إزالة بادئة \\?\ التي يلحقها ويندوز بمسار الملف التنفيذي —
/// تسريبها إلى رابط البروتوكول كان يعطّل تحليل المسار (os error 123)
fn strip_verbatim(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p.to_path_buf(),
    }
}

/// جذر أصول المصحف: <موارد الحزمة>/assets/mushaf-qcf4
fn mushaf_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    Ok(strip_verbatim(&dir).join("assets").join("mushaf-qcf4"))
}

/// مجلد موارد الحزمة بصيغة نظيفة — تُبنى عليه روابط mushaf://
#[tauri::command]
fn asset_base(app: tauri::AppHandle) -> Result<String, String> {
    Ok(mushaf_root(&app)?.to_string_lossy().into_owned())
}

/// نوع المحتوى حسب الامتداد (خطوط WOFF2/TTF وJSON وMarkdown)
fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("json") => "application/json; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("md") => "text/markdown; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// معالج بروتوكول mushaf:// — فك الترميز والتحقق وفتح الملف تحت سيطرتنا،
/// ورسائل الخطأ تحمل المسار الفعلي عند أي فشل (تشخيص مباشر من الشاشة)
fn serve_mushaf(
    app: &tauri::AppHandle,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    use percent_encoding::percent_decode;

    let fail = |status: u16, msg: String| -> tauri::http::Response<Vec<u8>> {
        tauri::http::Response::builder()
            .status(status)
            .header("Content-Type", "text/plain; charset=utf-8")
            .header("Access-Control-Allow-Origin", "*")
            .body(msg.into_bytes())
            .unwrap()
    };

    let raw = match request.uri().path().strip_prefix('/') {
        Some(r) if !r.is_empty() => r,
        _ => return fail(400, "مسار فارغ".into()),
    };
    let decoded = percent_decode(raw.as_bytes()).decode_utf8_lossy().to_string();
    // حارس: لا خروج عن الجذر بأي شكل
    if decoded.split(['\\', '/']).any(|seg| seg == "..") {
        return fail(403, format!("مسار ممنوع: {decoded}"));
    }
    let path = PathBuf::from(&decoded);
    let root = match mushaf_root(app) {
        Ok(r) => r,
        Err(e) => return fail(500, format!("تعذر حسم جذر الموارد: {e}")),
    };
    if !path.starts_with(&root) {
        return fail(403, format!("خارج جذر الأصول: {decoded}"));
    }
    match std::fs::read(&path) {
        Ok(bytes) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime_for(&path))
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-store")
            .body(bytes)
            .unwrap(),
        Err(e) => fail(500, format!("فشل فتح الملف [{decoded}]: {e}")),
    }
}

/// مجلد OneDrive المتزامن — من متغيرات البيئة التي تضبطها خدمة OneDrive
fn detect_onedrive() -> Option<PathBuf> {
    for var in ["OneDriveConsumer", "OneDrive", "OneDriveCommercial"] {
        if let Ok(p) = std::env::var(var) {
            let pb = PathBuf::from(p);
            if pb.is_dir() {
                return Some(pb);
            }
        }
    }
    None
}

/// Google Drive لسطح المكتب يركّب قرصاً (G: غالباً) فيه مجلد «My Drive»
fn detect_gdrive() -> Option<PathBuf> {
    for letter in b'D'..=b'Z' {
        let candidate = PathBuf::from(format!("{}:\\My Drive", letter as char));
        if candidate.is_dir() {
            return Some(candidate);
        }
    }
    None
}

/// المجلدات السحابية المتوفرة على هذا الجهاز
#[tauri::command]
fn cloud_targets() -> Vec<CloudTarget> {
    let mut out = Vec::new();
    if let Some(p) = detect_onedrive() {
        out.push(CloudTarget {
            provider: "onedrive",
            label: "OneDrive",
            folder: p.to_string_lossy().into_owned(),
        });
    }
    if let Some(p) = detect_gdrive() {
        out.push(CloudTarget {
            provider: "gdrive",
            label: "Google Drive",
            folder: p.to_string_lossy().into_owned(),
        });
    }
    out
}

/// حفظ النسخة الاحتياطية داخل مجلد المزامنة (في مجلد فرعي باسم التطبيق) —
/// خدمة السحابة ترفعها تلقائياً، فيستعيدها المستخدم على أي جهاز آخر
#[tauri::command]
fn save_backup_to_cloud(provider: String, filename: String, contents: String) -> Result<String, String> {
    let base = match provider.as_str() {
        "onedrive" => detect_onedrive(),
        "gdrive" => detect_gdrive(),
        _ => None,
    }
    .ok_or_else(|| match provider.as_str() {
        "onedrive" => "OneDrive غير مُفعّل على هذا الجهاز — ثبّته وسجّل الدخول فيه أولاً".to_string(),
        "gdrive" => "Google Drive لسطح المكتب غير مثبّت على هذا الجهاز — ثبّته من drive.google.com/drive/download وأعد المحاولة".to_string(),
        _ => "مزوّد سحابي غير معروف".to_string(),
    })?;
    let dir = base.join("ورتل القرآن");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// حفظ النسخة الاحتياطية في مسار يختاره المستخدم (عبر حوار «حفظ باسم»
/// الأصلي — ملحق dialog يمنح الإذن، وهذا الأمر يكتب حيث قرر المستخدم)
#[tauri::command]
fn save_backup_to_path(path: String, contents: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, contents).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("mushaf", |ctx, request| {
            serve_mushaf(ctx.app_handle(), &request)
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
