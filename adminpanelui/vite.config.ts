import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // This ensures .env files are always loaded
  const env = loadEnv(mode, process.cwd(), '')
  
  // Log loaded env vars in development (for debugging)
  if (mode === 'development') {
    console.log('🔧 Vite Config - Loading environment variables...')
    console.log('   Mode:', mode)
    console.log('   Working directory:', process.cwd())
    const viteVars = Object.keys(env).filter(k => k.startsWith('VITE_'))
    console.log('   Found VITE_ variables:', viteVars)
    if (viteVars.length > 0) {
      viteVars.forEach(key => {
        console.log(`   ${key} = ${env[key]}`)
      })
    } else {
      console.warn('   ⚠️  No VITE_ variables found!')
      console.warn('   Check that adminpanelui/.env exists with VITE_API_BASE_URL')
    }
  }
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3001,
      host: true
    },
    // Explicitly define environment variable prefix
    envPrefix: 'VITE_',
    // Ensure .env files are loaded
    envDir: '.',
  }
})