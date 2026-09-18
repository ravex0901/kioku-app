import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // AIにおまかせ入力/まとめて登録でbase64化した写真を送るため引き上げる
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
