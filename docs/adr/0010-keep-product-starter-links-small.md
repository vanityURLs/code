# 0010. Keep product starter links small

Date: 2026-05-26

Status: Accepted

## Context

New instances need a clear first `custom/v8s-links.txt` file. The previous product default link file mixed starter links, project links, personal-style examples, lifecycle probes, and namespace examples.

That made setup confusing because the installer created a small hard-coded starter list while `defaults/v8s-links.txt` contained a much larger example inventory.

## Decision

Keep `defaults/v8s-links.txt` as the product starter source with only:

- `home`
- `status`
- `docs`

When `custom/v8s-links.txt` is missing, setup creates it from `defaults/v8s-links.txt` and adapts the starter home, status, and owner values for the instance.

Larger example inventories belong in demo instances or documentation, not in the product starter file.

## Consequences

- New users see the same starter links in `defaults/` and generated `custom/`
- Setup has one source for starter links instead of a hidden hard-coded list
- Demo links can grow independently without becoming product defaults
- The default registry remains valid and easy to replace
