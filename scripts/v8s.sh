#!/usr/bin/env sh

# Source this file from Bash or Zsh:
#   source /path/to/vanityURLs/code/scripts/v8s.sh
#
# The registry defaults to ~/.v8s.json. Override with:
#   export V8S_REGISTRY=/path/to/v8s.json
#
# v8s only opens targets that already exist in the generated registry. It does
# not accept arbitrary URLs from the terminal.

v8s() {
  registry="${V8S_REGISTRY:-$HOME/.v8s.json}"
  command="${1:-}"

  case "$command" in
    ""|-h|--help)
      _v8s_usage
      if [ -n "$command" ]; then
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
      printf '%s\n' "$registry"
      return 0
      ;;
    --*)
      printf '%s\n' "v8s: unknown option: $command" >&2
      _v8s_usage
      return 2
      ;;
  esac

  _v8s_open_or_print "$registry" "$command" "open"
}

_v8s_usage() {
  cat <<'EOF'
Usage:
  v8s <slug>          Open a redirect target from the local v8s registry
  v8s --print <slug>  Print the target without opening it
  v8s --list          List active redirect slugs
  v8s --path          Print the registry path

Notes:
  - Slugs are exact matches from the generated runtime link registry tree.
  - Only permanent and ephemeral links are opened.
  - Only http:// and https:// targets are opened by default.
EOF
}

_v8s_require_registry() {
  registry="$1"

  if ! command -v jq >/dev/null 2>&1; then
    printf '%s\n' "v8s: jq is required. Install jq and try again." >&2
    return 127
  fi

  if [ ! -f "$registry" ]; then
    printf '%s\n' "v8s: registry not found: $registry" >&2
    printf '%s\n' "v8s: run npm run build from the VanityURLs repo to create it." >&2
    return 1
  fi
}

_v8s_list() {
  registry="$1"

  jq -r '
    def flatten_tree($node):
      ([($node.link? // empty), ($node.splat_link? // empty)]
        + (($node.children // {}) | to_entries | map(flatten_tree(.value)) | add // []));
    flatten_tree(.tree)[]
    | select((.state // "permanent") as $state | $state == "permanent" or $state == "ephemeral")
    | [.slug, .title, .target]
    | @tsv
  ' "$registry" | sort | awk -F '\t' '
    BEGIN { printf "%-32s  %-28s  %s\n", "Slug", "Title", "Target" }
    { printf "%-32s  %-28s  %s\n", $1, $2, $3 }
  '
}

_v8s_open_or_print() {
  registry="$1"
  raw_slug="$2"
  mode="$3"

  _v8s_require_registry "$registry" || return $?

  slug="$(_v8s_normalize_slug "$raw_slug")" || return $?

  if [ -z "$slug" ]; then
    printf '%s\n' "v8s: slug is required" >&2
    _v8s_usage
    return 2
  fi

  _v8s_validate_slug "$slug" || return $?

  target="$(jq -r --arg slug "$slug" '
    def flatten_tree($node):
      ([($node.link? // empty), ($node.splat_link? // empty)]
        + (($node.children // {}) | to_entries | map(flatten_tree(.value)) | add // []));
    first(flatten_tree(.tree)[] | select(.slug == $slug and (.match // "exact") == "exact")) | .target // ""
  ' "$registry")"
  state="$(jq -r --arg slug "$slug" '
    def flatten_tree($node):
      ([($node.link? // empty), ($node.splat_link? // empty)]
        + (($node.children // {}) | to_entries | map(flatten_tree(.value)) | add // []));
    first(flatten_tree(.tree)[] | select(.slug == $slug and (.match // "exact") == "exact")) | .state // "permanent"
  ' "$registry")"

  if [ -z "$target" ]; then
    printf '%s\n' "v8s: slug not found: $slug" >&2
    return 1
  fi

  if [ "$state" != "permanent" ] && [ "$state" != "ephemeral" ]; then
    printf '%s\n' "v8s: '$slug' is not active for redirecting (state: $state)" >&2
    return 1
  fi

  _v8s_validate_target "$target" || return $?

  if [ "$mode" = "print" ]; then
    printf '%s\n' "$target"
    return 0
  fi

  printf '%s\n' "Opening $slug -> $target"
  _v8s_open_url "$target"
}

_v8s_normalize_slug() {
  slug="${1:-}"

  slug="$(printf '%s' "$slug" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  slug="${slug#http://}"
  slug="${slug#https://}"
  slug="${slug#vanityurls.link/}"
  slug="${slug#www.vanityurls.link/}"
  slug="${slug#dicai.re/}"
  slug="${slug#www.dicai.re/}"
  slug="${slug#/}"
  slug="${slug%/}"

  printf '%s\n' "$slug"
}

_v8s_validate_slug() {
  slug="$1"

  case "$slug" in
    *://*|-*|*..*|*\\*)
      printf '%s\n' "v8s: invalid slug: $slug" >&2
      return 2
      ;;
  esac

  if ! printf '%s' "$slug" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._~/-]{0,98}$'; then
    printf '%s\n' "v8s: invalid slug: $slug" >&2
    return 2
  fi
}

_v8s_validate_target() {
  target="$1"

  case "$target" in
    http://*|https://*)
      return 0
      ;;
  esac

  printf '%s\n' "v8s: refused non-web target: $target" >&2
  printf '%s\n' "v8s: only http:// and https:// targets are opened by the terminal helper" >&2
  return 2
}

_v8s_open_url() {
  target="$1"

  if [ "$(uname -s)" = "Darwin" ]; then
    command open "$target"
  elif command -v xdg-open >/dev/null 2>&1; then
    command xdg-open "$target" >/dev/null 2>&1 &
  elif command -v wslview >/dev/null 2>&1; then
    command wslview "$target"
  else
    printf '%s\n' "v8s: no opener found. Target:" >&2
    printf '%s\n' "$target"
    return 1
  fi
}
