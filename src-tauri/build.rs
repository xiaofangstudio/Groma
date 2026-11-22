fn main() {
    // 图标或配置变化时强制重跑，避免 EXE 资源图标停留在旧标
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
