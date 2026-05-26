# 0006. Use readable random slugs

Date: 2026-05-26

Status: Accepted

## Context

The `lnk` CLI can generate short slugs when the user does not provide one. Fully unrestricted random strings can include characters that are visually ambiguous or awkward to read over the phone.

Different teams may also want different generated slug lengths for different tags.

## Decision

Generated slugs use a readable alphabet from `custom/v8s-site-config.json`, falling back to the product default.

The site config also stores:

- `links.random_slug_length`
- `links.random_slug_alphabet`
- `links.tag_random_slug_lengths`

When multiple tags define random slug lengths, `lnk` uses the shortest configured length.

## Consequences

- Generated slugs are easier to read and type
- Instances can keep short defaults while using longer slugs for selected tags
- The schema fields are additive and do not require a `schema_version` bump
