const BOT_PATTERNS = [
  { re: /googlebot/i, name: "Googlebot" },
  { re: /bingbot/i, name: "Bingbot" },
  { re: /duckduckbot|duckduckgo-favicons-bot/i, name: "DuckDuckBot" },
  { re: /yandexbot/i, name: "YandexBot" },
  { re: /baiduspider/i, name: "Baiduspider" },
  { re: /applebot/i, name: "Applebot" },
  { re: /ahrefsbot/i, name: "AhrefsBot" },
  { re: /semrushbot/i, name: "SemrushBot" },
  { re: /mj12bot/i, name: "MJ12bot" },
  { re: /dotbot/i, name: "DotBot" },
  { re: /gptbot/i, name: "GPTBot" },
  { re: /claudebot|claude-web/i, name: "ClaudeBot" },
  { re: /perplexitybot/i, name: "PerplexityBot" },
  { re: /ccbot/i, name: "CCBot" },
  { re: /bytespider/i, name: "Bytespider" },
  { re: /facebookexternalhit/i, name: "FacebookExternalHit" },
  { re: /twitterbot/i, name: "Twitterbot" },
  { re: /linkedinbot/i, name: "LinkedInBot" },
  { re: /slackbot/i, name: "Slackbot" },
  { re: /discordbot/i, name: "Discordbot" },
  { re: /telegrambot/i, name: "TelegramBot" },
  { re: /whatsapp/i, name: "WhatsApp" },
  { re: /uptimerobot|pingdom|monitis|statuscake/i, name: "Monitor" },
  { re: /curl|wget|python-requests|libwww/i, name: "CLI" },
  { re: /bot[\/\s\-\d]|crawler|spider|scraper/i, name: "Other" },
  { re: /headlesschrome|phantomjs|httrack/i, name: "Headless" }
];

export function detectBot(userAgent, missingName = null) {
  if (!userAgent) return missingName;

  for (const { re, name } of BOT_PATTERNS) {
    if (re.test(userAgent)) return name;
  }

  return null;
}
