// Simple toast notification system
(function() {
  const styles = `
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .toast {
      background: white;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 250px;
      max-width: 400px;
      animation: slideIn 0.3s ease-out;
      color: #1f2937;
      font-size: 14px;
      font-weight: 500;
    }
    .toast.success { background: #22c55e; color: white; }
    .toast.error { background: #ef4444; color: white; }
    .toast.info { background: #3b82f6; color: white; }
    .toast.warning { background: #fb923c; color: white; }
    @keyframes slideIn {
      from { transform: translateX(400px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(400px); opacity: 0; }
    }
    .toast.removing { animation: slideOut 0.3s ease-out forwards; }
  `;
  
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.appendChild(style);
  
  let container = null;
  
  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }
  
  window.toast = {
    success: (msg, duration = 3500) => {
      const toast = document.createElement('div');
      toast.className = 'toast success';
      toast.textContent = '✓ ' + msg;
      getContainer().appendChild(toast);
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
    error: (msg, duration = 4000) => {
      const toast = document.createElement('div');
      toast.className = 'toast error';
      toast.textContent = '✕ ' + msg;
      getContainer().appendChild(toast);
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
    info: (msg, duration = 3500) => {
      const toast = document.createElement('div');
      toast.className = 'toast info';
      toast.textContent = 'ℹ ' + msg;
      getContainer().appendChild(toast);
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },
    warning: (msg, duration = 3500) => {
      const toast = document.createElement('div');
      toast.className = 'toast warning';
      toast.textContent = '⚠ ' + msg;
      getContainer().appendChild(toast);
      setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  };
})();
