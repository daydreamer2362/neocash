import { ref, onUnmounted } from 'vue';
import { formatRemain } from '../utils/helpers';

export function useCountdown() {
  const remainSec = ref(0);
  const remainText = ref('');
  let timerId = null;

  const stopTimer = () => {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    if (remainSec.value <= 0) {
      remainText.value = 'Expired';
      return;
    }
    
    remainText.value = formatRemain(remainSec.value);
    timerId = setInterval(() => {
      if (remainSec.value > 0) {
        remainSec.value -= 1;
        remainText.value = formatRemain(remainSec.value);
      } else {
        remainText.value = 'Expired';
        stopTimer();
      }
    }, 1000);
  };

  // Uses server times to calculate remaining seconds
  const initExpireByServer = (expireAtStr, serverNowStr) => {
    const expireTime = typeof expireAtStr === 'string' || expireAtStr instanceof Date
      ? new Date(expireAtStr).getTime()
      : Number(expireAtStr);
    const nowTime = typeof serverNowStr === 'string' || serverNowStr instanceof Date
      ? new Date(serverNowStr).getTime()
      : Number(serverNowStr);
    
    if (!expireTime || !nowTime || Number.isNaN(expireTime) || Number.isNaN(nowTime)) {
      remainSec.value = 0;
      remainText.value = '';
      return;
    }

    const diffSecs = Math.floor((expireTime - nowTime) / 1000);
    remainSec.value = Math.max(0, diffSecs);
    remainText.value = remainSec.value > 0 ? formatRemain(remainSec.value) : 'Expired';
  };

  onUnmounted(() => {
    stopTimer();
  });

  return {
    remainSec,
    remainText,
    startTimer,
    stopTimer,
    initExpireByServer
  };
}
