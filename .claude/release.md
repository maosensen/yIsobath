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
- 产物期望数:**17**(2026-10-01 以 v0.1.0 实测)——macOS 2 架构 ×(dmg 无 sig + app.tar.gz + .sig)= 6;Windows msi/.sig + setup.exe/.sig = 4;Linux deb/rpm/AppImage 各带 .sig = 6;latest.json = 1
- **发布前必验 `latest.json`**:`gh release download vX.Y.Z --repo maosensen/yIsobath -p latest.json -D <tmp>`,`platforms` **必须 11 个**、每个有 `signature`。四个 job 都对这一个文件「读—改—写」,资产数达标不等于平台齐(yAssets v0.1.37 实测缺过 darwin-aarch64)。
- `latest.json` 里的 url 是 API 资产地址(`api.github.com/repos/…/releases/assets/<id>`),不是 yAssets 那种 `releases/latest/download/…`:这是 tauri-action **v1** 的固定写法。updater 下载时带 `Accept: application/octet-stream`(tauri-plugin-updater `updater.rs`),公开仓库未认证可下;发布后用 `curl -sIL -H "Accept: application/octet-stream" <url>` 验 200 + 体积与 `.app.tar.gz` 一致
- macOS 公证的是 `.app`(已装订票据),dmg 本身只签名不公证——`spctl` 判 dmg 为 `Unnotarized Developer ID` 属预期;验的是挂载后的 `yIsobath.app`:`xcrun stapler validate` + `spctl -a -vv -t exec` → `Notarized Developer ID`
- 发布后验证:`curl -sL https://github.com/maosensen/yIsobath/releases/latest/download/latest.json` → version 正确、11 个平台、每个有 signature(draft 阶段 404 属预期)
- 平台 job 失败时用 `gh run rerun <run-id> --failed` 只重跑失败的:同一个 tag、同一个 draft,成功 job 的产物保留;重跑读取**当时**的 secrets,改完 secret 直接重跑,不用删 tag

## 首次发版前要做的(都要用户本人操作密钥 / secrets,不经 agent 之手)

1. **GitHub 仓库**:✅ 已建好并 push(2026-10-01),**公开**。必须保持公开:更新 endpoint 是 `releases/latest/download/latest.json`,私有仓库对未认证请求一律 404,装出去的 app 就收不到更新。
2. **自更新**:✅ 密钥对已生成(2026-10-01,私钥 `~/.tauri/yisobath.key`,带密码),公钥已填进 `tauri.conf.json` 的 `plugins.updater.pubkey`,`bundle.createUpdaterArtifacts` 已是 `true`。
   repo secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ✅ 已配(2026-10-01,用户本人操作)。发版前用 `gh secret list --repo maosensen/yIsobath` 确认两个都在,缺了 release.yml 会在打包签名那步失败。私钥和密码永不入库;丢了任一,已发出去的版本永远收不到更新。
   本地 `pnpm tauri build` 从此也要先 export 这两个变量,否则同样失败(`pnpm tauri dev` 不受影响)。
3. **Apple 签名 + 公证**:✅ release.yml 里六个 `APPLE_*` 已打开,repo secrets 已配(2026-10-01,用户本人操作;与 yAssets 同一个
   Developer ID:`Developer ID Application: YANG JIAKAI (D567A6PTG2)`)。证书是钥匙串导出的 `.p12`(base64),`APPLE_PASSWORD`
   是 App 专用密码。设 `APPLE_CERTIFICATE` 时管道前面先 `test -s <p12>`:文件不在时 `base64 … | gh secret set` 照样会写进一个空值。
   **打 tag 前先验公证凭证**(用户已在登录钥匙串存了 profile `yisobath-notary`,agent 可直接跑,看不到密码):
   `xcrun notarytool history --keychain-profile yisobath-notary` → 列出历史即可发版。403 `A required agreement is missing or has expired`
   = Apple 更新了开发者计划许可协议,账号持有人到 developer.apple.com/account 点「查看协议」接受(只能用户本人点),yAssets 同样受影响;
   401 = Apple ID / App 专用密码不对(专用密码改 Apple ID 主密码时会全部作废)。v0.1.0 首发三处踩坑,都在 CI 里才暴露:
   ① 本机有两个 8/17 导出的旧 `.p12`,记下的密码两个都打不开(CI 报 `MAC verification failed during PKCS12 import`)→ 从钥匙串重新导出
   `~/Desktop/yisobath-developer-id.p12`,密码进密码管理器,先 `/usr/bin/openssl pkcs12 -in <p12> -nokeys | grep subject` 本地验过再传;
   ② 粘贴进 `gh secret set` 的值有误(401);③ 协议恰好在 10/1 前后更新(403)。
   **这一条对 yIsobath 比对别的 app 更重要**:macOS 的「完全磁盘访问权限」按签名身份记。Developer ID 签名不变,更新后权限还在;未签名 / ad-hoc 签名的包每次更新都要重新去系统设置里授权。

## 本项目特有注意事项

- bundle identifier `com.maosensen.yisobath`,productName `yIsobath`,Cargo crate `yisobath`(lib `yisobath_lib`),dev 端口 4377(HMR 4378;矩阵端口登记见 yPulse `docs/site-topology.md`)。
- 日志在 `~/Library/Logs/com.maosensen.yisobath/yIsobath.log`;dev 构建里 `YISOBATH_PERF=1` 会每 5 秒写一条帧时间。
