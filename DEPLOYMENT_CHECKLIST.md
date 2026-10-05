# ✅ VERIFICATION CHECKLIST - POST-MVP IMPROVEMENTS

## 🏁 PRE-DEPLOYMENT CHECKLIST

### 1. Tailwind Production Build
- [ ] Verificar `dist/styles.min.css` existe y tiene contenido
  ```bash
  dir dist/
  # Output: styles.min.css (15.50 KB)
  ```

- [ ] Verificar links en HTML:
  ```html
  <!-- Buscar en index.html, admin.html, owner.html -->
  <link rel="stylesheet" href="dist/styles.min.css">
  ```

- [ ] Ejecutar build si se modifica CSS:
  ```bash
  npm run build:css
  ```

### 2. Service Worker Registration
- [ ] Verificar `service-worker.js` existe
  ```bash
  dir service-worker.js
  # Service Worker Registration Script loaded
  ```

- [ ] Verificar script de registro en HTML:
  ```html
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
    }
  </script>
  ```

- [ ] Checkear en todos 3 archivos:
  - [ ] index.html
  - [ ] admin.html
  - [ ] owner.html

### 3. Core Web Vitals Analytics
- [ ] Verificar Plausible script en HTML:
  ```html
  <script defer data-domain="fijas.app" src="https://plausible.io/js/script.js"></script>
  ```

- [ ] Checkear en todos 3 archivos:
  - [ ] index.html
  - [ ] admin.html
  - [ ] owner.html

- [ ] Plan: Registrarse en Plausible.io después del deploy

---

## 🧪 LOCAL TESTING

### Test 1: Tailwind CSS Compilation
```bash
# Terminal
npm run build:css

# Expected output:
# ✅ Successfully generated dist/styles.min.css (15.50 KB)
```

### Test 2: Load Page in Browser
```bash
# 1. Abrir http://localhost:5500 en Chrome
# 2. Devtools → Application → Service Workers
# 3. Verificar status: "activated and running"
```

### Test 3: Service Worker Cache
```bash
# En DevTools → Application → Cache Storage
# Verificar "fijas-v1" cache existe con archivos:
# - index.html
# - dist/styles.min.css
# - fonts de Google
# - etc.
```

### Test 4: Offline Functionality
```bash
# 1. DevTools → Network tab → Check "Offline"
# 2. Recargar página (Cmd+R / Ctrl+R)
# 3. Verificar:
#    - Página carga desde cache
#    - Estilos están presentes
#    - Funcionalidad básica funciona
# 4. Desactivar "Offline" para volver a normal
```

### Test 5: Console Health
```bash
# DevTools → Console
# Verificar logs:
# ✅ "✅ Service Worker registered: [ServiceWorkerRegistration]"
# ✅ "✅ Service Worker loaded and ready for offline support"
# ❌ NO debe haber errores o warnings relacionados
```

### Test 6: Plausible Script Loading
```javascript
// En DevTools → Console:
window.plausible
// Expected: function plausible(...) { ... }
// Si muestra undefined: plausible.js no cargó correctamente
```

---

## 🚀 PRODUCTION DEPLOYMENT CHECKLIST

### Antes de Deploy
- [ ] Todos los tests locales pasan
- [ ] `npm run lint` sin errores
- [ ] Playwright suite ejecuta sin fallos: `npx playwright test e2e/testing-qa-option-b-v2.spec.js`
- [ ] `dist/styles.min.css` está versionado y en git
- [ ] `service-worker.js` está en git
- [ ] No hay console errors

### Deploy Steps
1. [ ] `git add .` (agregar todos los archivos)
2. [ ] `git commit -m "feat: Post-MVP improvements - Tailwind build, Web Vitals, Service Worker PWA"`
3. [ ] `git push` a producción
4. [ ] Esperar CI/CD (si existe)
5. [ ] Deploy a hosting

### Post-Deploy Verification
1. [ ] Abrir https://fijas.app en navegador
2. [ ] Abrir DevTools → Application → Service Workers
3. [ ] Verificar: "activated and running"
4. [ ] Check Network tab → Verificar CSS carga desde `dist/styles.min.css`
5. [ ] Check Console → Logs de Service Worker
6. [ ] Test offline: DevTools → Network → Offline → Recargar
7. [ ] Verificar página funciona sin internet

### Plausible Analytics Setup (Post-Deploy)
1. [ ] Ir a https://plausible.io/
2. [ ] Sign up / Login
3. [ ] Agregar sitio: `fijas.app`
4. [ ] Configurar dominio y periodos de retención
5. [ ] Dashboard → Verificar pageviews empiezan a registrarse
6. [ ] Configurar alertas (opcional)

---

## 🔍 COMMON ISSUES & FIXES

### Issue: Service Worker no se registra
```
Síntoma: Console log NO muestra "✅ Service Worker registered"
Solución:
- [ ] Verificar `service-worker.js` existe en raíz
- [ ] Verificar script de registro está en index.html
- [ ] Limpiar cache del navegador: DevTools → Clear Storage → Clear Site Data
- [ ] Recargar página
```

### Issue: Plausible script no carga
```
Síntoma: window.plausible es undefined en console
Solución:
- [ ] Verificar script tag está en <head>
- [ ] Verificar data-domain="fijas.app" es correcto
- [ ] Esperar ~30s para que Plausible inicialice
- [ ] Verificar en DevTools → Network → filtrar "plausible"
- [ ] Si 404: Script URL es incorrecto
```

### Issue: Tailwind CSS no aplica
```
Síntoma: Página ve sin estilos (colores raros, layouts rotos)
Solución:
- [ ] Verificar <link rel="stylesheet" href="dist/styles.min.css"> existe
- [ ] Verificar dist/styles.min.css tiene contenido (not 0 bytes)
- [ ] Regenerar CSS: npm run build:css
- [ ] Limpiar cache del navegador
- [ ] Hard refresh: Ctrl+Shift+R (Windows/Linux) o Cmd+Shift+R (Mac)
```

### Issue: Service Worker cache outdated
```
Síntoma: Cambios en código no se reflejan (old version sigue)
Solución:
- [ ] DevTools → Application → Service Workers → Unregister
- [ ] DevTools → Application → Cache Storage → Borrar "fijas-v1"
- [ ] Hard refresh
- [ ] Verificar nuevo cache contiene archivos actualizados
```

### Issue: Offline page says "Service unavailable"
```
Síntoma: Página muestra error en offline mode
Causa: Archivo no estaba en cache
Solución:
- [ ] Service Worker intenta cargar desde red
- [ ] Si falla, sirve del cache
- [ ] Si no está en cache: fallback error page
- [ ] Verificar archivo está en CACHE_URLS en service-worker.js
- [ ] Regenerar cache: Unregister + Refresh
```

---

## 📊 SUCCESS CRITERIA

✅ **Todas las siguientes deben cumplirse:**

1. **Tailwind CSS**
   - [ ] `dist/styles.min.css` es <20 KB
   - [ ] Página carga y ve con estilos correctos
   - [ ] No hay FOUC (Flash of Unstyled Content)

2. **Service Worker**
   - [ ] Registra sin errores
   - [ ] Caches se crean en Application → Cache Storage
   - [ ] Página funciona completamente en offline
   - [ ] Fallback error page aparece para recursos no cached

3. **Web Vitals**
   - [ ] Plausible script carga sin errores
   - [ ] Analytics dashboard muestra pageviews
   - [ ] Core Vitals se registran: LCP, FCP, CLS

4. **No Regressions**
   - [ ] Todos los Playwright tests pasan: `npx playwright test e2e/testing-qa-option-b-v2.spec.js`
   - [ ] No hay console errors o warnings
   - [ ] Performance similar o mejor que antes

---

## 📝 DOCUMENTATION

- [Post-MVP Improvements Plan](./POST_MVP_IMPROVEMENTS_PLAN.md)
- [Testing QA Report](./TESTING_QA_REPORT_B.html)
- [Image Optimization Guide](./IMAGE_OPTIMIZATION_GUIDE.html)
- [Complete Summary](./POST_MVP_IMPROVEMENTS_COMPLETE.md)

---

**Estado:** Ready for deployment ✅
**Fecha:** $(date)
**Reviewer:** -

