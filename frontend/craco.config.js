const path = require("path");

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  devServer: (devServerConfig) => {
    devServerConfig.host = devServerConfig.host || "127.0.0.1";
    devServerConfig.allowedHosts = "all";
    return devServerConfig;
  },
};
