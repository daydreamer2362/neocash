import { ref, onUnmounted } from 'vue';

export function usePolling(fetchLogic, defaultInterval = 5000) {
  const pollTimer = ref(null);
  const isPolling = ref(false);
  const currentFetchLogic = ref(fetchLogic);

  const resolveArgs = (taskOrInterval, maybeInterval) => {
    let interval = defaultInterval;
    if (typeof taskOrInterval === 'function') {
      currentFetchLogic.value = taskOrInterval;
      if (typeof maybeInterval === 'number' && Number.isFinite(maybeInterval)) {
        interval = maybeInterval;
      }
    } else if (typeof taskOrInterval === 'number' && Number.isFinite(taskOrInterval)) {
      interval = taskOrInterval;
    }
    return interval;
  };

  const runFetch = async () => {
    if (typeof currentFetchLogic.value !== 'function') {
      return;
    }
    await currentFetchLogic.value();
  };

  const startPolling = (taskOrInterval = defaultInterval, maybeInterval) => {
    stopPolling();
    const interval = resolveArgs(taskOrInterval, maybeInterval);
    isPolling.value = true;
    pollTimer.value = setInterval(async () => {
      try {
        await runFetch();
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, interval);
  };

  const stopPolling = () => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value);
      pollTimer.value = null;
    }
    isPolling.value = false;
  };

  const scheduleNextPoll = (taskOrInterval = defaultInterval, maybeInterval) => {
    stopPolling();
    const interval = resolveArgs(taskOrInterval, maybeInterval);
    pollTimer.value = setTimeout(async () => {
      try {
        await runFetch();
        scheduleNextPoll(interval);
      } catch (e) {
        scheduleNextPoll(interval);
      }
    }, interval);
    isPolling.value = true;
  };

  onUnmounted(() => {
    stopPolling();
  });

  return {
    startPolling,
    stopPolling,
    scheduleNextPoll,
    isPolling,
    setPollingTask(task) {
      if (typeof task === 'function') {
        currentFetchLogic.value = task;
      }
    }
  };
}
