import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    build: {
        rollupOptions: {
            // 멀티 페이지: 모든 HTML을 빌드 대상에 등록
            input: {
                root: resolve(__dirname, "index.html"),
                index: resolve(__dirname, "pages/index.html"),
                login: resolve(__dirname, "pages/login.html"),
                signup: resolve(__dirname, "pages/signup.html"),
                "verify-email": resolve(__dirname, "pages/verify-email.html"),
                profile: resolve(__dirname, "pages/profile.html"),
                result: resolve(__dirname, "pages/result.html")
            }
        }
    }
});
