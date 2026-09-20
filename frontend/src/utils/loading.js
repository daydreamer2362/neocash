/**
 * Reference-counted loading overlay manager.
 * Ensures the overlay only hides when all loading requests have finished.
 */
let loadingCount = 0;

export const loading = {
  show(title = 'Loading...') {
    loadingCount++;
    if (loadingCount === 1) {
      const existing = document.getElementById('neocash-loading');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'neocash-loading';
      overlay.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        color: #d0e4ff;
      `;

      const style = document.createElement('style');
      style.textContent = `
        .custom-loader-wrap {
          --size: 110px;
          --duration: 2s;
          --background: linear-gradient(165deg, rgba(79, 140, 255, 0.15) 0%, rgba(79, 140, 255, 0) 100%);
          height: var(--size);
          aspect-ratio: 1;
          position: relative;
          margin-bottom: 24px;
        }
        .custom-loader-wrap .box {
          position: absolute;
          background: var(--background);
          border-radius: 50%;
          border-top: 1px solid rgba(79, 140, 255, 0.5);
          box-shadow: rgba(0, 0, 0, 0.5) 0px 10px 10px -0px;
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          animation: ripple var(--duration) infinite ease-in-out;
        }
        .custom-loader-wrap .box:nth-child(1) { inset: 40%; z-index: 99; }
        .custom-loader-wrap .box:nth-child(2) { inset: 30%; z-index: 98; border-color: rgba(79, 140, 255, 0.6); animation-delay: 0.2s; }
        .custom-loader-wrap .box:nth-child(3) { inset: 20%; z-index: 97; border-color: rgba(79, 140, 255, 0.4); animation-delay: 0.4s; }
        .custom-loader-wrap .box:nth-child(4) { inset: 10%; z-index: 96; border-color: rgba(79, 140, 255, 0.2); animation-delay: 0.6s; }
        .custom-loader-wrap .box:nth-child(5) { inset: 0%; z-index: 95; border-color: rgba(79, 140, 255, 0.1); animation-delay: 0.8s; }
          
        .custom-loader-wrap .logo {
          position: absolute;
          inset: 0;
          display: grid;
          place-content: center;
          padding: 24%;
          z-index: 100;
        }
        .custom-loader-wrap .logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 50%;
          animation: scale-bounce var(--duration) infinite ease-in-out;
        }
          
        @keyframes ripple {
          0% { transform: scale(1); box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 10px -0px; }
          50% { transform: scale(1.3); box-shadow: rgba(0, 0, 0, 0.3) 0px 30px 20px -0px; }
          100% { transform: scale(1); box-shadow: rgba(0, 0, 0, 0.3) 0px 10px 10px -0px; }
        }
        @keyframes scale-bounce {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; box-shadow: 0 0 20px rgba(79, 140, 255, 0.4); }
          100% { transform: scale(1); opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);

      overlay.innerHTML = `
        <div class="custom-loader-wrap">
          <div class="box">
            <div class="logo">
              <img src="/logo/logo.jpg" alt="Logo" />
            </div>
          </div>
          <div class="box"></div>
          <div class="box"></div>
          <div class="box"></div>
          <div class="box"></div>
        </div>
        
        <div style="font-size: 14px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; font-family: 'Inter', sans-serif;">${title}</div>
      `;

      document.body.appendChild(overlay);
    }
  },

  hide() {
    loadingCount = Math.max(0, loadingCount - 1);
    if (loadingCount === 0) {
      const existing = document.getElementById('neocash-loading');
      if (existing) existing.remove();
    }
  },

  forceHide() {
    loadingCount = 0;
    const existing = document.getElementById('neocash-loading');
    if (existing) existing.remove();
  }
};
