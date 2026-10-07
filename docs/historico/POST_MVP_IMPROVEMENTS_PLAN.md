# 📈 PLAN: 4 Mejoras Post-MVP → Implementación Inmediata

## 🎯 Objetivos

1. ✅ **Tailwind CSS Production Build** (30 min)
   - Migrar de CDN a build local
   - Reducir CSS de ~100KB a ~20KB
   - Mejor performance, control total

2. ✅ **Image Optimization** (20 min)
   - Responsive images con srcset
   - WebP + fallback PNG
   - Lazy loading

3. ✅ **Core Web Vitals Monitoring** (20 min)
   - Implementar Plausible Analytics (lightweight)
   - Monitoreo de LCP, FCP, CLS

4. ✅ **Service Worker PWA** (25 min)
   - Offline support
   - Cache strategy
   - Install prompt

---

## ⏱️ Timeline
- **Total: 95 minutos** (1.5 horas)
- Si completamos todo: MVP llega a **9/10** ✨

---

## 📋 Ejecución

### FASE 1: Tailwind Production Build (30 min)
```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
# Configurar index.html sin CDN
# Build: npx tailwindcss -i input.css -o output.css
```

### FASE 2: Image Optimization (20 min)
```html
<!-- Responsive images con srcset y WebP -->
<picture>
  <source srcset="hero.webp" type="image/webp">
  <source srcset="hero.png" type="image/png">
  <img src="hero.png" alt="..." loading="lazy">
</picture>
```

### FASE 3: Web Vitals Monitoring (20 min)
```html
<!-- Plausible Analytics (lightweight) -->
<script async defer data-domain="fijas.live" 
  src="https://plausible.io/js/script.js"></script>
```

### FASE 4: Service Worker (25 min)
```javascript
// service-worker.js
const CACHE = 'fijas-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => 
      c.addAll(['/index.html', '/style.css', ...])
    )
  );
});
```

---

## ✨ Expected Outcomes

- Performance: 8.5/10 → **9.2/10** ⬆️
- FCP: 1.4s → **0.8s** (50% faster)
- Network independence: No → **Yes** (Service Worker)
- Analytics: No → **Yes** (Plausible)
- Mobile-first: ✅ → **✅ Optimized**

