# 0003. Custom policy replaces the default source policy

Date: 2026-05-19

Status: Accepted

## Context

`v8s-policies.json` controls destination safety, allow domains, blocked domains, scanner keywords, and generated blocklist sources.

If a custom policy were merged over the default source policy, a removed local policy item could reappear from the product defaults after an upgrade.

## Decision

When `custom/v8s-policies.json` exists, it replaces the default source policy.

Generated feed data may still be merged afterward, and allow-domain entries can force-allow generated blocks.

Legacy `v8s-blocklist.json` paths remain migration-compatible, but new product and instance documentation should use `v8s-policies.json`.

## Consequences

- Instance owners have explicit control over local policy
- Removing a local policy entry is durable
- Product defaults remain useful for new instances
- Generated feeds remain a separate optional layer
