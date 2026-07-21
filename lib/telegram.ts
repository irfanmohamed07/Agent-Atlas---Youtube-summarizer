export function escapeTelegram(text: string): string {
  return text.replace(/([_\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

export function trimTelegram(text: string, limit = 4000): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
