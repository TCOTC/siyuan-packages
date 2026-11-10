#!/usr/bin/env bash
#
# 构建并发布「检测阶段挑出来的包」。
#
# 由 .github/workflows/publish.yml 在 ubuntu-latest 上调用；本地也能跑（Git bash / WSL / macOS），
# 用于验证构建与 zip 结构，不必等 CI。单独成文件的原因：这段逻辑有 130 多行，
# 塞在 YAML 里既没法 lint 也没法直接执行。
#
# 环境变量（都由 workflow 注入，脚本本身不读任何仓库配置）：
#   PACKAGES            待发包清单，每行四列，制表符分隔：包目录 \t 名称 \t 版本 \t 目标仓库
#   EVENT               push | workflow_dispatch；只有 dispatch 才认下面的两个布尔值
#   INPUT_DRY_RUN       dispatch 下为 true 时只构建与校验，不调 gh
#   INPUT_FORCE         dispatch 下为 true 时允许覆盖目标仓库已存在的同版本 release
#   GH_TOKEN            跨仓库写用（workflow 里注入 PUBLISH_TOKEN）
#   GITHUB_STEP_SUMMARY 失败清单写这里；本地不存在时跳过
#
# 本地试跑（不创建任何 release）：
#   PACKAGES=$'plugins/move-doc\tmove-doc\t1.0.2\tTCOTC/move-doc' \
#   EVENT=workflow_dispatch INPUT_DRY_RUN=true bash .github/scripts/publish.sh
#
# 为什么是 bash 而不是 Node：这段逻辑已经在本仓 CI 上实跑验证过，重写成 Node
# 等于把三个已修好的坑（SIGPIPE / set -u unbound / mapfile）重新引入一遍。

set -uo pipefail

DRY_RUN="false"
if [ "$EVENT" = "workflow_dispatch" ] && [ "${INPUT_DRY_RUN:-}" = "true" ]; then
  DRY_RUN="true"
fi

FORCE="false"
if [ "$EVENT" = "workflow_dispatch" ] && [ "${INPUT_FORCE:-}" = "true" ]; then
  FORCE="true"
fi

if [ "$DRY_RUN" != "true" ] && [ -z "${GH_TOKEN:-}" ]; then
  echo "::error::缺少 PUBLISH_TOKEN secret（fine-grained PAT，contents: write）"
  exit 1
fi

published=0
failed=()

# 用数组而不是 while read：构建工具偶尔读 stdin，会把还没读的清单吞掉（漏包很难发现）
mapfile -t LINES <<< "${PACKAGES:-}"

for line in "${LINES[@]}"; do
  IFS=$'\t' read -r DIR NAME VERSION TARGET <<< "$line"
  if [ -z "${DIR:-}" ]; then
    continue
  fi
  echo "::group::${NAME} ${VERSION} → ${TARGET}"

  if ! pnpm --dir "$DIR" build; then
    echo "::error::${NAME} 构建失败"
    failed+=("${NAME}: 构建失败")
    echo "::endgroup::"
    continue
  fi

  ZIP="dist/${NAME}.zip"
  if [ ! -f "$ZIP" ]; then
    echo "::error::没有产出 $ZIP"
    failed+=("${NAME}: 没有产出 zip")
    echo "::endgroup::"
    continue
  fi

  # 集市要求清单在 zip 根目录（不能多一层包装目录）。
  # 用 case 匹配而不是 `grep -m1`：grep 命中后提前退出会让上游吃 SIGPIPE，
  # 在 pipefail 下整条管道会被判成失败（同一类坑见下面的 ASSETS 检查）。
  ENTRIES=$(unzip -Z1 "$ZIP")
  ARTIFACT=""
  while IFS= read -r entry; do
    case "$entry" in
      plugin.json | theme.json | widget.json)
        ARTIFACT="$entry"
        break
        ;;
    esac
  done <<< "$ENTRIES"
  if [ -z "$ARTIFACT" ]; then
    echo "::error::zip 根目录缺少清单文件"
    printf '%s\n' "$ENTRIES"
    failed+=("${NAME}: zip 根目录缺清单")
    echo "::endgroup::"
    continue
  fi

  # 检测阶段读的是合成清单，这里核对产物里那一份，防「检测与构建不是同一棵树」
  BUILT_VERSION=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(m.version))' "dist/${NAME}/${ARTIFACT}")
  if [ "$BUILT_VERSION" != "$VERSION" ]; then
    echo "::error::产物清单 version 是 ${BUILT_VERSION}，与检测到的 ${VERSION} 不一致"
    failed+=("${NAME}: 版本不一致")
    echo "::endgroup::"
    continue
  fi

  if [ "$DRY_RUN" = "true" ]; then
    echo "dry-run：跳过创建 release（将发布 v${VERSION} 到 ${TARGET}）"
    published=$((published + 1))
    echo "::endgroup::"
    continue
  fi

  TAG="v${VERSION}"
  cp "$ZIP" package.zip

  if gh release view "$TAG" --repo "$TARGET" > /dev/null 2>&1; then
    # 集市要求 version 单调递增；同版本覆盖会让已安装用户收不到更新
    if [ "$FORCE" != "true" ]; then
      echo "::error::${TARGET} 已存在 ${TAG}，请先抬清单 version 再发（或手动指定 force）"
      failed+=("${NAME}: ${TAG} 已存在")
      echo "::endgroup::"
      continue
    fi
    echo "${TARGET} 已有 ${TAG}，force 覆盖资产"
    if ! gh release upload "$TAG" package.zip --repo "$TARGET" --clobber; then
      echo "::error::${NAME} 覆盖资产失败"
      failed+=("${NAME}: 覆盖资产失败")
      echo "::endgroup::"
      continue
    fi
  elif ! gh release create "$TAG" package.zip --repo "$TARGET" --title "$TAG" --generate-notes; then
    # 注意：不要加 --prerelease，集市只读 /releases/latest
    echo "::error::${NAME} 创建 release 失败"
    failed+=("${NAME}: 创建 release 失败")
    echo "::endgroup::"
    continue
  fi

  # 集市按资产名找 package.zip，名字错了等于没发。
  # 先落到变量再 grep：`gh ... | grep -qx` 的提前退出会让 gh 吃 SIGPIPE，
  # 在 pipefail 下整条管道会被判成失败。
  ASSETS=$(gh release view "$TAG" --repo "$TARGET" --json assets --jq '.assets[].name')
  if ! grep -qx 'package.zip' <<< "$ASSETS"; then
    echo "::error::${TARGET} 的 ${TAG} 里没有 package.zip 资产"
    failed+=("${NAME}: 缺 package.zip 资产")
    echo "::endgroup::"
    continue
  fi

  echo "已发布 ${TARGET}@${TAG}"
  published=$((published + 1))
  echo "::endgroup::"
done

echo "成功 ${published} 个，失败 ${#failed[@]} 个"
if [ ${#failed[@]} -gt 0 ]; then
  # $GITHUB_STEP_SUMMARY 在本地跑时不存在，`set -u` 下直接展开会中止脚本
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "## 发布失败的包"
      echo
      printf -- '- %s\n' "${failed[@]}"
    } >> "$GITHUB_STEP_SUMMARY"
  fi
  printf '%s\n' "${failed[@]}"
  exit 1
fi
