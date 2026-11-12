export function nouvelId(): string {
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${Date.now().toString(36)}-${h()}${h()}-${h()}`;
}
