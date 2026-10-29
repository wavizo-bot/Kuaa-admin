import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.kuaa.admin",
  appName: "kuaa Admin",
  webDir: "dist/public",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
};

export default config;
