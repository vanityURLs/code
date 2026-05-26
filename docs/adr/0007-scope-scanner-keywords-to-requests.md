# 0007. Scope scanner keywords to requests

Date: 2026-05-26

Status: Accepted

## Context

The policy layer blocks scanner probes such as WordPress and PHP endpoint scans. Some strings, such as `.php`, are unsafe as requested paths on a non-PHP redirector but can be legitimate in long-link destinations.

Blocking those strings everywhere can reject valid redirects.

## Decision

Scanner-probe keywords default to request scope unless explicitly configured otherwise.

Policy entries can set `scope` to control whether a keyword applies to request paths, redirect targets, or both.

## Consequences

- Scanner probes are still blocked before short-link lookup
- Valid long URLs ending in `.php` can be used as redirect targets
- Existing scanner policies remain compatible
- Policy authors can still opt into target blocking for specific keywords
