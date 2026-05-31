function parseDirectiveArgs(text, lineNumber, errors) {
  const args = {};
  const tokens = text.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const separator = token.indexOf("=");
    if (separator <= 0) {
      errors.push(`Line ${lineNumber}: @schedule option must use key=value: ${token}`);
      continue;
    }

    const key = token.slice(0, separator).trim();
    const value = token.slice(separator + 1).trim();
    if (!key) {
      errors.push(`Line ${lineNumber}: @schedule option has an empty key`);
      continue;
    }

    args[key] = value;
  }

  return args;
}

function parseScheduleDirective(text, lineNumber, errors) {
  const body = text.replace(/^@schedule\s*/, "").trim();
  const args = parseDirectiveArgs(body, lineNumber, errors);
  const keys = new Set(Object.keys(args));

  if (!keys.size) {
    errors.push(`Line ${lineNumber}: @schedule requires at least one option`);
    return null;
  }

  if (keys.has("timezone") && keys.size === 1) {
    return {
      type: "timezone",
      timezone: args.timezone
    };
  }

  if (keys.has("default") && keys.size === 1) {
    return {
      type: "default",
      target: args.default
    };
  }

  if (keys.size === 1) {
    const [label] = keys;
    return {
      type: "shortcut",
      label,
      target: args[label]
    };
  }

  const label = args.rule || args.label || "";
  if (!label) {
    errors.push(`Line ${lineNumber}: @schedule rule requires rule=LABEL or label=LABEL`);
  }

  return {
    type: "rule",
    rule: {
      label,
      timezone: args.timezone,
      days: args.days,
      from: args.from,
      to: args.to,
      target: args.target
    }
  };
}

function scheduleConfigFromDirectives(slug, directives, errors) {
  const config = {};

  for (const directive of directives) {
    const parsed = parseScheduleDirective(directive.text, directive.lineNumber, errors);
    if (!parsed) continue;

    if (parsed.type === "timezone") {
      config.timezone = parsed.timezone;
      continue;
    }

    if (parsed.type === "default") {
      config.default = parsed.target;
      continue;
    }

    if (parsed.type === "shortcut") {
      config[parsed.label] = parsed.target;
      continue;
    }

    config.rules ||= [];
    config.rules.push(parsed.rule);
  }

  if (!Object.keys(config).length) {
    errors.push(`Schedule configured for "${slug}" but no schedule options were found`);
  }

  return config;
}

export function parseLinksFile(raw, parseLinkLine, errors) {
  const links = [];
  const inlineSchedules = new Map();
  let currentLink = null;

  for (const [index, originalLine] of raw.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const trimmed = originalLine.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("@schedule")) {
      if (!currentLink) {
        errors.push(`Line ${lineNumber}: @schedule must follow a link line`);
        continue;
      }

      currentLink.scheduleDirectives.push({
        lineNumber,
        text: trimmed
      });
      continue;
    }

    const link = parseLinkLine(trimmed, lineNumber);
    currentLink = link
      ? {
          link,
          scheduleDirectives: []
        }
      : null;

    if (currentLink) links.push(currentLink);
  }

  for (const entry of links) {
    if (!entry.scheduleDirectives.length) continue;

    inlineSchedules.set(entry.link.slug, {
      config: scheduleConfigFromDirectives(entry.link.slug, entry.scheduleDirectives, errors),
      source: "inline"
    });
  }

  return {
    links: links.map((entry) => entry.link),
    inlineSchedules
  };
}
