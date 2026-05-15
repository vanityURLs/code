#!/usr/bin/env zsh

# Source this file from ~/.zshrc:
#   source /path/to/dicai-re/scripts/v8s.zsh
#
# The registry defaults to ~/.v8s.json. Override with:
#   export V8S_REGISTRY=/path/to/v8s.json
#
# v8s only opens targets that already exist in the generated registry. It does
# not accept arbitrary URLs from the terminal.

v8s() {
  emulate -L zsh
  setopt pipefail

  local registry="${V8S_REGISTRY:-$HOME/.v8s.json}"
  local command="${1:-}"

  case "$command" in
    ""|-h|--help)
      _v8s_usage
      if [[ -n "$command" ]]; then
        return 0
      fi
      return 1
      ;;
    -l|--list)
      _v8s_require_registry "$registry" || return $?
      _v8s_list "$registry"
      return $?
      ;;
    -p|--print)
      shift
      _v8s_open_or_print "$registry" "${1:-}" "print"
      return $?
      ;;
    --path)
      print -r -- "$registry"
      return 0
      ;;
    --*)
      print -u2 "v8s: unknown option: $command"
      _v8s_usage
      return 2
      ;;
  esac

  _v8s_open_or_print "$registry" "$command" "open"
}

_v8s_usage() {
  cat <<'EOF'
Usage:
  v8s <slug>          Open a redirect target from ~/.v8s.json
  v8s --print <slug>  Print the target without opening it
  v8s --list          List active redirect slugs
  v8s --path          Print the registry path

Notes:
  - Slugs are exact matches from links[] in the generated registry.
  - Only permanent and ephemeral links are opened.
  - Only http:// and https:// targets are opened by default.
EOF
}

_v8s_require_registry() {
  local registry="$1"

  if ! command -v jq >/dev/null 2>&1; then
    print -u2 "v8s: jq is required. Install jq and try again."
    return 127
  fi

  if [[ ! -f "$registry" ]]; then
    print -u2 "v8s: registry not found: $registry"
    print -u2 "v8s: run npm run build from the VanityURLs repo to create it."
    return 1
  fi
}

_v8s_list() {
  local registry="$1"

  jq -r '
    .links[]
    | select((.state // "permanent") as $state | $state == "permanent" or $state == "ephemeral")
    | [.slug, .title, .target]
    | @tsv
  ' "$registry" | sort | awk -F '\t' '
    BEGIN { printf "%-32s  %-28s  %s\n", "Slug", "Title", "Target" }
    { printf "%-32s  %-28s  %s\n", $1, $2, $3 }
  '
}

_v8s_open_or_print() {
  local registry="$1"
  local raw_slug="$2"
  local mode="$3"

  _v8s_require_registry "$registry" || return $?

  local slug
  slug="$(_v8s_normalize_slug "$raw_slug")" || return $?

  if [[ -z "$slug" ]]; then
    print -u2 "v8s: slug is required"
    _v8s_usage
    return 2
  fi

  if ! _v8s_validate_slug "$slug"; then
    return 2
  fi

  local row target state title
  row="$(
    jq -r --arg slug "$slug" '
      .links[]
      | select(.slug == $slug)
      | [(.target // ""), (.state // "permanent"), (.title // .slug)]
      | @tsv
    ' "$registry" | head -n 1
  )"

  if [[ -z "$row" ]]; then
    print -u2 "v8s: slug not found: $slug"
    return 1
  fi

  target="${row%%$'\t'*}"
  row="${row#*$'\t'}"
  state="${row%%$'\t'*}"
  title="${row#*$'\t'}"

  if [[ "$state" != "permanent" && "$state" != "ephemeral" ]]; then
    print -u2 "v8s: '$slug' is not active for redirecting (state: $state)"
    return 1
  fi

  if ! _v8s_validate_target "$target"; then
    return 2
  fi

  if [[ "$mode" == "print" ]]; then
    print -r -- "$target"
    return 0
  fi

  print -r -- "Opening $slug -> $target"
  _v8s_open_url "$target"
}

_v8s_normalize_slug() {
  local slug="${1:-}"

  slug="${slug#"${slug%%[![:space:]]*}"}"
  slug="${slug%"${slug##*[![:space:]]}"}"
  slug="${slug#http://}"
  slug="${slug#https://}"
  slug="${slug#dicai.re/}"
  slug="${slug#www.dicai.re/}"
  slug="${slug#/}"
  slug="${slug%/}"

  print -r -- "$slug"
}

_v8s_validate_slug() {
  local slug="$1"

  if [[ "$slug" == *$'\0'* || "$slug" == *$'\n'* || "$slug" == *$'\r'* ]]; then
    print -u2 "v8s: invalid slug: control characters are not allowed"
    return 1
  fi

  if [[ "$slug" == *"://"* || "$slug" == -* || "$slug" == *".."* || "$slug" == *"\\"* ]]; then
    print -u2 "v8s: invalid slug: $slug"
    return 1
  fi

  if [[ ! "$slug" =~ '^[A-Za-z0-9][A-Za-z0-9._~/-]{0,98}$' ]]; then
    print -u2 "v8s: invalid slug: $slug"
    return 1
  fi

  return 0
}

_v8s_validate_target() {
  local target="$1"

  if [[ "$target" == *$'\0'* || "$target" == *$'\n'* || "$target" == *$'\r'* ]]; then
    print -u2 "v8s: refused target with control characters"
    return 1
  fi

  if [[ "$target" != https://* && "$target" != http://* ]]; then
    print -u2 "v8s: refused non-web target: $target"
    print -u2 "v8s: only http:// and https:// targets are opened by the terminal helper"
    return 1
  fi

  return 0
}

_v8s_open_url() {
  local target="$1"

  if [[ "$OSTYPE" == darwin* ]]; then
    command open "$target"
  elif command -v xdg-open >/dev/null 2>&1; then
    command xdg-open "$target" >/dev/null 2>&1 &
  elif command -v wslview >/dev/null 2>&1; then
    command wslview "$target"
  else
    print -u2 "v8s: no opener found. Target:"
    print -r -- "$target"
    return 1
  fi
}
