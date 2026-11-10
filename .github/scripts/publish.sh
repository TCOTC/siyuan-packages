#!/usr/bin/env bash
#
# 构建并发布「检测阶段挑出来的包」，并把结果写成一张汇总表。
#
# 由 .github/workflows/publish.yml 在 ubuntu-latest 上调用；本地也能跑（Git bash / WSL / macOS），
# 用于验证构建与 zip 结构，不必等 CI。单独成文件的原因：这段逻辑有一百多行，
# 塞在 YAML 里既没法 lint 也没法直接执行。
#
# 环境变量（都由 workflow 注入，脚本本身不读任何仓库配置）：
#   PACKAGES            待发包清单，每行六列，制表符分隔：
#                       包目录 \t 包名 \t 版本 \t 目标仓库 \t 类型 \t 上一个版本（新包为空）
#   EVENT               push | workflow_dispatch；只有 dispatch 才认下面的两个布尔值
#   INPUT_DRY_RUN       dispatch 下为 true 时只构建与校验，不调 gh
#   INPUT_FORCE         dispatch 下为 true 时允许覆盖目标仓库已存在的同版本 release
#   GH_TOKEN            跨仓库写用（workflow 里注入 PUBLISH_TOKEN）
#   GITHUB_STEP_SUMMARY 汇总表写这里；本地跑时不存在，改为打到 stdout
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
rows=()

# 集市按资产名 package.zip 找包，所以上传前要改名。
# 用临时目录而不是仓库根：本地跑一遍就会在仓库里留一个 700KB 的垃圾文件，
# `git add -A` 很容易把它带进提交。
asset_dir=$(mktemp -d)
trap 'rm -rf "$asset_dir"' EXIT

# 汇总表的一行：类型 | 包名 | 前一个版本 | 当前发布版本 | Release
# 参数是 Release 单元格；其余取循环里的当前包。
add_row() {
  rows+=("| ${kind} | ${name} | ${previous} | ${version} | $1 |")
}

release_url() {
  echo "https://github.com/${target}/releases/tag/v${version}"
}

# 用数组而不是 while read：构建工具偶尔读 stdin，会把还没读的清单吞掉（漏包很难发现）
mapfile -t LINES <<< "${PACKAGES:-}"

for line in "${LINES[@]}"; do
  IFS=$'\t' read -r dir name version target kind previous <<< "$line"
  if [ -z "${dir:-}" ]; then
    continue
  fi
  # 新包在基准里没有清单，检测阶段给的是空字符串
  if [ -z "${previous}" ]; then
    previous="—（新包）"
  fi
  echo "::group::${name} ${version} → ${target}"

  if ! pnpm --dir "$dir" build; then
    echo "::error::${name} 构建失败"
    failed+=("${name}: 构建失败")
    add_row "❌ 构建失败"
    echo "::endgroup::"
    continue
  fi

  zip="dist/${name}.zip"
  if [ ! -f "$zip" ]; then
    echo "::error::没有产出 $zip"
    failed+=("${name}: 没有产出 zip")
    add_row "❌ 没有产出 zip"
    echo "::endgroup::"
    continue
  fi

  # 集市要求清单在 zip 根目录（不能多一层包装目录）。
  # 用 case 匹配而不是 `grep -m1`：grep 命中后提前退出会让上游吃 SIGPIPE，
  # 在 pipefail 下整条管道会被判成失败（同一类坑见下面的 assets 检查）。
  entries=$(unzip -Z1 "$zip")
  artifact=""
  while IFS= read -r entry; do
    case "$entry" in
      plugin.json | theme.json | widget.json)
        artifact="$entry"
        break
        ;;
    esac
  done <<< "$entries"
  if [ -z "$artifact" ]; then
    echo "::error::zip 根目录缺少清单文件"
    printf '%s\n' "$entries"
    failed+=("${name}: zip 根目录缺清单")
    add_row "❌ zip 根目录缺清单"
    echo "::endgroup::"
    continue
  fi

  # 检测阶段读的是合成清单，这里核对产物里那一份，防「检测与构建不是同一棵树」
  built_version=$(node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(m.version))' "dist/${name}/${artifact}")
  if [ "$built_version" != "$version" ]; then
    echo "::error::产物清单 version 是 ${built_version}，与检测到的 ${version} 不一致"
    failed+=("${name}: 版本不一致")
    add_row "❌ 产物版本是 ${built_version}"
    echo "::endgroup::"
    continue
  fi

  if [ "$DRY_RUN" = "true" ]; then
    echo "dry-run：跳过创建 release（将发布 v${version} 到 ${target}）"
    published=$((published + 1))
    add_row "—（dry-run，未创建）"
    echo "::endgroup::"
    continue
  fi

  tag="v${version}"
  cp "$zip" "$asset_dir/package.zip"

  if gh release view "$tag" --repo "$target" > /dev/null 2>&1; then
    # 集市要求 version 单调递增；同版本覆盖会让已安装用户收不到更新
    if [ "$FORCE" != "true" ]; then
      echo "::error::${target} 已存在 ${tag}，请先抬清单 version 再发（或手动指定 force）"
      failed+=("${name}: ${tag} 已存在")
      add_row "❌ ${tag} 已存在"
      echo "::endgroup::"
      continue
    fi
    echo "${target} 已有 ${tag}，force 覆盖资产"
    if ! gh release upload "$tag" "$asset_dir/package.zip" --repo "$target" --clobber; then
      echo "::error::${name} 覆盖资产失败"
      failed+=("${name}: 覆盖资产失败")
      add_row "❌ 覆盖资产失败"
      echo "::endgroup::"
      continue
    fi
  elif ! gh release create "$tag" "$asset_dir/package.zip" --repo "$target" --title "$tag" --generate-notes; then
    # 注意：不要加 --prerelease，集市只读 /releases/latest
    echo "::error::${name} 创建 release 失败"
    failed+=("${name}: 创建 release 失败")
    add_row "❌ 创建 release 失败"
    echo "::endgroup::"
    continue
  fi

  # 集市按资产名找 package.zip，名字错了等于没发。
  # 先落到变量再 grep：`gh ... | grep -qx` 的提前退出会让 gh 吃 SIGPIPE，
  # 在 pipefail 下整条管道会被判成失败。
  assets=$(gh release view "$tag" --repo "$target" --json assets --jq '.assets[].name')
  if ! grep -qx 'package.zip' <<< "$assets"; then
    echo "::error::${target} 的 ${tag} 里没有 package.zip 资产"
    failed+=("${name}: 缺 package.zip 资产")
    add_row "❌ 缺 package.zip 资产"
    echo "::endgroup::"
    continue
  fi

  echo "已发布 ${target}@${tag}"
  echo "release: $(release_url)"
  published=$((published + 1))
  add_row "[${tag}]($(release_url))"
  echo "::endgroup::"
done

# ── 汇总表 ───────────────────────────────────────────────────────────────────
# Release 链接只有发布后才知道，所以表格只能在这里生成，不能放在检测步骤。
# 前面空一行：summary 上半部分是检测阶段写的「基准 / 跳过」，紧贴表格会让
# Markdown 把表格当成段落延续。
summary=$'\n| 类型 | 包名 | 前一个版本 | 当前发布版本 | Release |\n| --- | --- | --- | --- | --- |'
for row in "${rows[@]}"; do
  summary+=$'\n'"$row"
done

echo "成功 ${published} 个，失败 ${#failed[@]} 个"
if [ ${#failed[@]} -gt 0 ]; then
  summary+=$'\n\n**失败：**'"${failed[*]}"
fi

# $GITHUB_STEP_SUMMARY 在本地跑时不存在，`set -u` 下直接展开会中止脚本
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf '%s\n' "$summary" >> "$GITHUB_STEP_SUMMARY"
fi
# 同一份也打到日志：summary 页面只有打开运行详情才看得到，排查时更需要日志里有
printf '%s\n' "$summary"

if [ ${#failed[@]} -gt 0 ]; then
  printf '%s\n' "${failed[@]}"
  exit 1
fi
