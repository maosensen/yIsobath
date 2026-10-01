# Release card — yIsobath

<!-- 由 yDesktopTemplate v0.2.0 的发版卡改写,2026-10-01;发版流程见 user 级 release skill,本卡只记录项目特异性事实。 -->

## 版本文件(bump 时全部同步)

- `package.json`
- `src-tauri/tauri.conf.json`  <!-- 发布版本以它为准 -->
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`(`yisobath` 条目)

**首次发版**:四处现在都是 `0.1.0`、仓库里还没有 tag。第一次发版就发 `v0.1.0`,不再 bump。

## 门禁

- `pnpm check`(typecheck + biome + vitest + bindings 漂移 + rustfmt + clippy)
  - bindings.ts 是生成物:变更属正常,重新生成随功能 commit,不手改
- 再跑一次 `pnpm build`(CI 也跑,确保前端打包没坏)
- smoke:`cargo run --release --example survey -- <某个文件夹>` 能走完并打印折叠结果

## CHANGELOG

- `CHANGELOG.md`,Keep a Changelog,英文
- 应用内 What's New:`src/lib/changelog/en.ts`(单语,英文;release 带 title/summary,change 带 kind/title/text,text 不以标题开头)。建账时为空数组,首次发版时补第一条

## 发布渠道

- 渠道:A(tag `v*` 触发 `.github/workflows/release.yml`,四平台矩阵 → draft Release)
- **CI 只建空 draft,不填 body**:发布前用 `gh release edit vX.Y.Z --notes-file <(CHANGELOG 对应小节)` 填入
- 产物期望数:未实测。模板 v0.2.0 在更新链未启用时是 9 个(macOS dmg ×2 + app.tar.gz ×2 + Windows msi/setup.exe + Linux deb/rpm/AppImage),启用更新链后按 yAssets 的 17 口径(含 .sig 与 latest.json)。第一次发版后把实测值写回这里

## 首次发版前要做的(都要用户本人操作密钥 / secrets,不经 agent 之手)

1. **GitHub 仓库**:✅ 已建好并 push(2026-10-01),**公开**。必须保持公开:更新 endpoint 是 `releases/latest/download/latest.json`,私有仓库对未认证请求一律 404,装出去的 app 就收不到更新。
2. **自更新**:`pnpm tauri signer generate -w ~/.tauri/yisobath.key`(带密码)→ 把公钥填进 `tauri.conf.json` 的 `plugins.updater.pubkey`(endpoint 已填 `maosensen/yIsobath`)→ `bundle.createUpdaterArtifacts` 改为 `true` → repo secrets 配 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。私钥和密码永不入库;丢了任一,已发出去的版本永远收不到更新。
3. **Apple 签名 + 公证**:照 yAssets 的 release.yml(第 112–123 行)把 `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` 的注释打开,并在 repo secrets 里配上(与 yAssets 同一个 Developer ID)。
   **这一条对 yIsobath 比对别的 app 更重要**:macOS 的「完全磁盘访问权限」按签名身份记。Developer ID 签名不变,更新后权限还在;未签名 / ad-hoc 签名的包每次更新都要重新去系统设置里授权。

## 本项目特有注意事项

- bundle identifier `com.maosensen.yisobath`,productName `yIsobath`,Cargo crate `yisobath`(lib `yisobath_lib`),dev 端口 4387(HMR 4388)。
- 日志在 `~/Library/Logs/com.maosensen.yisobath/yIsobath.log`;dev 构建里 `YISOBATH_PERF=1` 会每 5 秒写一条帧时间。
