export const logger = {
  info(message: string, data?: Record<string, unknown>): void {
    process.stdout.write(`${JSON.stringify({ level: "info", message, ...data })}\n`);
  },
};
