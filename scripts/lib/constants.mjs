export const RUNTIME_REGISTRY_SCHEMA_VERSION = "3.1";
export const SITE_CONFIG_SCHEMA_VERSION = "1.0";
export const POLICY_SCHEMA_VERSION = "1.0";

export const DEFAULT_STATE = "permanent";
export const REDIRECT_STATES = ["permanent", "ephemeral"];
export const ERROR_STATES = ["expired", "disabled", "maintenance", "deactivated"];
export const LINK_STATES = [...REDIRECT_STATES, ...ERROR_STATES];

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const VALID_DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

export const SAFE_REDIRECT_PROTOCOLS = new Set(["http:", "https:"]);
export const SAFE_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
