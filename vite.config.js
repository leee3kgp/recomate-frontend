import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");

    return {
        build: {
            rollupOptions: {
                // 멀티 페이지: 모든 HTML을 빌드 대상에 등록
                input: {
                    index: resolve(__dirname, "pages/index.html"),
                    login: resolve(__dirname, "pages/login.html"),
                    signup: resolve(__dirname, "pages/signup.html"),
                    "verify-email": resolve(__dirname, "pages/verify-email.html"),
                    profile: resolve(__dirname, "pages/profile.html"),
                    select: resolve(__dirname, "pages/select.html"),
                    result: resolve(__dirname, "pages/result.html")
                }
            }
        },
        server: {
            // 개발 중 /api/* 요청을 백엔드(API Gateway)로 전달
            // .env.local 에 VITE_API_TARGET=https://xxxx.execute-api.ap-northeast-2.amazonaws.com 지정
            proxy: env.VITE_API_TARGET
                ? {
                      "/api": {
                          target: env.VITE_API_TARGET,
                          changeOrigin: true
                      }
                  }
                : undefined
        }
    };
});
