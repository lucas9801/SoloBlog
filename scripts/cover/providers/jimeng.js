export const jimengProvider = {
  name: "jimeng",
  async generate() {
    const error = new Error("Jimeng provider is a stub. Add the concrete API endpoint and key after the site owner confirms this provider.");
    error.retryable = false;
    throw error;
  }
};
