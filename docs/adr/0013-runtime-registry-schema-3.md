# 0013. Make runtime registry 3.0 tree-first with links compatibility

Date: 2026-05-30

Status: Accepted

## Context

The source link registry is the human-edited `custom/v8s-links.txt` file. The generated runtime link registry is
deployed as `build/v8s.json`. Earlier 2.x builds exposed the redirect inventory as a flat `links[]` array. That shape is
simple, but every runtime lookup has to scan the array, and future admin or lookup surfaces need a nested representation
of aliases.

An unused validator already described a schema `3.0` shape with a `tree` object. The generator, active validator,
Worker, and documentation still used schema `2.2`, which created a split contract.

## Decision

Move the generated runtime registry to `schema_version: "3.0"`.

The source link registry stays flat and human-editable. The build compiles it into the runtime link registry. The
canonical runtime lookup shape is `tree`. Each tree node has `children`, may have an exact `link`, and may have a
`splat_link` for `slug/*` routes. The build still emits `links[]` as a derived compatibility array for dashboards, local
helpers, and existing operator workflows.

The Worker must prefer `tree` when it is present and fall back to `links[]` when it is absent. This keeps older
generated registries readable during rollback or partial upgrades.

## Consequences

- Runtime lookup can use the nested shape without losing compatibility with tools that read `links[]`
- The validator, generator, Worker, tests, and documentation move together
- `links[]` remains part of the 3.x compatibility contract and should not be removed before a future major release
- Rollback remains a normal Git/deployment operation because the Worker can read the previous flat registry shape
- Exact and splat aliases may share the same base slug in the source link registry, such as `docs` and `docs/*`; the
  runtime tree must preserve exact lookup and nested splat lookup separately.
