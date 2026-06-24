export const replicateProvider = {
  name: "replicate",
  async generate() {
    const error = new Error("Replicate provider is a stub. Add REPLICATE_API_TOKEN handling after the site owner confirms this provider.");
    error.retryable = false;
    throw error;
  }
};
