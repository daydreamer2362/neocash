/**
 * Lightweight Toast notification to replace uni.showToast
 */
export const toast = {
  show({ title, icon = 'none', duration = 2000 }) {
    // If we're in a Vue context with a global toast component, we could use an event bus.
    // For now, we'll create a simple DOM-based toast if no component is mounted.
    const existing = document.getElementById('neocash-toast');
    if (existing) {
      existing.remove();
    }

    const toastEl = document.createElement('div');
    toastEl.id = 'neocash-toast';
    toastEl.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(145deg, rgba(10, 20, 40, 0.95), rgba(5, 12, 25, 0.95));
      border: 1px solid rgba(79, 140, 255, 0.2);
      color: #d0e4ff;
      padding: 12px 24px;
      border-radius: 16px;
      font-size: 14px;
      z-index: 9999;
      text-align: center;
      max-width: 80%;
      word-wrap: break-word;
      transition: opacity 0.3s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.38);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    `;

    if (icon === 'success') {
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '✓';
      iconEl.style.cssText = 'font-size: 24px; font-weight: bold; margin-bottom: 4px; color: #6bfe9c;';
      toastEl.appendChild(iconEl);
    } else if (icon === 'error') {
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '✕';
      iconEl.style.cssText = 'font-size: 24px; font-weight: bold; margin-bottom: 4px; color: #ff7351;';
      toastEl.appendChild(iconEl);
    }

    const textEl = document.createElement('div');
    textEl.innerText = title;
    toastEl.appendChild(textEl);

    document.body.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = '0';
      setTimeout(() => toastEl.remove(), 300);
    }, duration);
  }
};
