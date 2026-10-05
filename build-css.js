import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildCSS() {
  console.log('🎨 Building Tailwind CSS...');
  
  const input = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
  
  try {
    const result = await postcss([
      tailwindcss(path.join(__dirname, 'tailwind.config.js')),
      autoprefixer(),
    ]).process(input, {
      from: path.join(__dirname, 'styles.css'),
      to: path.join(__dirname, 'dist', 'styles.min.css'),
    });

    // Create dist directory if it doesn't exist
    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    // Write minified CSS
    fs.writeFileSync(path.join(distDir, 'styles.min.css'), result.css);
    
    const fileSize = (result.css.length / 1024).toFixed(2);
    console.log(`✅ Tailwind CSS built successfully!`);
    console.log(`📦 File size: ${fileSize} KB`);
    console.log(`📁 Output: ./dist/styles.min.css`);
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildCSS();
