export function escapeTelegram(text) {
  return text.replace(/([_\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function trimTelegram(text, limit = 4000) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
