import { defineConfig } from "vite";

const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isUserOrOrgSite = repositoryName?.toLowerCase().endsWith(".github.io");
const base = process.env.GITHUB_ACTIONS && repositoryName && !isUserOrOrgSite ? `/${repositoryName}/` : "/";

export default defineConfig({
  base,
  server: {
    host: "0.0.0.0"
  }
});
