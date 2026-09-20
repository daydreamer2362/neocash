import { ref, reactive } from 'vue';

export function usePagination(fetchLogic) {
  const state = reactive({
    list: [],
    page: 1,
    size: 20,
    total: 0,
    loading: false,
    finished: false,
    refreshing: false
  });

  const loadData = async (isRefresh = false) => {
    if (state.loading) return;
    if (!isRefresh && state.finished) return;

    if (isRefresh) {
      state.page = 1;
      state.finished = false;
      state.refreshing = true;
    }
    
    state.loading = true;
    
    try {
      const res = await fetchLogic({ page: state.page, size: state.size });
      const records = res?.data?.records || res?.data || [];
      
      if (isRefresh) {
        state.list = records;
      } else {
        state.list = [...state.list, ...records];
      }
      
      state.total = res?.data?.total || 0;
      
      if (records.length < state.size) {
        state.finished = true;
      } else {
        state.page += 1;
      }
    } catch (e) {
      console.error('Pagination err:', e);
      state.finished = true; // Stop infinite loads on error
    } finally {
      state.loading = false;
      state.refreshing = false;
    }
  };

  const refreshAction = () => loadData(true);
  const loadMoreAction = () => loadData(false);

  return {
    state,
    refreshAction,
    loadMoreAction
  };
}
