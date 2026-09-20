import { STATUS_MAP_NUM, BUY_ORDER_STATUS_MAP } from './constants';

export const formatMoney = (val) => {
  const num = Number.isFinite(Number(val)) ? Number(val) : 0;
  return num.toFixed(2);
};

export const formatLimitAmount = (val) => {
  const num = Number.isFinite(Number(val)) ? Number(val) : 0;
  if (Number.isInteger(num)) return String(num);
  return num.toFixed(2).replace(/\.00$/, '');
};

export const formatRemain = (sec) => {
  const maxSec = Math.max(0, Number(sec) || 0);
  const m = Math.floor(maxSec / 60);
  const s = maxSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const normalizeWalletStatus = (val) => {
  if (typeof val === 'number') {
    return STATUS_MAP_NUM.hasOwnProperty(val) ? STATUS_MAP_NUM[val] : "offline";
  }
  if (val == null) return "offline";
  
  const s = String(val).trim().toLowerCase();
  if (["1", "online", "ok", "alive", "available", "true", "success", "enabled"].includes(s)) {
    return "online";
  }
  if (["2", "disabled", "ban", "forbidden"].includes(s)) {
    return "disabled";
  }
  return "offline";
};

export const mapBuyOrderStatus = (statusNum) => {
  const normalizedText = String(statusNum ?? '').toUpperCase();
  if (['CANCELLED', 'REJECTED'].includes(normalizedText)) {
    return 'Pending';
  }
  if (normalizedText === 'FAILED') return 'Pending';
  if (normalizedText === 'TIMEOUT') return 'Timeout';
  if (normalizedText === 'EXPIRED') return 'Expired';
  if (normalizedText === 'ERROR') return 'Error';
  const code = Number(statusNum);
  return BUY_ORDER_STATUS_MAP[code] || (typeof statusNum === 'string' ? statusNum : String(statusNum ?? ""));
};

export const mapBuyOrderStatusClass = (statusNum) => {
  const label = mapBuyOrderStatus(statusNum).toLowerCase();
  if (label === 'succeed') return 'success';
  if (label === 'timeout' || label === 'expired' || label === 'error') return 'timeout';
  if (label === 'submitted') return 'submitted';
  return 'pending';
};

export const simplifyUserStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCESS') return 'Success';
  if (normalized === 'COMPLETED') return 'Completed';
  if (normalized === 'FAILED') return 'Pending';
  if (normalized === 'TIMEOUT') return 'Timeout';
  if (normalized === 'EXPIRED') return 'Expired';
  if (normalized === 'ERROR') return 'Error';
  if (normalized === 'CANCELLED' || normalized === 'REJECTED') return 'Pending';
  if (normalized === 'PENDING' || normalized === 'SUBMITTED') return 'Pending';
  return 'Pending';
};

export const userStatusClass = (status) => {
  const label = simplifyUserStatus(status);
  if (label === 'Success') return 'succeed';
  if (label === 'Completed') return 'completed';
  if (label === 'Timeout' || label === 'Expired' || label === 'Error') return 'timeout';
  return 'pending';
};

export const normalizeRangeFilter = (range) => {
  if (!range || range === 'all') return null;
  if (range === '501+') return { min: 501 };
  const [min, max] = String(range).split('-').map(Number);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    return { min, max };
  }
  return null;
};

export const filterOrdersByRange = (orders, range) => {
  const parsedRange = normalizeRangeFilter(range);
  if (!parsedRange) return Array.isArray(orders) ? orders : [];

  return (Array.isArray(orders) ? orders : []).filter((order) => {
    const amount = Number(order?.amount ?? order?.price ?? 0);
    if (parsedRange.min != null && amount < parsedRange.min) return false;
    if (parsedRange.max != null && amount > parsedRange.max) return false;
    return true;
  });
};

export const countOrdersByRanges = (orders) => {
  const source = Array.isArray(orders) ? orders : [];
  return {
    all: source.length,
    '100-300': filterOrdersByRange(source, '100-300').length,
    '301-500': filterOrdersByRange(source, '301-500').length,
    '501+': filterOrdersByRange(source, '501+').length
  };
};

export const matchesStatusFilter = (status, filterValue) => {
  if (!filterValue) return true;
  const normalized = String(filterValue)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (!normalized.length) return true;
  return normalized.includes(Number(status));
};

export const mapPayoutConfig = (raw = {}) => {
  const minAmount = Number(
    raw.minAmount ??
    raw.MIN_PAYOUT_AMOUNT ??
    raw.minPayoutAmount ??
    raw.minWithdrawAmount ??
    raw.minLimit ??
    raw.min ??
    0
  );
  const maxAmount = Number(
    raw.maxAmount ??
    raw.MAX_PAYOUT_AMOUNT ??
    raw.maxPayoutAmount ??
    raw.maxWithdrawAmount ??
    raw.maxLimit ??
    raw.max ??
    0
  );
  const feeRate = Number(
    raw.feeRate ??
    raw.PAYOUT_FEE_RATE ??
    raw.payoutFeeRate ??
    raw.rate ??
    raw.serviceFeeRate ??
    0
  );
  return {
    ...raw,
    minAmount,
    maxAmount,
    feeRate,
    minAmountText: formatLimitAmount(minAmount),
    maxAmountText: formatLimitAmount(maxAmount),
    feeRateText: feeRate ? `${feeRate}%` : '0%'
  };
};

export const mapBuyOrder = (raw = {}) => {
  const status = Number(raw.status ?? raw.orderStatus ?? 0);
  const amount = Number(raw.amount ?? raw.price ?? 0);
  const income = Number(raw.income ?? raw.bonus ?? raw.reward ?? 0);
  const orderNo = raw.orderNo || raw.code || raw.orderCode || '';

  return {
    ...raw,
    id: raw.id || orderNo,
    orderNo,
    code: orderNo,
    amount,
    income: income.toFixed(2),
    amountText: formatMoney(amount),
    status,
    statusLabel: mapBuyOrderStatus(status),
    statusClass: mapBuyOrderStatusClass(status)
  };
};

export const calcNextPollDelayMs = (attempt = 0, baseDelay = 5000, maxDelay = 15000) => {
  const normalizedAttempt = Math.max(0, Number(attempt) || 0);
  return Math.min(baseDelay + normalizedAttempt * 1000, maxDelay);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(',', '');
};
