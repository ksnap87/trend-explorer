/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // YouTube 썸네일 등 외부 이미지 허용 (필요 시 도메인 추가).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
  },
};

export default nextConfig;
