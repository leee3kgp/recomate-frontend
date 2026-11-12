import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// pages/의 HTML을 모두 빌드 대상으로 등록 (새 페이지를 추가해도 배포 빌드에서 빠지지 않도록)
const pages = Object.fromEntries(
    readdirSync(resolve(__dirname, "pages"))
        .filter((file) => file.endsWith(".html"))
        .map((file) => [file.slice(0, -".html".length), resolve(__dirname, "pages", file)])
);

export default defineConfig({
    build: {
        rollupOptions: {
            // 멀티 페이지: 루트 index.html(pages/index.html로 이동)과 pages/의 모든 HTML
            input: {
                root: resolve(__dirname, "index.html"),
                ...pages
            }
        }
    }
});
