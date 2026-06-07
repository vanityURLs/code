# 0013. Make runtime registry 3.1 tree-only

Date: 2026-05-30

Status: Accepted

## Context

The source link registry is the human-edited `custom/v8s-links.txt` file. The generated runtime link registry is
deployed as `build/v8s.json`. Earlier 2.x builds exposed the redirect inventory as a flat `links[]` array. That shape is
simple, but every runtime lookup has to scan the array, and admin, lookup, and splat routing surfaces need a nested
representation of aliases.

An unused validator already described a schema `3.0` shape with a `tree` object. The generator, active validator,
Worker, and documentation still used schema `2.2`, which created a split contract.

## Decision

Move the generated runtime registry to `schema_version: "3.1"`.

The source link registry stays flat and human-editable. The build compiles it into the runtime link registry. The
canonical runtime lookup shape is `tree`. Each tree node has `children`, may have an exact `link`, and may have a
`splat_link` for `slug/*` routes.

`build/v8s.json` no longer emits `links[]`. Dashboards, local helpers, validators, and maintenance scripts must flatten
`tree` when they need tabular output. Keeping one runtime shape avoids having two subtly different runtime link registry
contracts.

## Consequences

- Runtime lookup and tooling use the same generated tree shape
- The validator, generator, Worker, tests, and documentation move together
- `links[]` is removed from newly generated runtime link registries
- Rollback remains a normal Git/deployment operation because the source link registry in `custom/v8s-links.txt` is
  unchanged
- Exact and splat aliases may share the same base slug in the source link registry, such as `docs` and `docs/*`; the
  runtime tree must preserve exact lookup and nested splat lookup separately.
