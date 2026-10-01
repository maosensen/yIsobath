# Release card — yDesktopTemplate

<!-- 由 release skill 生成于 2026-07-10;发版流程见 user 级 release skill,本卡只记录项目特异性事实。 -->

## 版本文件(bump 时全部同步)

- `package.json`
- `src-tauri/tauri.conf.json`  <!-- 发布版本以它为准 -->
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`(`ydesktoptemplate` 条目)

## 门禁

- `pnpm check`(typecheck + biome + vitest + bindings 漂移 + rustfmt + clippy)
  - bindings.ts 是生成物:变更属正常,重新生成随功能 commit,不手改
- smoke:—(门禁已含双端测试)

## CHANGELOG

- `CHANGELOG.md`,Keep a Changelog,英文
- 应用内 What's New:`src/lib/changelog/en.ts`(单语,英文;release 带 title/summary,change 带 kind/title/text,text 不以标题开头)

## 发布渠道

- 渠道:A(tag `v*` 触发 `.github/workflows/release.yml`,四平台矩阵 → draft Release)
- **CI 只建空 draft,不填 body**:发布前用 `gh release edit vX.Y.Z --notes-file <(CHANGELOG 对应小节)` 填入
- 产物期望数:9(macOS dmg ×2 + app.tar.gz ×2 + Windows msi/setup.exe + Linux deb/rpm/AppImage;2026-07-10 v0.1.0 实测。更新链未启用故无 .sig / latest.json;启用后改用 17 口径)
- 发布后验证:资产数与本卡一致
- 2026-10 起 release.yml 用 `tauri-apps/tauri-action@v1`:macOS 的 `.app.tar.gz`(及启用更新链后的 `.sig`)文件名带版本号,与其余安装包一致。v0.2.0(2026-10-01)实测:资产数仍为 9,全部以 `yDesktopTemplate` 开头(如 `yDesktopTemplate_0.2.0_aarch64.app.tar.gz`、`yDesktopTemplate-0.2.0-1.x86_64.rpm`);tauri-action v1 未改动 create-release 建的 Release 名(`yDesktopTemplate vX.Y.Z`)与空 body

## 本项目特有注意事项

- **自更新链未启用**:`bundle.createUpdaterArtifacts: false`,`plugins.updater` 的 pubkey/endpoints 为占位符。克隆出新项目启用时:`pnpm tauri signer generate` 生成密钥 → 填 pubkey/endpoints → `createUpdaterArtifacts` 改回 `true` → 配 repo secrets(`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)→ 本卡产物期望数改回 17 口径(含 .sig 与 latest.json)。
- bundle identifier 已独立为 `com.maosensen.ydesktoptemplate`(2026-10-01;此前与已安装的 yAssets.app 共用 `com.maosensen.yassets`,会被 single-instance 互相拦截、共用数据目录)。2026-10-01 起其余命名也已对齐仓库:productName `yDesktopTemplate`、package name `ydesktoptemplate`、Cargo crate `ydesktoptemplate`(lib `ydesktoptemplate_lib`),安装包文件名随之变为 `yDesktopTemplate_*`。克隆成新项目后这几处连同 identifier 都要换成新项目自己的。
