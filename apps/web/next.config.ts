import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@ironrein/shared"],
  // Stops `next dev` from writing an AGENTS.md of its own into the repo.
  agentRules: false,
};

export default config;
