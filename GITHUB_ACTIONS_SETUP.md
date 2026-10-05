# 🚀 GITHUB ACTIONS - DEPLOYMENT SETUP

## Auto-Deploy a Firebase Hosting

El workflow `deploy.yml` ya está configurado. Cuando hagas push a `main`, se ejecutará automáticamente:

```
1. Checkout del código
2. Setup Node.js v18
3. npm ci (instalar dependencies)
4. npm run build:css (compilar Tailwind)
5. Deploy a Firebase Hosting (https://chijas.web.app/)
```

---

## ⚙️ SETUP REQUERIDO (Una sola vez)

### Paso 1: Generar Firebase Service Account

```bash
# En local (terminal)
firebase login

# Obtener JSON de la service account
# Ir a: https://console.firebase.google.com/project/demo-fijas-vivo/settings/serviceaccounts/adminsdk
# Haz clic en "Generate new private key"
# Guarda el archivo JSON (ejemplo: firebase-key.json)
```

### Paso 2: Agregar Secret a GitHub

1. Abre tu repositorio en GitHub: `https://github.com/KachitoRD/chijas`
2. Settings → Secrets and variables → Actions
3. Haz clic en "New repository secret"
4. Nombre: `FIREBASE_SERVICE_ACCOUNT`
5. Valor: Copia TODO el contenido del JSON de firebase-key.json
6. Haz clic en "Add secret"

### Paso 3: Verificar Workflow

1. Ve a Actions en tu repositorio
2. Deberías ver "Deploy to Firebase Hosting" workflow
3. El último commit debería mostrar un ✅ o 🔄

---

## 🔄 MANUAL DEPLOYMENT (Sin esperar GitHub Actions)

Si necesitas deployar inmediatamente sin esperar a que se ejecute el workflow:

```bash
# En local
cd "C:\Users\rober\OneDrive\Documentos\proyecto tipsters"

# Compilar CSS
npm run build:css

# Deployar a Firebase
firebase deploy --only hosting
```

---

## 📊 MONITOREO

Una vez configurado, cada vez que hagas:

```bash
git push origin main
```

Automáticamente:
1. GitHub Actions ejecutará el workflow
2. Se compilará el CSS
3. Se deployará a Firebase Hosting
4. Puedes ver el progreso en: `https://github.com/KachitoRD/chijas/actions`

**Y en ~2-3 minutos, los cambios estarán en: https://chijas.web.app/**

---

## ✅ VERIFICACIÓN

Después de deployar, verifica en:

```bash
# 1. Revisa Google Chrome
https://chijas.web.app/

# 2. Devtools - Verifica que:
# - CSS desde dist/styles.min.css
# - Service Worker registrado
# - Plausible Analytics activo
```

---

## 🐛 TROUBLESHOOTING

### Problema: Workflow falla con "FIREBASE_SERVICE_ACCOUNT is not defined"
**Solución:** No agregaste el secret. Repite Paso 2.

### Problema: Workflow se ejecuta pero no deploya
**Solución:** Verifica que `projectId: demo-fijas-vivo` es correcto en `deploy.yml`.

### Problema: Build falla (CSS no compila)
**Solución:** Verifica que `npm run build:css` funciona en local:
```bash
npm run build:css
ls dist/styles.min.css  # Debe existir
```

---

## 📝 PRÓXIMO PASO

1. ✅ Genera la Firebase Service Account JSON
2. ✅ Agrega el secret a GitHub
3. ✅ Haz un commit pequeño de prueba
4. ✅ Verifica que aparezca en: https://github.com/KachitoRD/chijas/actions
5. ✅ Espera 2-3 minutos
6. ✅ Verifica en: https://chijas.web.app/

**¡Listo! A partir de ahí, todos tus cambios se desplegarán automáticamente!** 🚀

