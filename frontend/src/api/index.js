import { http } from './http';
import { endpoints as a } from './endpoints';

const withOptionalId = (base, id) => {
  if (id === undefined || id === null || id === '' || id === 0) return base;
  return base + String(id);
};

export const userApi = {
  endpoints: a,
  info: (t) => http.get(a.user.info, t),
  update: (t) => http.post(a.user.update, t, { showLoading: true }),
  login: (t) => http.post(a.user.login, t, { showLoading: true }),
  verifyLoginOtp: (t) => http.post(a.user.verifyLoginOtp, t, { showLoading: true }),
  otpStatus: () => http.get(a.user.otpStatus),
  appLogout: () => http.post(a.user.appLogout, {}, { showLoading: true }),
  updatePassword: (t) => http.post(a.user.updatePassword, t, { showLoading: true }),
  onSell: (t) => http.post(withOptionalId(a.user.onSell, t)),
  offSell: (t) => http.post(withOptionalId(a.user.offSell, t)),
  updatePin: (t) => http.post(a.user.updatePin, t, { showLoading: true }),
  verifyPin: (t) => http.post(a.user.verifyPin, t, { showLoading: true }),
  register: (t) => http.post(a.user.register, t, { showLoading: true }),
  forgot: (t) => http.post(a.user.forgot, t, { showLoading: true }),
  prefill: (t) => http.get(a.user.prefill, t, { showLoading: true }),
  checkSendOtp: () => http.post(a.user.checkSendOtp, {}, { showLoading: true }),
  googleLogin: (t) => http.post(a.user.googleLogin, t, { showLoading: true }),
  googleComplete: (t) => http.post(a.user.googleComplete, t, { showLoading: true })
};

export const homeApi = {
  notice: (t) => http.get(a.home.notice, t),
  baseParam: (t) => http.get(a.home.baseParam, t),
  contentPage: (t) => http.get(a.home.contentPage, t, { showLoading: true })
};

export const teamApi = {
  invites: (t) => http.get(a.team.invites, t, { showLoading: true }),
  createInvites: (t) => http.post(a.team.createInvites, t, { showLoading: true }),
  deleteInvites: (t) => http.post(a.team.deleteInvites, t, { showLoading: true }),
  members: (t) => http.get(a.team.members, t, { showLoading: true }),
  teamDetails: (t) => http.get(a.team.teamDetails, t),
  editRatio: (t) => http.post(a.team.editRatio, t, { showLoading: true }),
  getTeamTurnoverBars: (t) => http.get(a.team.getTeamTurnoverBars, t, { showLoading: true }),
  subMembers: (t) => http.get(a.team.subMembers, t, { showLoading: true })
};

export const pointApi = {
  rechargeConfig: (t) => http.get(a.point.rechargeConfig, t),
  usdt: (t) => http.get(a.point.usdt, t, { showLoading: true })
};

export const myApi = {
  person: (t) => http.get(a.my.person, t),
  personV2: (t) => http.get(a.my.personV2, t, { showLoading: true }),
  getInviterUrl: (t) => http.get(a.my.getInviterUrl, t, { showLoading: true })
};

export const walletApi = {
  getWalletList: (t) => http.post(a.wallet.getWalletList, t, { showLoading: true }),
  getPayoutWalletList: (t) => http.post(a.wallet.getPayoutWalletList, t, { showLoading: true }),
  submit: (t) => http.post(a.wallet.submit, t, { showLoading: true }),
  v2Submit: (t) => http.post(a.wallet.v2Submit, t, { showLoading: true }),
  changeStatus: (t, e = {}) => http.post(a.wallet.changeStatus + String(t), e, { showLoading: true }),
  offSell: (t, body = {}) => http.post(a.wallet.offSell + String(t), body, { showLoading: true }),
  sendOtp: (t) => http.post(a.wallet.sendOtp, t, { showLoading: true }),
  verifyOtp: (t) => http.post(a.wallet.verifyOtp, t, { showLoading: true })
};

export const kycApi = {
  one: (t) => http.post(a.LinkUpiKycPartner.one, t, { showLoading: true }),
  two: (t) => http.post(a.LinkUpiKycPartner.two, t, { showLoading: true }),
  check: (t) => http.get(a.LinkUpiKycPartner.check, t),
  three: (t) => http.post(a.LinkUpiKycPartner.three, t, { showLoading: true }),
  getApps: () => http.get(a.LinkUpiKycPartner.GetApps),
  link: (t) => http.post(a.LinkUpiKycPartner.link, t, { showLoading: true }),
  getKycList: (t) => http.get(a.LinkUpiKycPartner.getKycList, t, { showLoading: true }),
  onSell: (t) => http.post(withOptionalId(a.LinkUpiKycPartner.onSell, t), {}, { showLoading: true }),
  offSell: (t) => http.post(withOptionalId(a.LinkUpiKycPartner.offSell, t), {}, { showLoading: true }),
  available: (t) => http.get(a.LinkUpiKycPartner.available, t),
  allAvailable: () => http.get(a.LinkUpiKycPartner.allAvailable),

  // kycApi forwards to walletApi in the original
  getWalletList: (t) => walletApi.getWalletList(t),
  getPayoutWalletList: (t) => walletApi.getPayoutWalletList(t),
  submit: (t) => walletApi.submit(t),
  v2Submit: (t) => walletApi.v2Submit(t),
  changeStatus: (t, e) => walletApi.changeStatus(t, e)
};

export const ctTypeApi = {
  listEnabledCtTypes: (t) => http.get(a.ctType.listEnabledCtTypes, t, { showLoading: true }),
  payoutConfigCheck: (t) => http.get(a.ctType.configCheck, t, { showLoading: true }),
  getCtTypeById: (t, e) => http.get(a.ctType.getById + String(t), e, { showLoading: true })
};

export const orderApi = {
  hangSales: (t) => http.get(a.coverOrder.hangSales, t, { showLoading: true }),
  readySellTrack: (t) => http.get(a.coverOrder.readySellTrack, t, { showLoading: true }),
  createOrder: (t) => http.post(a.coverOrder.createOrder, t, { showLoading: true }),
  createUsdt: (t) => http.post(a.coverOrder.createUsdt, t, { showLoading: true }),
  usdtInfo: (t) => http.get(a.coverOrder.usdtInfo, t, { showLoading: true }),
  usdtHistory: (t) => http.get(a.coverOrder.usdtHistory, t, { showLoading: true }),
  usdtOrderDetail: (id, t) => http.get(a.coverOrder.usdtOrderDetail + String(id), t, { showLoading: true }),
  orderInfo: (t) => http.get(a.coverOrder.orderInfo, t, { showLoading: false }),
  buyHistory: (t) => http.get(a.coverOrder.buyHistory, t, { showLoading: true }),
  orderCancel: (t) => http.post(a.coverOrder.orderCancel, t, { showLoading: true }),
  orderSubmit: (t) => http.post(a.coverOrder.orderSubmit, t, { showLoading: true }),
  summary: (t) => http.get(a.coverOrder.summary, t, { showLoading: true }),
  detail: (t) => http.get(a.order.detail, t, { showLoading: true }),
  nightBonusStatus: (t) => http.get(a.coverOrder.nightBonusStatus, t, { showLoading: false }),
  carouselOrders: (t) => http.get(a.coverOrder.carousel, t, { showLoading: false }),
  heroCarousel: () => http.get(a.heroCarousel, {}, { showLoading: false })
};

export const pointHistoryApi = {
  page: (t) => http.get(a.pointHistory, t, { showLoading: true })
};

export const receiveApi = {
  orderPage: (t) => http.get(a.receive.order, t, { showLoading: true })
};

export const offlineOrderApi = {
  pendingBill: (t) => http.get(a.offlineOrder.pendingBill, t, { showLoading: true }),
  orderCount: (t) => http.get(a.offlineOrder.orderCount, t)
};

export const uploadApi = {
  upload: (t) => http.post(a.upload, t, { showLoading: true }),
  uploadBase64: (t) => http.post(a.uploadBase64, t, { showLoading: true }),
  downloadData: (t) => http.get(a.downloadData, t, { showLoading: true })
};

export const appApi = {
  getLatestAppVersion: (t) => http.get(a.getLatestAppVersion, t),
  getOfficialServiceData: (t) => http.get(a.getOfficialServiceData, t, { showLoading: true })
};

export const missionApi = {
  task: (t) => http.get(a.mission.task, t, { showLoading: true }),
  receive: (t) => http.post(a.mission.receive + t, {}, { showLoading: true })
};

export const activeApi = {
  activeInfo: (t) => http.get(a.active.activeInfo, t, { showLoading: true })
};

export const iTokenHistoryApi = {
  page: (t) => http.get(a.userTokenHistory.page, t, { showLoading: true })
};

export const captchaApi = {
  new: (t) => http.post(a.captcha.new, t, { showLoading: true }),
  newByPost: (t) => http.post(a.captcha.new, t, { showLoading: true }),
  verify: (t) => http.post(a.captcha.verify, t, { showToastOnError: false })
};

export default {
  endpoints: a,
  http,
  userApi,
  homeApi,
  teamApi,
  pointApi,
  myApi,
  kycApi,
  walletApi,
  ctTypeApi,
  orderApi,
  pointHistoryApi,
  receiveApi,
  offlineOrderApi,
  uploadApi,
  appApi,
  missionApi,
  activeApi,
  iTokenHistoryApi,
  captchaApi
};
