import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync, mkdirSync } from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // 确保 preload 文件被正确复制到 dist 目录
    {
      name: 'copy-preload',
      writeBundle() {
        const distPreloadDir = 'dist/preload'
        if (!existsSync(distPreloadDir)) {
          mkdirSync(distPreloadDir, { recursive: true })
        }
        copyFileSync('public/preload/services.js', 'dist/preload/services.js')
        copyFileSync('public/preload/package.json', 'dist/preload/package.json')
        console.log('✅ Preload files copied successfully')
      }
    }
  ],
  base: './'
})
